// Simplified Art in Room Viewer with Realistic Scaling

// DOM Elements
const roomImageA = document.getElementById('roomImageA');
const artworkFrameEl = document.getElementById('artworkFrame');
const artworkImageEl = document.getElementById('artworkImage');
const artworkImageSoloEl = document.getElementById('artworkImageSolo');

const roomMockupEl = document.getElementById('roomMockup');
const artworkSoloEl = document.getElementById('artworkSolo');

const viewInRoomBtn = document.getElementById('viewInRoomBtn');
const viewArtworkBtn = document.getElementById('viewArtworkBtn');

const artworkSelect = document.getElementById('artworkSelect');
const viewerStatusEl = document.getElementById('viewerStatus');

// State
let activeRoom = ROOM_CONFIG?.[0];
let artworks = [];
let currentArtwork = null;
let activeArtworkLoadToken = 0;
let artworkLoadError = null;

const imagePreloadCache = new Map();
const EMPTY_CROP_INSETS = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

// Core Functions
function getDriveImageUrl(url) {
    if (!url) return '';

    let fileId = null;

    if (url.includes('drive.google.com/uc?')) {
        const match = url.match(/[?&]id=([^&]+)/);
        fileId = match ? match[1] : null;
    } else if (url.includes('drive.google.com/file/d/')) {
        const match = url.match(/\/d\/([^\/]+)/);
        fileId = match ? match[1] : null;
    }

    if (fileId) {
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1800`;
    }

    return url;
}

function setRoom(room) {
    if (!room) return;
    activeRoom = room;
    roomImageA.src = room.roomImage;
    roomImageA.alt = room.label ? `${room.label} room interior` : 'Room interior';
    if (room.imageWidth && room.imageHeight) {
        roomMockupEl.style.setProperty('--room-ar', `${room.imageWidth} / ${room.imageHeight}`);
    }
}

function setArtworkImages(artworkSrc, artworkTitle = 'Artwork') {
    artworkImageEl.src = artworkSrc;
    artworkImageSoloEl.src = artworkSrc;
    artworkImageEl.alt = artworkTitle;
    artworkImageSoloEl.alt = artworkTitle;
}

function setStatus(message, isError = false) {
    if (!viewerStatusEl) return;
    viewerStatusEl.textContent = message || '';
    viewerStatusEl.classList.toggle('is-error', Boolean(isError));
}

function getRequestedArtworkId() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const id = params.get('artworkId');
        return id ? String(id).trim() : '';
    } catch (error) {
        return '';
    }
}

function setViewToggleState(isRoomView) {
    viewInRoomBtn.classList.toggle('active', isRoomView);
    viewArtworkBtn.classList.toggle('active', !isRoomView);

    viewInRoomBtn.setAttribute('aria-pressed', String(isRoomView));
    viewArtworkBtn.setAttribute('aria-pressed', String(!isRoomView));

    roomMockupEl.setAttribute('aria-hidden', String(!isRoomView));
    artworkSoloEl.setAttribute('aria-hidden', String(isRoomView));
}

function clearArtworkDetails() {
    document.getElementById('artworkTitle').textContent = 'No artwork available';
    document.getElementById('artworkMedium').textContent = '—';
    document.getElementById('artworkDimensions').textContent = '—';
    document.getElementById('artworkPrice').textContent = '—';
    document.getElementById('artworkAvailability').textContent = '—';
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function toNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = parseFloat(value.replace(',', '.').replace('%', ''));
        return Number.isFinite(parsed) ? parsed : NaN;
    }
    return NaN;
}

function toFraction(value) {
    const parsed = toNumber(value);
    if (!Number.isFinite(parsed)) return NaN;
    return parsed > 1 ? parsed / 100 : parsed;
}

function normalizeCropInsets(rawInsets) {
    if (!rawInsets || typeof rawInsets !== 'object') return null;

    const top = clamp(toFraction(rawInsets.top), 0, 0.35);
    const right = clamp(toFraction(rawInsets.right), 0, 0.35);
    const bottom = clamp(toFraction(rawInsets.bottom), 0, 0.35);
    const left = clamp(toFraction(rawInsets.left), 0, 0.35);

    if ([top, right, bottom, left].some(v => Number.isNaN(v))) return null;
    if (top + bottom >= 0.8 || left + right >= 0.8) return { ...EMPTY_CROP_INSETS };

    return { top, right, bottom, left };
}

function parseCropInsets(artwork) {
    if (!artwork) return { ...EMPTY_CROP_INSETS };

    const directCrop = artwork.crop || artwork.Crop || artwork['Crop'];
    const normalizedDirectCrop = normalizeCropInsets(directCrop);
    if (normalizedDirectCrop) return normalizedDirectCrop;

    const cropStr = artwork['Crop Insets'] || artwork['cropInsets'];
    if (typeof cropStr === 'string' && cropStr.trim()) {
        const parts = cropStr
            .split(/[;,|\s]+/)
            .map(part => part.trim())
            .filter(Boolean);

        if (parts.length === 4) {
            const normalizedFromString = normalizeCropInsets({
                top: parts[0],
                right: parts[1],
                bottom: parts[2],
                left: parts[3]
            });
            if (normalizedFromString) return normalizedFromString;
        }
    }

    return { ...EMPTY_CROP_INSETS };
}

function applyCropInsets(insets) {
    const safeInsets = normalizeCropInsets(insets) || { ...EMPTY_CROP_INSETS };
    const usableX = Math.max(0.35, 1 - safeInsets.left - safeInsets.right);
    const usableY = Math.max(0.35, 1 - safeInsets.top - safeInsets.bottom);

    const scaleX = 1 / usableX;
    const scaleY = 1 / usableY;
    const shiftX = (scaleX * (safeInsets.right - safeInsets.left)) / 2;
    const shiftY = (scaleY * (safeInsets.bottom - safeInsets.top)) / 2;

    artworkImageEl.style.setProperty('--trim-scale-x', scaleX.toFixed(4));
    artworkImageEl.style.setProperty('--trim-scale-y', scaleY.toFixed(4));
    artworkImageEl.style.setProperty('--trim-shift-x', `${(shiftX * 100).toFixed(3)}%`);
    artworkImageEl.style.setProperty('--trim-shift-y', `${(shiftY * 100).toFixed(3)}%`);
}

function preloadImage(src) {
    if (!src) return Promise.reject(new Error('Missing image source'));
    if (imagePreloadCache.has(src)) return imagePreloadCache.get(src);

    const promise = new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
            resolve({
                src,
                width: img.naturalWidth,
                height: img.naturalHeight
            });
        };
        img.onerror = () => reject(new Error(`Failed to preload image: ${src}`));
        img.src = src;
    });

    imagePreloadCache.set(src, promise);
    promise.catch(() => imagePreloadCache.delete(src));

    return promise;
}

function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

async function swapArtworkAtomically(imageUrl, artwork, artworkTitle, loadToken, imageInfo) {
    artworkImageEl.classList.add('is-swapping');
    artworkImageSoloEl.classList.add('is-swapping');

    await nextFrame();
    await nextFrame();

    if (loadToken !== activeArtworkLoadToken) {
        artworkImageEl.classList.remove('is-swapping');
        artworkImageSoloEl.classList.remove('is-swapping');
        return false;
    }

    // Apply new geometry at the exact moment we swap source.
    applyRealisticPositioning(artworkFrameEl, activeRoom, artwork, imageInfo);
    applyCropInsets(parseCropInsets(artwork));
    setArtworkImages(imageUrl, artworkTitle);

    await nextFrame();

    if (loadToken !== activeArtworkLoadToken) {
        artworkImageEl.classList.remove('is-swapping');
        artworkImageSoloEl.classList.remove('is-swapping');
        return false;
    }

    artworkImageEl.classList.remove('is-swapping');
    artworkImageSoloEl.classList.remove('is-swapping');
    return true;
}

function showInRoom() {
    roomMockupEl.classList.remove('is-hidden');
    artworkSoloEl.classList.add('is-hidden');
    setViewToggleState(true);
}

function showArtwork() {
    roomMockupEl.classList.add('is-hidden');
    artworkSoloEl.classList.remove('is-hidden');
    setViewToggleState(false);
}

function updateArtworkDetails(artwork) {
    document.getElementById('artworkTitle').textContent = artwork.Titel || 'Untitled';
    document.getElementById('artworkMedium').textContent = artwork.Verf || '—';
    document.getElementById('artworkDimensions').textContent = artwork['Maat (HxB) in cm'] ? artwork['Maat (HxB) in cm'] + ' cm' : '—';
    document.getElementById('artworkPrice').textContent = artwork.Prijs || '—';
    document.getElementById('artworkAvailability').textContent = artwork.Beschikbaar === 'Ja' ? 'Available' : 'Not Available';
}

async function loadArtworkData(artwork) {
    currentArtwork = artwork;
    const loadToken = ++activeArtworkLoadToken;

    const imageUrl = getDriveImageUrl(artwork.Image);
    const artworkTitle = artwork.Titel || 'Untitled';
    updateArtworkDetails(artwork);
    setStatus(`Loading "${artworkTitle}"...`);

    if (!imageUrl) {
        setStatus(`Missing image for "${artworkTitle}".`, true);
        return;
    }

    try {
        const imageInfo = await preloadImage(imageUrl);
        if (loadToken !== activeArtworkLoadToken) return;

        const swapped = await swapArtworkAtomically(imageUrl, artwork, artworkTitle, loadToken, imageInfo);
        if (!swapped) return;
        setStatus(`Viewing "${artworkTitle}".`);
    } catch (error) {
        console.warn('Preload failed, falling back to direct swap:', error);
        if (loadToken !== activeArtworkLoadToken) return;
        applyRealisticPositioning(artworkFrameEl, activeRoom, artwork, null);
        applyCropInsets(parseCropInsets(artwork));
        setArtworkImages(imageUrl, artworkTitle);
        setStatus(`Viewing "${artworkTitle}" (image loaded without preload).`);
    }
}

function setupArtworkSelector() {
    if (artworks.length === 0) {
        artworkSelect.innerHTML = '<option value="">No available artworks</option>';
        artworkSelect.disabled = true;
        return;
    }

    artworkSelect.innerHTML = '<option value="">Select an artwork...</option>';
    artworkSelect.disabled = false;

    artworks.forEach((artwork, index) => {
        const option = document.createElement('option');
        option.value = index;

        const title = artwork.Titel || 'Untitled';
        const size = artwork['Maat (HxB) in cm'] || '';

        option.textContent = `${title}${size ? ' (' + size + ' cm)' : ''}`;
        artworkSelect.appendChild(option);
    });

    artworkSelect.addEventListener('change', (e) => {
        const index = parseInt(e.target.value, 10);
        if (!Number.isNaN(index) && artworks[index]) {
            loadArtworkData(artworks[index]);
        }
    });
}

async function loadArtworks() {
    try {
        const response = await fetch('portfolio.json');
        // In some local preview modes (e.g. file://), status can be 0 even when JSON is readable.
        if (!response.ok && response.status !== 0) {
            throw new Error(`Failed to load portfolio.json (${response.status})`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error('Invalid portfolio data format');
        }

        artworks = data.filter(art =>
            art.Image &&
            String(art.Image).trim() !== '' &&
            art.Beschikbaar === 'Ja'
        );
        artworkLoadError = null;

        console.log(`Loaded ${artworks.length} available artworks`);
    } catch (error) {
        console.error('Error loading artworks:', error);
        artworks = [];
        artworkLoadError = 'Could not load artworks. Please try again later.';
    }
}

// Event Listeners
viewInRoomBtn.addEventListener('click', showInRoom);
viewArtworkBtn.addEventListener('click', showArtwork);
artworkImageEl.addEventListener('error', () => {
    if (!currentArtwork) return;
    setStatus(`Could not load image for "${currentArtwork.Titel || 'Untitled'}".`, true);
});
artworkImageSoloEl.addEventListener('error', () => {
    if (!currentArtwork) return;
    setStatus(`Could not load image for "${currentArtwork.Titel || 'Untitled'}".`, true);
});

// Initialize
async function init() {
    setStatus('Loading artworks...');
    await loadArtworks();

    if (activeRoom) {
        setRoom(activeRoom);
    }

    setupArtworkSelector();

    if (artworks.length > 0) {
        const requestedArtworkId = getRequestedArtworkId();
        const requestedArtwork = requestedArtworkId
            ? artworks.find(art => String(art.ID) === requestedArtworkId)
            : null;

        const initialArtwork = requestedArtwork || artworks[0];
        const initialIndex = artworks.indexOf(initialArtwork);

        artworkSelect.value = String(initialIndex >= 0 ? initialIndex : 0);
        await loadArtworkData(initialArtwork);
    } else {
        clearArtworkDetails();
        viewInRoomBtn.disabled = true;
        viewArtworkBtn.disabled = true;
        setStatus(artworkLoadError || 'No available artworks right now.', true);
    }

    showInRoom();

    console.log('Room viewer initialized with realistic scaling ✓');
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);

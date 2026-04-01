// Gallery state
let galleryArtworks = [];
let currentGalleryIndex = 0;
let allPortfolioArtworks = [];
let galleryViewMode = 'artwork';

const ROOM_PREVIEW_CONFIG = {
    backgroundImage: 'rooms/living-room-background.png',
    imageWidth: 1536,
    imageHeight: 1024,
    panel: {
        left: 197,
        top: 187,
        width: 888,
        height: 246
    },
    realWorld: {
        panelWidthCm: 240,
        panelHeightCm: 92
    },
    hangOffset: {
        xPct: 0.14,
        yPct: 0.18
    }
};

const COLOUR_RULES = [
    { value: 'blue', label: 'Blue', patterns: [/\bblue\b/i, /\bblauw\b/i, /turq?oise/i, /light blue/i, /bluem/i] },
    { value: 'green', label: 'Green', patterns: [/\bgreen\b/i, /\bgroen\b/i, /\bgree+n?\b/i] },
    { value: 'red', label: 'Red', patterns: [/\bred\b/i, /\brood\b/i] },
    { value: 'yellow', label: 'Yellow', patterns: [/\byellow\b/i, /\bgeel\b/i] },
    { value: 'orange', label: 'Orange', patterns: [/\borange\b/i, /\boranje\b/i, /\bzalm\b/i] },
    { value: 'brown', label: 'Brown', patterns: [/\bbrown\b/i, /\bbruin\b/i] },
    { value: 'purple', label: 'Purple', patterns: [/\bpurple\b/i, /\bpaars\b/i, /\blilac\b/i] },
    { value: 'pink', label: 'Pink', patterns: [/\bpink\b/i, /\broze\b/i, /\brose\b/i] },
    { value: 'black', label: 'Black', patterns: [/\bblack\b/i, /\bzwart\b/i] },
    { value: 'white', label: 'White', patterns: [/\bwhite\b/i, /\bwit\b/i, /\bcream\b/i] },
    { value: 'grey', label: 'Grey', patterns: [/\bgrey\b/i, /\bgrijs\b/i] },
    { value: 'beige', label: 'Beige', patterns: [/\bbeige\b/i] },
    { value: 'gold', label: 'Gold', patterns: [/\bgold\b/i] }
];

function getPortfolioMode() {
    const mode = document.body?.dataset.portfolioMode;
    if (!mode) return null;
    return mode === 'all' ? 'all' : 'home';
}

// Convert Google Drive URL to direct image URL
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
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
    }

    return url;
}

function parseDimensions(sizeStr) {
    if (!sizeStr) return { height: 0, width: 0, longestSide: 0 };
    const match = String(sizeStr).match(/(\d+)\s*x\s*(\d+)/i);
    if (!match) return { height: 0, width: 0, longestSide: 0 };

    const height = parseInt(match[1], 10) || 0;
    const width = parseInt(match[2], 10) || 0;

    return {
        height,
        width,
        longestSide: Math.max(height, width)
    };
}

function parseRoomDisplayDimensions(sizeStr, artwork) {
    const dims = parseDimensions(sizeStr);
    if (!dims.height || !dims.width) return { width: 0, height: 0 };

    const sizeFormatRaw = artwork?.['Size Format'] || artwork?.sizeFormat || artwork?.['Maat formaat'];
    const sizeFormat = String(sizeFormatRaw || '').trim().toUpperCase();

    if (sizeFormat === 'BXH') {
        return {
            width: dims.height,
            height: dims.width
        };
    }

    return {
        width: dims.width,
        height: dims.height
    };
}

function getSizeBucket(sizeStr) {
    const { longestSide } = parseDimensions(sizeStr);
    if (!longestSide) return 'unknown';
    if (longestSide <= 60) return 'small';
    if (longestSide <= 100) return 'medium';
    return 'large';
}

function getArtworkColours(rawColours) {
    const raw = String(rawColours || '').toLowerCase();
    if (!raw.trim()) return [];

    return COLOUR_RULES
        .filter(rule => rule.patterns.some(pattern => pattern.test(raw)))
        .map(rule => rule.value);
}

function sortByHeightDesc(artworks) {
    return [...artworks].sort((a, b) => {
        const aHeight = parseDimensions(a['Maat (HxB) in cm']).height;
        const bHeight = parseDimensions(b['Maat (HxB) in cm']).height;
        return bHeight - aHeight;
    });
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function ensureModalViewButton() {
    const caption = document.getElementById('fullscreenCaption');
    if (!caption) return null;

    let button = document.getElementById('viewInRoomModalBtn');
    if (!button) {
        button = document.createElement('a');
        button.id = 'viewInRoomModalBtn';
        button.className = 'view-in-room-modal-btn';
        button.href = '#';
        button.textContent = 'View in Room';
        caption.appendChild(button);
    }

    button.setAttribute('role', 'button');

    if (!button.dataset.bound) {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            if (!galleryArtworks.length) return;
            setGalleryViewMode(galleryViewMode === 'room' ? 'artwork' : 'room');
        });
        button.dataset.bound = 'true';
    }

    return button;
}

function ensureRoomPreviewElements() {
    const fullscreenContent = document.querySelector('.fullscreen-content');
    const caption = document.getElementById('fullscreenCaption');
    if (!fullscreenContent || !caption) return null;

    let roomView = document.getElementById('fullscreenRoomView');
    if (!roomView) {
        roomView = document.createElement('div');
        roomView.id = 'fullscreenRoomView';
        roomView.className = 'fullscreen-room-view';

        const roomBackground = document.createElement('img');
        roomBackground.id = 'fullscreenRoomBg';
        roomBackground.className = 'fullscreen-room-bg';
        roomBackground.alt = 'Room preview';
        roomBackground.src = ROOM_PREVIEW_CONFIG.backgroundImage;

        const roomFrame = document.createElement('div');
        roomFrame.id = 'fullscreenRoomFrame';
        roomFrame.className = 'fullscreen-room-frame';

        const roomArt = document.createElement('img');
        roomArt.id = 'fullscreenRoomArt';
        roomArt.className = 'fullscreen-room-art';
        roomArt.alt = 'Artwork in room';

        roomFrame.appendChild(roomArt);
        roomView.appendChild(roomBackground);
        roomView.appendChild(roomFrame);
        fullscreenContent.insertBefore(roomView, caption);
    }

    return {
        roomView,
        roomFrame: document.getElementById('fullscreenRoomFrame'),
        roomArt: document.getElementById('fullscreenRoomArt'),
        roomBackground: document.getElementById('fullscreenRoomBg')
    };
}

function getRoomPreviewPlacement(artwork) {
    const dims = parseRoomDisplayDimensions(artwork?.['Maat (HxB) in cm'], artwork);
    const widthCm = dims.width;
    const heightCm = dims.height;

    if (!Number.isFinite(widthCm) || !Number.isFinite(heightCm) || widthCm <= 0 || heightCm <= 0) {
        return { left: 42, top: 34, width: 16, height: 18 };
    }

    const panel = ROOM_PREVIEW_CONFIG.panel;
    const pxPerCm = panel.width / ROOM_PREVIEW_CONFIG.realWorld.panelWidthCm;
    const artWpx = widthCm * pxPerCm;
    const artHpx = heightCm * pxPerCm;

    const offsetX = panel.width * (ROOM_PREVIEW_CONFIG.hangOffset?.xPct || 0);
    const offsetY = panel.height * (ROOM_PREVIEW_CONFIG.hangOffset?.yPct || 0);

    // Reserve part of the offset headroom so artworks remain visually larger.
    const reserveFactor = 1.0;
    const maxUsableWidth = Math.max(panel.width * 0.2, panel.width - (Math.abs(offsetX) * reserveFactor));
    const maxUsableHeight = Math.max(panel.height * 0.2, panel.height - (Math.abs(offsetY) * reserveFactor));

    const scale = Math.min(
        maxUsableWidth / artWpx,
        maxUsableHeight / artHpx,
        1
    );

    const finalW = artWpx * scale;
    const finalH = artHpx * scale;

    const centeredX = panel.left + (panel.width - finalW) / 2;
    const centeredY = panel.top + (panel.height - finalH) / 2;

    const x = clamp(centeredX + offsetX, panel.left, panel.left + panel.width - finalW);
    const y = clamp(centeredY + offsetY, panel.top, panel.top + panel.height - finalH);

    return {
        left: (x / ROOM_PREVIEW_CONFIG.imageWidth) * 100,
        top: (y / ROOM_PREVIEW_CONFIG.imageHeight) * 100,
        width: (finalW / ROOM_PREVIEW_CONFIG.imageWidth) * 100,
        height: (finalH / ROOM_PREVIEW_CONFIG.imageHeight) * 100
    };
}

function renderRoomPreview(artwork) {
    const elements = ensureRoomPreviewElements();
    if (!elements || !artwork) return;

    const placement = getRoomPreviewPlacement(artwork);

    elements.roomBackground.src = ROOM_PREVIEW_CONFIG.backgroundImage;
    elements.roomArt.src = getDriveImageUrl(artwork.Image);
    elements.roomArt.alt = artwork.Titel || 'Artwork in room';

    elements.roomFrame.style.setProperty('--room-art-left', `${placement.left.toFixed(3)}%`);
    elements.roomFrame.style.setProperty('--room-art-top', `${placement.top.toFixed(3)}%`);
    elements.roomFrame.style.setProperty('--room-art-width', `${placement.width.toFixed(3)}%`);
    elements.roomFrame.style.setProperty('--room-art-height', `${placement.height.toFixed(3)}%`);
}

function setGalleryViewMode(mode) {
    const fullscreenImage = document.getElementById('fullscreenImage');
    const button = ensureModalViewButton();
    const elements = ensureRoomPreviewElements();

    galleryViewMode = mode === 'room' ? 'room' : 'artwork';

    if (galleryViewMode === 'room' && galleryArtworks[currentGalleryIndex]) {
        renderRoomPreview(galleryArtworks[currentGalleryIndex]);
    }

    if (fullscreenImage) {
        fullscreenImage.classList.toggle('is-hidden', galleryViewMode === 'room');
    }

    if (elements?.roomView) {
        elements.roomView.classList.toggle('is-active', galleryViewMode === 'room');
    }

    if (button) {
        button.textContent = galleryViewMode === 'room' ? 'View Artwork' : 'View in Room';
        button.setAttribute('aria-pressed', String(galleryViewMode === 'room'));
    }
}

function updatePortfolioResultCount(count) {
    const results = document.getElementById('portfolio-results');
    if (!results) return;

    results.textContent = `${count} werk${count === 1 ? '' : 'en'} getoond`;
}

function renderPortfolioGrid(artworks) {
    const grid = document.getElementById('portfolio-grid');
    if (!grid) return;

    grid.innerHTML = '';
    galleryArtworks = artworks;

    if (!artworks.length) {
        grid.innerHTML = '<p style="text-align: left; padding: 1rem 0;">No works match the selected filters.</p>';
        updatePortfolioResultCount(0);
        return;
    }

    artworks.forEach((artwork, index) => {
        const figure = document.createElement('figure');
        figure.className = 'portfolio-item';

        const link = document.createElement('a');
        link.href = '#';
        link.className = 'portfolio-link';
        link.onclick = (e) => {
            e.preventDefault();
            openGallery(index);
        };

        const img = document.createElement('img');
        img.src = getDriveImageUrl(artwork.Image);
        img.alt = artwork.Titel || `Artwork ${artwork.ID}`;
        img.loading = 'lazy';

        const caption = document.createElement('figcaption');

        const titleSpan = document.createElement('div');
        titleSpan.className = 'overlay-title';
        titleSpan.textContent = artwork.Titel || 'Untitled';

        const sizeSpan = document.createElement('div');
        sizeSpan.className = 'overlay-size';
        sizeSpan.textContent = artwork['Maat (HxB) in cm'] ? `${artwork['Maat (HxB) in cm']} cm` : '';

        caption.appendChild(titleSpan);
        caption.appendChild(sizeSpan);

        link.appendChild(img);
        link.appendChild(caption);
        figure.appendChild(link);
        grid.appendChild(figure);
    });

    initializeLazyLoading();
    updatePortfolioResultCount(artworks.length);
}

function addCheckboxOption(panelId, value, label) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const lbl = document.createElement('label');
    lbl.className = 'dropdown-option';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = value;
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + label));
    panel.appendChild(lbl);
}

function populateColourFilter(artworks) {
    const values = new Set();
    artworks.forEach(artwork => {
        getArtworkColours(artwork.Kleuren).forEach(colour => values.add(colour));
    });
    COLOUR_RULES.forEach(rule => {
        if (!values.has(rule.value)) return;
        addCheckboxOption('colorPanel', rule.value, rule.label);
    });
}

function populateThemeFilter(artworks) {
    const themes = [...new Set(
        artworks
            .map(artwork => String(artwork.Thema || '').trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    themes.forEach(theme => {
        addCheckboxOption('themePanel', theme, theme);
    });
}

function getCheckedValues(dropdownId) {
    const panel = document.querySelector('#' + dropdownId + ' .dropdown-panel');
    if (!panel) return [];
    return Array.from(panel.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

function updateDropdownLabel(dropdownId, allLabel) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    const checked = getCheckedValues(dropdownId);
    const trigger = dropdown.querySelector('.dropdown-trigger');
    if (checked.length === 0) {
        trigger.textContent = allLabel;
        trigger.classList.remove('has-selection');
    } else {
        const labels = Array.from(dropdown.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.closest('label').textContent.trim());
        trigger.textContent = labels.join(', ');
        trigger.classList.add('has-selection');
    }
}

function applyPortfolioFilters() {
    if (getPortfolioMode() !== 'all') return;

    const sizeValues = getCheckedValues('sizeDropdown');
    const colourValues = getCheckedValues('colorDropdown');
    const themeValues = getCheckedValues('themeDropdown');

    const filtered = allPortfolioArtworks.filter(artwork => {
        const sizeMatch = sizeValues.length === 0 || sizeValues.includes(getSizeBucket(artwork['Maat (HxB) in cm']));
        const colourMatch = colourValues.length === 0 || colourValues.some(c => getArtworkColours(artwork.Kleuren).includes(c));
        const themeMatch = themeValues.length === 0 || themeValues.includes(String(artwork.Thema || '').trim());
        return sizeMatch && colourMatch && themeMatch;
    });

    renderPortfolioGrid(filtered);
}

function setupCustomDropdown(dropdownId, allLabel) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown || dropdown.dataset.bound) return;
    dropdown.dataset.bound = 'true';

    const trigger = dropdown.querySelector('.dropdown-trigger');
    const panel = dropdown.querySelector('.dropdown-panel');

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('open');
        document.querySelectorAll('.custom-dropdown.open').forEach(d => d.classList.remove('open'));
        if (!isOpen) dropdown.classList.add('open');
        trigger.setAttribute('aria-expanded', !isOpen);
    });

    panel.addEventListener('change', () => {
        updateDropdownLabel(dropdownId, allLabel);
        applyPortfolioFilters();
    });
}

function setupPortfolioFilters() {
    if (getPortfolioMode() !== 'all') return;

    setupCustomDropdown('sizeDropdown', 'Alle maten');
    setupCustomDropdown('colorDropdown', 'Alle kleuren');
    setupCustomDropdown('themeDropdown', "Alle thema's");

    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-dropdown.open').forEach(d => {
            d.classList.remove('open');
            d.querySelector('.dropdown-trigger').setAttribute('aria-expanded', 'false');
        });
    });

    const resetBtn = document.getElementById('resetFilters');
    if (resetBtn && !resetBtn.dataset.bound) {
        resetBtn.addEventListener('click', () => {
            ['sizeDropdown', 'colorDropdown', 'themeDropdown'].forEach(id => {
                const dropdown = document.getElementById(id);
                if (!dropdown) return;
                dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            });
            updateDropdownLabel('sizeDropdown', 'Alle maten');
            updateDropdownLabel('colorDropdown', 'Alle kleuren');
            updateDropdownLabel('themeDropdown', "Alle thema's");
            history.replaceState(null, '', window.location.pathname);
            applyPortfolioFilters();
        });
        resetBtn.dataset.bound = 'true';
    }
}

// Load portfolio data from JSON
async function loadPortfolio() {
    if (!getPortfolioMode()) return;
    const grid = document.getElementById('portfolio-grid');
    if (!grid) return;

    try {
        const response = await fetch('portfolio.json');
        const artworks = await response.json();

        const artworksWithImages = artworks.filter(art => art.Image && String(art.Image).trim() !== '');

        if (getPortfolioMode() === 'all') {
            allPortfolioArtworks = sortByHeightDesc(artworksWithImages);
            populateColourFilter(allPortfolioArtworks);
            populateThemeFilter(allPortfolioArtworks);
            setupPortfolioFilters();
            // Apply URL theme param after options are populated
            const urlTheme = new URLSearchParams(window.location.search).get('theme');
            if (urlTheme) {
                const themePanel = document.getElementById('themePanel');
                if (themePanel) {
                    const cb = themePanel.querySelector(`input[value="${CSS.escape(urlTheme)}"]`);
                    if (cb) {
                        cb.checked = true;
                        updateDropdownLabel('themeDropdown', "Alle thema's");
                    }
                }
            }
            applyPortfolioFilters();
            console.log(`Loaded ${allPortfolioArtworks.length} artworks (all)`);
            return;
        }

        let featuredArtworks = artworksWithImages.filter(art =>
            art.Beschikbaar === 'Ja' &&
            (art['Kwaliteit A/B/C/D'] === 'A' || art['Kwaliteit A/B/C/D'] === 'B')
        );

        featuredArtworks = sortByHeightDesc(featuredArtworks);
        featuredArtworks = featuredArtworks.slice(0, 12);

        renderPortfolioGrid(featuredArtworks);
        console.log(`Loaded ${featuredArtworks.length} artworks (home)`);
    } catch (error) {
        console.error('Error loading portfolio:', error);
        grid.innerHTML = '<p style="text-align: left; padding: 1rem 0;">Error loading portfolio. Please check the console.</p>';
    }
}

// Toggle navigation overlay
function toggleNav() {
    const nav = document.getElementById('nav-overlay');
    if (!nav) return;

    if (nav.classList.contains('active')) {
        nav.classList.remove('active');
    } else {
        nav.classList.add('active');
    }
}

// Smooth scroll functionality
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (!href || href === '#') return;

        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Lazy loading for images
function initializeLazyLoading() {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.classList.add('loaded');
                observer.unobserve(img);
            }
        });
    }, {
        rootMargin: '50px'
    });

    document.querySelectorAll('.portfolio-item img').forEach(img => {
        imageObserver.observe(img);
    });
}

// Back to top button functionality
window.addEventListener('scroll', () => {
    const btn = document.getElementById('backToTop');
    if (!btn) return;

    const scrolled = window.pageYOffset;

    if (scrolled > 300) {
        btn.classList.add('visible');
    } else {
        btn.classList.remove('visible');
    }
});

// Smooth scroll to top
document.getElementById('backToTop')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// Gallery functions
function openGallery(index) {
    if (!galleryArtworks.length) return;

    const modal = document.getElementById('fullscreenModal');
    if (!modal) return;

    currentGalleryIndex = index;
    updateGalleryContent();
    setGalleryViewMode('artwork');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('fullscreenModal');
    if (!modal) return;

    setGalleryViewMode('artwork');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

function showPrevious() {
    currentGalleryIndex = (currentGalleryIndex - 1 + galleryArtworks.length) % galleryArtworks.length;
    updateGalleryContent();
}

function showNext() {
    currentGalleryIndex = (currentGalleryIndex + 1) % galleryArtworks.length;
    updateGalleryContent();
}

function updateGalleryContent() {
    const artwork = galleryArtworks[currentGalleryIndex];
    if (!artwork) return;

    const fullscreenImage = document.getElementById('fullscreenImage');
    const captionTitle = document.getElementById('captionTitle');
    const captionSize = document.getElementById('captionSize');
    const viewInRoomModalBtn = ensureModalViewButton();
    if (!fullscreenImage || !captionTitle || !captionSize) return;

    fullscreenImage.src = getDriveImageUrl(artwork.Image);
    captionTitle.textContent = artwork.Titel || 'Untitled';
    captionSize.textContent = artwork['Maat (HxB) in cm'] ? `${artwork['Maat (HxB) in cm']} cm` : '';

    if (viewInRoomModalBtn) {
        viewInRoomModalBtn.setAttribute('aria-label', `View ${artwork.Titel || 'artwork'} in room`);
    }

    if (galleryViewMode === 'room') {
        renderRoomPreview(artwork);
    }
}

// Modal close on background click
document.addEventListener('click', function(e) {
    const modal = document.getElementById('fullscreenModal');
    if (e.target === modal) {
        closeModal();
    }
});

// Keyboard navigation
document.addEventListener('keydown', function(e) {
    const modal = document.getElementById('fullscreenModal');
    if (modal && modal.classList.contains('active')) {
        if (e.key === 'Escape') closeModal();
        if (e.key === 'ArrowLeft') showPrevious();
        if (e.key === 'ArrowRight') showNext();
    }
});

// Load portfolio when page loads
document.addEventListener('DOMContentLoaded', () => {
    ensureModalViewButton();
    ensureRoomPreviewElements();
    loadPortfolio();
});

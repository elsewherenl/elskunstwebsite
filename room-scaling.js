// Realistic artwork scaling logic

function solveLinearSystem(matrix, vector) {
    const n = vector.length;
    const a = matrix.map((row, i) => row.concat([vector[i]]));

    for (let i = 0; i < n; i += 1) {
        let pivotRow = i;
        let pivotAbs = Math.abs(a[i][i]);

        for (let row = i + 1; row < n; row += 1) {
            const candidateAbs = Math.abs(a[row][i]);
            if (candidateAbs > pivotAbs) {
                pivotAbs = candidateAbs;
                pivotRow = row;
            }
        }

        if (pivotAbs < 1e-12) return null;

        if (pivotRow !== i) {
            const tmp = a[i];
            a[i] = a[pivotRow];
            a[pivotRow] = tmp;
        }

        const pivot = a[i][i];
        for (let col = i; col <= n; col += 1) {
            a[i][col] /= pivot;
        }

        for (let row = 0; row < n; row += 1) {
            if (row === i) continue;
            const factor = a[row][i];
            if (Math.abs(factor) < 1e-12) continue;
            for (let col = i; col <= n; col += 1) {
                a[row][col] -= factor * a[i][col];
            }
        }
    }

    return a.map(row => row[n]);
}

function computeHomography(srcPoints, dstPoints) {
    if (!Array.isArray(srcPoints) || !Array.isArray(dstPoints) || srcPoints.length !== 4 || dstPoints.length !== 4) {
        return null;
    }

    const matrix = [];
    const vector = [];

    for (let i = 0; i < 4; i += 1) {
        const src = srcPoints[i];
        const dst = dstPoints[i];

        matrix.push([src.x, src.y, 1, 0, 0, 0, -dst.x * src.x, -dst.x * src.y]);
        vector.push(dst.x);

        matrix.push([0, 0, 0, src.x, src.y, 1, -dst.y * src.x, -dst.y * src.y]);
        vector.push(dst.y);
    }

    const solution = solveLinearSystem(matrix, vector);
    if (!solution) return null;

    return {
        a: solution[0],
        b: solution[1],
        c: solution[2],
        d: solution[3],
        e: solution[4],
        f: solution[5],
        g: solution[6],
        h: solution[7]
    };
}

function homographyToCssMatrix3d(h) {
    if (!h) return null;

    const values = [
        h.a, h.d, 0, h.g,
        h.b, h.e, 0, h.h,
        0, 0, 1, 0,
        h.c, h.f, 0, 1
    ];

    return `matrix3d(${values.map(v => (Number.isFinite(v) ? Number(v.toFixed(10)) : 0)).join(',')})`;
}

function getPanelQuad(room) {
    if (!room || !room.panel) return null;

    const panel = room.panel;
    const quad = room.panelQuad;

    if (quad && quad.topLeft && quad.topRight && quad.bottomRight && quad.bottomLeft) {
        return {
            topLeft: { x: quad.topLeft.x, y: quad.topLeft.y },
            topRight: { x: quad.topRight.x, y: quad.topRight.y },
            bottomRight: { x: quad.bottomRight.x, y: quad.bottomRight.y },
            bottomLeft: { x: quad.bottomLeft.x, y: quad.bottomLeft.y }
        };
    }

    return {
        topLeft: { x: panel.left, y: panel.top },
        topRight: { x: panel.left + panel.width, y: panel.top },
        bottomRight: { x: panel.left + panel.width, y: panel.top + panel.height },
        bottomLeft: { x: panel.left, y: panel.top + panel.height }
    };
}

function interpolateQuadPoint(quad, u, v) {
    const topX = (1 - u) * quad.topLeft.x + u * quad.topRight.x;
    const topY = (1 - u) * quad.topLeft.y + u * quad.topRight.y;
    const bottomX = (1 - u) * quad.bottomLeft.x + u * quad.bottomRight.x;
    const bottomY = (1 - u) * quad.bottomLeft.y + u * quad.bottomRight.y;

    return {
        x: (1 - v) * topX + v * bottomX,
        y: (1 - v) * topY + v * bottomY
    };
}

function computePerspectiveTransform(room, position) {
    if (!room || !room.panel || !position) return null;

    const panel = room.panel;
    const quad = getPanelQuad(room);
    if (!quad) return null;

    const u0 = (position.leftPx - panel.left) / panel.width;
    const v0 = (position.topPx - panel.top) / panel.height;
    const u1 = (position.leftPx + position.widthPx - panel.left) / panel.width;
    const v1 = (position.topPx + position.heightPx - panel.top) / panel.height;

    const dstTopLeft = interpolateQuadPoint(quad, u0, v0);
    const dstTopRight = interpolateQuadPoint(quad, u1, v0);
    const dstBottomRight = interpolateQuadPoint(quad, u1, v1);
    const dstBottomLeft = interpolateQuadPoint(quad, u0, v1);

    const srcLocal = [
        { x: 0, y: 0 },
        { x: position.widthPx, y: 0 },
        { x: position.widthPx, y: position.heightPx },
        { x: 0, y: position.heightPx }
    ];

    const dstLocal = [
        { x: dstTopLeft.x - position.leftPx, y: dstTopLeft.y - position.topPx },
        { x: dstTopRight.x - position.leftPx, y: dstTopRight.y - position.topPx },
        { x: dstBottomRight.x - position.leftPx, y: dstBottomRight.y - position.topPx },
        { x: dstBottomLeft.x - position.leftPx, y: dstBottomLeft.y - position.topPx }
    ];

    const homography = computeHomography(srcLocal, dstLocal);
    return homographyToCssMatrix3d(homography);
}

function calculateRealisticPosition(room, artworkWidthCm, artworkHeightCm) {
    if (!room || !room.panel || !room.realWorld) {
        console.error('Invalid room configuration');
        return null;
    }

    // Step 1: Calculate px per cm
    const pxPerCm = room.panel.width / room.realWorld.panelWidthCm;

    // Step 2: Artwork size in px (from real dimensions)
    const artWpx = artworkWidthCm * pxPerCm;
    const artHpx = artworkHeightCm * pxPerCm;

    const offsetCfg = room.hangOffset || {};
    const offsetX = Number.isFinite(offsetCfg.xPct) ? room.panel.width * offsetCfg.xPct : 0;
    const offsetY = Number.isFinite(offsetCfg.yPct) ? room.panel.height * offsetCfg.yPct : 0;

    // Reserve part of the offset headroom so artworks remain visually larger.
    const reserveFactor = 1.0;
    const maxUsableWidth = Math.max(room.panel.width * 0.2, room.panel.width - (Math.abs(offsetX) * reserveFactor));
    const maxUsableHeight = Math.max(room.panel.height * 0.2, room.panel.height - (Math.abs(offsetY) * reserveFactor));

    // Step 3: Constrain to panel (never exceed)
    const scale = Math.min(
        maxUsableWidth / artWpx,
        maxUsableHeight / artHpx,
        1 // Never enlarge beyond true scale
    );

    const finalW = artWpx * scale;
    const finalH = artHpx * scale;

    // Step 4: Position centered on panel, then apply optional focal offset.
    const centerX = room.panel.left + (room.panel.width - finalW) / 2;
    const centerY = room.panel.top + (room.panel.height - finalH) / 2;

    const minX = room.panel.left;
    const maxX = room.panel.left + room.panel.width - finalW;
    const minY = room.panel.top;
    const maxY = room.panel.top + room.panel.height - finalH;

    const x = Math.min(maxX, Math.max(minX, centerX + offsetX));
    const y = Math.min(maxY, Math.max(minY, centerY + offsetY));

    // Step 5: Convert to percentages for responsive CSS
    const leftPct = (x / room.imageWidth) * 100;
    const topPct = (y / room.imageHeight) * 100;
    const wPct = (finalW / room.imageWidth) * 100;
    const hPct = (finalH / room.imageHeight) * 100;

    return {
        leftPx: x,
        topPx: y,
        widthPx: finalW,
        heightPx: finalH,
        left: leftPct,
        top: topPct,
        width: wPct,
        height: hPct,
        actualSizeCm: {
            width: finalW / pxPerCm,
            height: finalH / pxPerCm
        },
        scale: scale
    };
}

function getAspectMismatch(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return Number.POSITIVE_INFINITY;
    return Math.abs(Math.log(a) - Math.log(b));
}

// Parse artwork dimensions from the size field.
// Default is HxB (as documented in the data field name).
// Optional per-artwork override: set "Size Format" (or sizeFormat) to "BxH".
function parseArtworkDimensions(sizeStr, artwork) {
    if (!sizeStr) return null;

    const match = String(sizeStr).match(/(\d+(?:[\.,]\d+)?)\s*x\s*(\d+(?:[\.,]\d+)?)/i);
    if (!match) return null;

    const first = parseFloat(match[1].replace(',', '.'));
    const second = parseFloat(match[2].replace(',', '.'));

    if (!Number.isFinite(first) || !Number.isFinite(second) || first <= 0 || second <= 0) {
        return null;
    }

    // Candidate A: documented semantics HxB => height=first, width=second.
    const asHxB = { widthCm: second, heightCm: first, parseMode: 'HxB' };
    // Candidate B: explicit override BxH => width=first, height=second.
    const asBxH = { widthCm: first, heightCm: second, parseMode: 'BxH' };

    const sizeFormatRaw = artwork?.['Size Format'] || artwork?.sizeFormat || artwork?.['Maat formaat'];
    const sizeFormat = String(sizeFormatRaw || '').trim().toUpperCase();
    if (sizeFormat === 'BXH') {
        return asBxH;
    }

    return asHxB;
}

// Apply positioning to artwork frame element
function applyRealisticPositioning(artworkFrameEl, room, artwork, imageInfo) {
    const dims = parseArtworkDimensions(artwork['Maat (HxB) in cm'], artwork);

    if (!dims) {
        console.warn('Could not parse artwork dimensions:', artwork['Maat (HxB) in cm']);
        // Fallback to center with default size
        artworkFrameEl.style.setProperty('--l', '30%');
        artworkFrameEl.style.setProperty('--t', '25%');
        artworkFrameEl.style.setProperty('--w', '25%');
        artworkFrameEl.style.setProperty('--h', '20%');
        artworkFrameEl.style.setProperty('--frame-transform', 'none');
        return;
    }

    const position = calculateRealisticPosition(room, dims.widthCm, dims.heightCm);

    if (!position) {
        console.error('Could not calculate position');
        artworkFrameEl.style.setProperty('--frame-transform', 'none');
        return;
    }

    artworkFrameEl.style.setProperty('--l', position.left.toFixed(3) + '%');
    artworkFrameEl.style.setProperty('--t', position.top.toFixed(3) + '%');
    artworkFrameEl.style.setProperty('--w', position.width.toFixed(3) + '%');
    artworkFrameEl.style.setProperty('--h', position.height.toFixed(3) + '%');

    const perspectiveTransform = computePerspectiveTransform(room, position);
    if (perspectiveTransform) {
        artworkFrameEl.style.setProperty('--frame-transform', perspectiveTransform);
    } else {
        artworkFrameEl.style.setProperty('--frame-transform', 'none');
    }

    console.log(
        `Artwork: ${dims.widthCm}×${dims.heightCm} cm (${dims.parseMode}) | ` +
        `Displayed: ${position.actualSizeCm.width.toFixed(1)}×${position.actualSizeCm.height.toFixed(1)} cm | ` +
        `Scale: ${(position.scale * 100).toFixed(1)}%`
    );
}

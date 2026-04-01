// Room configuration for art-in-room mockup viewer
// Realistic scaling based on actual dimensions

const ROOM_CONFIG = [
    {
        id: 'living-room-close',
        label: 'Living Room Close View',
        roomImage: 'rooms/living-room-background.png',
        orientation: 'landscape',

        // Room image dimensions
        imageWidth: 1536,  // px
        imageHeight: 1024, // px

        // Wall panel bounding box (in pixels)
        panel: {
            left: 197,  // px from left edge
            top: 187,   // px from top edge
            width: 888, // px
            height: 246 // px
        },

        // Optional 4-point panel shape for perspective mapping.
        // Coordinates derived from designer markup, scaled to 1536x1024.
        panelQuad: {
            topLeft: { x: 197, y: 187 },
            topRight: { x: 1085, y: 187 },
            bottomRight: { x: 1085, y: 433 },
            bottomLeft: { x: 197, y: 433 }
        },

        // Real-world panel dimensions (for scaling)
        realWorld: {
            panelWidthCm: 240,  // cm
            panelHeightCm: 92   // cm
        },

        // Visual focal-point adjustment relative to panel size.
        // Positive x moves artwork right, positive y moves artwork down.
        hangOffset: {
            xPct: 0.14,
            yPct: 0.18
        }
    }
];

// To add a new room:
// 1. Add your room image to the 'rooms/' folder
// 2. Measure the blank frame coordinates in your image editing software
// 3. Convert pixel coordinates to percentages:
//    - frameTop = (top_pixel / image_height) * 100
//    - frameLeft = (left_pixel / image_width) * 100
//    - frameWidth = (frame_width_pixels / image_width) * 100
//    - frameHeight = (frame_height_pixels / image_height) * 100
// 4. Add a new room object to the ROOM_CONFIG array above

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ROOM_CONFIG };
}

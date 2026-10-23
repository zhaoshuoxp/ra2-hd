export function loadingLayout(width: number, height: number, sourceWidth = 800, sourceHeight = 600) {
    // The original country illustration contains meaningful art at every edge.
    // Keep it in the same safe area as the live labels and progress controls.
    const cover = Math.min(width / sourceWidth, height / sourceHeight);
    const contentScale = Math.min(width / 800, height / 600);
    const contentWidth = Math.max(800, width / contentScale);
    return {
        cover, x: (width - sourceWidth * cover) / 2, y: (height - sourceHeight * cover) / 2,
        contentScale, contentWidth, contentX: 0, contentY: (height - 600 * contentScale) / 2,
    };
}

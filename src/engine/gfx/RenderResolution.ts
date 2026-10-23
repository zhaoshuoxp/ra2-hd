export const renderResolutions = ['original', 'native', '720p', '1080p', '1440p', '4k'] as const;
export type RenderResolution = typeof renderResolutions[number];

export function parseRenderResolution(value?: string): RenderResolution {
    return renderResolutions.includes(value as RenderResolution) ? value as RenderResolution : 'native';
}

// Height-based presets preserve the usable display aspect, including 16:10.
// Bound the main color/depth allocation as well as individual GPU dimensions.
export const MAX_RENDER_PIXELS = 16_777_216;
export const MAX_RENDER_SIDE = 8192;
export function renderOutput(width: number, height: number, resolution: RenderResolution,
    deviceRatio: number, maxWidth = MAX_RENDER_SIDE, maxHeight = MAX_RENDER_SIDE) {
    width = Number.isFinite(width) && width > 0 ? width : 1;
    height = Number.isFinite(height) && height > 0 ? height : 1;
    resolution = parseRenderResolution(resolution);
    const heights = { '720p': 720, '1080p': 1080, '1440p': 1440, '4k': 2160 };
    const requestedRatio = resolution === 'original' ? 1 : resolution === 'native'
        ? (Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1)
        : heights[resolution] / height;
    const limits = {
        'GPU/allocation width limit': Math.min(MAX_RENDER_SIDE, Math.max(1, maxWidth)) / width,
        'GPU/allocation height limit': Math.min(MAX_RENDER_SIDE, Math.max(1, maxHeight)) / height,
        '16 MP allocation limit': Math.sqrt(MAX_RENDER_PIXELS / (width * height)),
    };
    const ratio = Math.min(requestedRatio, ...Object.values(limits));
    const dimensions = (r: number) => [Math.max(1, Math.floor(width * r + 1e-7)),
        Math.max(1, Math.floor(height * r + 1e-7))];
    return { ratio, requested: dimensions(requestedRatio), effective: dimensions(ratio),
        caps: Object.entries(limits).filter(([, cap]) => cap < requestedRatio).map(([name]) => name) };
}

export function renderPixelRatio(width: number, height: number, resolution: RenderResolution,
    deviceRatio: number, maxWidth = MAX_RENDER_SIDE, maxHeight = MAX_RENDER_SIDE): number {
    return renderOutput(width, height, resolution, deviceRatio, maxWidth, maxHeight).ratio;
}

export function logicalCanvasSize(canvas: HTMLCanvasElement): { width: number; height: number } {
    return { width: Number(canvas.dataset?.logicalWidth) || canvas.width,
        height: Number(canvas.dataset?.logicalHeight) || canvas.height };
}

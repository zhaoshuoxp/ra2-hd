// Use real regular faces for compact game labels. The bundled Fira family only
// contains Medium/Bold, so requesting 400 from it still selects Medium.
export const UI_FONT_FAMILY = 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif';
export const UI_FONT_WEIGHT = '400';

export function resizeUiTextCanvas(context: CanvasRenderingContext2D, texture: { dispose(): void }, width: number, height: number): boolean {
    const output = document.querySelector<HTMLCanvasElement>('canvas[data-render-output]');
    const logicalHeight = Number(output?.dataset.logicalHeight);
    const ratio = output && logicalHeight > 0 ? output.height / logicalHeight : 1;
    const rasterWidth = Math.max(1, Math.ceil(width * ratio)), rasterHeight = Math.max(1, Math.ceil(height * ratio));
    const changed = context.canvas.width !== rasterWidth || context.canvas.height !== rasterHeight;
    if (changed) {
        texture.dispose();
        context.canvas.width = rasterWidth; context.canvas.height = rasterHeight;
    }
    context.setTransform(rasterWidth / width, 0, 0, rasterHeight / height, 0, 0);
    return changed;
}

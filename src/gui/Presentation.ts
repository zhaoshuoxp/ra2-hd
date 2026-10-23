import type { ViewportRect } from './Viewport';

// The single presentation calibration. Output density never changes this layout.
export const REFERENCE_HEIGHT = 900;

export function presentationLayout(displayWidth: number, displayHeight: number): ViewportRect {
    const width = Number.isFinite(displayWidth) && displayWidth > 0 ? displayWidth : 1;
    const height = Number.isFinite(displayHeight) && displayHeight > 0 ? displayHeight : 1;
    return { x: 0, y: 0, width: REFERENCE_HEIGHT * width / height, height: REFERENCE_HEIGHT,
        displayWidth: width, displayHeight: height, scale: height / REFERENCE_HEIGHT };
}

export function displayToPresentation(x: number, y: number, width: number, height: number,
    displayWidth: number, displayHeight: number): { x: number; y: number } {
    return { x: x * width / (displayWidth || width), y: y * height / (displayHeight || height) };
}

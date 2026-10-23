import type { TmpFile } from '@/data/TmpFile';

// Smaller complete source groups reduce residency without increasing world budgets.
export const MAX_TERRAIN_HD_GROUPS = 256;

export function nativeTerrainMetadata(file: TmpFile, subTile: number) {
    const image = file.images[subTile];
    if (!image) throw Error('Invalid native TMP subtile');
    const offsetX = image.hasExtraData ? Math.max(0, image.x - image.extraX) : 0;
    const offsetY = image.hasExtraData ? Math.max(0, image.y - image.extraY) : 0;
    return {
        member: file.filename.toLowerCase(), subTile, grid: [file.width, file.height],
        block: [file.blockWidth, file.blockHeight],
        logical: [file.blockWidth + offsetX, file.blockHeight + offsetY],
        offset: [-offsetX, -offsetY], origin: [image.x, image.y],
        height: image.height, terrainType: image.terrainType, rampType: image.rampType,
        extra: [image.extraX, image.extraY, image.extraWidth, image.extraHeight],
        hasExtraData: image.hasExtraData, hasZData: image.hasZData,
        radar: [image.radarLeft.r, image.radarLeft.g, image.radarLeft.b,
            image.radarRight.r, image.radarRight.g, image.radarRight.b],
    };
}

export function checkTerrainRect(rect: number[], logical: number[], density: number, size: number[]) {
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isSafeInteger)
        || rect[0] < 2 || rect[1] < 2 || rect[2] !== logical[0] * density || rect[3] !== logical[1] * density
        || rect[0] + rect[2] + 2 > size[0] || rect[1] + rect[3] + 2 > size[1])
        throw Error('Terrain atlas rectangle/geometry mismatch');
}

export function checkTerrainCoverage(rgba: Uint8Array, width: number, rect: number[], native: Uint8Array,
    logical: number[], density: number, reconstruction?: any, metadata?: any) {
    if (reconstruction !== undefined && (reconstruction?.schema !== 'hd-extra-contours-v1'
        || reconstruction.maximumNativeDistance !== 1 || reconstruction.protectMainBlock !== true))
        throw Error('Terrain contour policy mismatch');
    for (let y = 0; y < rect[3]; y++) for (let x = 0; x < rect[2]; x++) {
        const nx = Math.floor(x / density), ny = Math.floor(y / density);
        const expected = native[ny * logical[0] + nx] ? 255 : 0;
        const alpha = rgba[((rect[1] + y) * width + rect[0] + x) * 4 + 3];
        if (alpha === expected) continue;
        const protectedMain = !metadata?.hasExtraData || nx >= -metadata.offset[0] - 1
            && nx < -metadata.offset[0] + metadata.block[0] + 1
            && ny >= -metadata.offset[1] - 1 && ny < -metadata.offset[1] + metadata.block[1] + 1;
        if (!reconstruction || protectedMain) throw Error('Terrain native coverage mismatch');
        let inside = false, outside = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = nx + dx, yy = ny + dy;
            const value = xx >= 0 && yy >= 0 && xx < logical[0] && yy < logical[1]
                && !!native[yy * logical[0] + xx];
            inside ||= value; outside ||= !value;
        }
        if (!inside || !outside) throw Error('Terrain contour exceeds native boundary envelope');
    }
}

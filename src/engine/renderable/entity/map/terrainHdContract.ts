import type { TmpFile } from '@/data/TmpFile';
import rockContours from '../../../../../docs/campaign-art/yr-v1/terrain-newurban-natural-ramp-rock-contour-contract-r1.json';

// Smaller complete source groups reduce residency without increasing world budgets.
export const MAX_TERRAIN_HD_GROUPS = 256;
const rockIndices = new Set(rockContours.rockIndices);
const rockMembers = new Map(Object.keys(rockContours.rockMembers).map(member => [member, rockIndices]));

export function admitTerrainRockContours(declaration: any, sources: { member: string; sha256: string }[],
    theater: string, edition: string): ReadonlyMap<string, ReadonlySet<number>> | undefined {
    if (declaration === undefined) return;
    const pins = Object.entries(rockContours.members), rocks = Object.entries(rockContours.rockMembers);
    if (theater !== rockContours.theater || edition !== rockContours.edition || !declaration?.policy
        || Object.keys(declaration.policy).length !== Object.keys(rockContours.policy).length
        || !Object.entries(rockContours.policy).every(([key, value]) => declaration.policy[key] === value)
        || !declaration.members || Object.keys(declaration.members).length !== rocks.length
        || !rocks.every(([member, hash]) => declaration.members[member] === hash)
        || sources.length !== pins.length || new Set(sources.map(source => source.member)).size !== pins.length
        || !pins.every(([member, hash]) => sources.some(source => source.member === member && source.sha256 === hash)))
        throw Error('Terrain exposed rock source policy mismatch');
    return rockMembers;
}

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
    logical: number[], density: number, reconstruction?: any, metadata?: any, exposedRock?: ReadonlySet<number>) {
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
        if (!reconstruction || protectedMain && !exposedRock) throw Error('Terrain native coverage mismatch');
        let inside = false, outside = false, rock = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = nx + dx, yy = ny + dy;
            const value = xx >= 0 && yy >= 0 && xx < logical[0] && yy < logical[1]
                && !!native[yy * logical[0] + xx];
            inside ||= value; outside ||= !value;
            if (protectedMain && value && exposedRock) rock ||= exposedRock.has(native[yy * logical[0] + xx]);
        }
        if (protectedMain && !rock) throw Error('Terrain native coverage mismatch');
        if (!inside || !outside) throw Error('Terrain contour exceeds native boundary envelope');
    }
}

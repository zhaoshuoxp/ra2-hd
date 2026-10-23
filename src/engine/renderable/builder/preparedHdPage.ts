import * as THREE from 'three';
import type { HdSpriteOverride } from './HdSpriteOverride';
import { PreparedHdCache } from './PreparedHdCache';
import type { HdPageReader } from './resolveHdSprite';

type TextureRole = 'base' | 'data' | 'map' | 'dataMap';
export interface PreparedPageBinding {
    route: string;
    sha256: string;
    bytes: number;
    gpuBytes: number;
    virtualSize?: [number, number];
    compactData: boolean;
    losslessTiles: boolean;
    textures: { role: TextureRole; width: number; height: number; channels: 2 | 4;
        offset: number; length: number; flipY: boolean; srgb: boolean }[];
}
export interface PreparedHdPage {
    page: HdSpriteOverride['pages'][number];
    gpuBytes: number;
}
export const preparedHdCache = new PreparedHdCache();
const integer = (n: unknown, min = 0) => Number.isSafeInteger(n) && Number(n) >= min;
const hash = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);

export function withPreparedHdPages(read: HdPageReader, pages?: Record<string, Record<string, PreparedPageBinding>>): HdPageReader {
    if (pages) read.prefetch = async (density, id, limit, compactData, losslessTiles) => {
        const binding = pages[String(density)]?.[id];
        if (binding && binding.compactData === compactData && binding.losslessTiles === losslessTiles
            && binding.bytes <= preparedHdCache.maximumEntry) await readPreparedPayload(binding, limit);
    };
    if (pages) read.prepared = async (density, id, limit, compactData, losslessTiles) => {
        const binding = pages[String(density)]?.[id];
        if (!binding || binding.compactData !== compactData || binding.losslessTiles !== losslessTiles) return;
        return readPreparedHdPage(binding, limit);
    };
    return read;
}

export function validatePreparedBinding(binding: PreparedPageBinding, limit: number) {
    if (!hash(binding.sha256) || !integer(binding.bytes, 1) || binding.bytes > 64 * 1024 * 1024
        || binding.bytes !== binding.gpuBytes || typeof binding.compactData !== 'boolean'
        || typeof binding.losslessTiles !== 'boolean' || !Array.isArray(binding.textures)
        || ![2, 3, 4].includes(binding.textures.length)) throw Error('prepared-page-layout');
    const expected = binding.textures.length === 2 ? ['base', 'data']
        : binding.textures.length === 3 ? ['base', 'data', 'map'] : ['base', 'data', 'map', 'dataMap'];
    let offset = 0;
    for (const [i, texture] of binding.textures.entries()) {
        if (texture.role !== expected[i] || !integer(texture.width, 1) || !integer(texture.height, 1)
            || texture.width > limit || texture.height > limit || ![2, 4].includes(texture.channels)
            || texture.offset !== offset || texture.length !== texture.width * texture.height * texture.channels
            || typeof texture.flipY !== 'boolean' || texture.srgb !== (texture.role === 'base')
            || (texture.role !== 'data' && texture.channels !== 4)) throw Error('prepared-texture-layout');
        if (texture.role === 'data' && (texture.channels !== (binding.compactData ? 2 : 4)
            || (binding.textures.length < 4 && (texture.width !== binding.textures[0].width
                || texture.height !== binding.textures[0].height))))
            throw Error('prepared-data-layout');
        offset += texture.length;
    }
    if (offset !== binding.bytes) throw Error('prepared-payload-layout');
    if (binding.textures.length > 2 && (!Array.isArray(binding.virtualSize) || binding.virtualSize.length !== 2
        || !binding.virtualSize.every(n => integer(n, 1) && n <= limit * 4))) throw Error('prepared-virtual-size');
    if (binding.textures.length === 2 && binding.virtualSize !== undefined) throw Error('prepared-flat-layout');
}

export async function readPreparedHdPage(binding: PreparedPageBinding, limit: number): Promise<PreparedHdPage> {
    return createPreparedHdPage(binding, await readPreparedPayload(binding, limit), limit);
}

async function readPreparedPayload(binding: PreparedPageBinding, limit: number): Promise<Uint8Array> {
    validatePreparedBinding(binding, limit);
    return preparedHdCache.read(`${binding.route}/${binding.sha256}`, binding.bytes, async () => {
        const response = await fetch(binding.route, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw Error('missing-prepared-payload');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== binding.bytes) throw Error('prepared-payload-size');
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        if (digest !== binding.sha256) throw Error('prepared-payload-hash');
        return new Uint8Array(bytes);
    });
}

export function createPreparedHdPage(binding: PreparedPageBinding, payload: Uint8Array, limit: number): PreparedHdPage {
    validatePreparedBinding(binding, limit);
    if (payload.byteLength !== binding.bytes) throw Error('prepared-payload-size');
    const textures = new Map<TextureRole, THREE.DataTexture>();
    try {
        for (const entry of binding.textures) {
            // Owned copies protect the cache from animation stabilization and
            // keep texture disposal independent between consecutive matches.
            const pixels = new Uint8Array(payload.subarray(entry.offset, entry.offset + entry.length));
            const texture = new THREE.DataTexture(pixels, entry.width, entry.height,
                entry.channels === 2 ? THREE.RGFormat : THREE.RGBAFormat);
            texture.flipY = entry.flipY;
            texture.colorSpace = entry.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            texture.generateMipmaps = false;
            texture.minFilter = texture.magFilter = THREE.NearestFilter;
            texture.needsUpdate = true;
            textures.set(entry.role, texture);
        }
        const page: HdSpriteOverride['pages'][number] = { base: textures.get('base')!, data: textures.get('data')! };
        if (binding.virtualSize) page.tiles = { map: textures.get('map')!, dataMap: textures.get('dataMap'),
            virtualSize: [...binding.virtualSize] };
        return { page, gpuBytes: binding.gpuBytes };
    } catch (error) { textures.forEach(texture => texture.dispose()); throw error; }
}

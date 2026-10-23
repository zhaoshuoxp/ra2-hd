import { isLocalHdOrigin } from '../builder/hdOrigin';
import * as THREE from 'three';
import { Engine } from '../../Engine';
import { RhinoMaterial } from './RhinoMaterial';
import { digest, partKeys } from './contract';
import { manifestHash } from './identity';
import type { BoxedVar } from '@/util/BoxedVar';
import { downsampleHdBitmap, downsampleMask } from '../builder/downsampleHdPage';

export class RhinoArtwork {
    readonly texture: THREE.Texture;
    readonly remap: THREE.DataTexture;
    readonly palette = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    refs = 0;
    disposed = false;
    constructor(readonly bitmap: ImageBitmap, mask: Uint8Array) {
        this.texture = new THREE.Texture(bitmap);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
        this.texture.generateMipmaps = false;
        this.texture.needsUpdate = true;
        this.remap = new THREE.DataTexture(mask, bitmap.width, bitmap.height, THREE.RedFormat);
        this.remap.flipY = true;
        this.remap.needsUpdate = this.palette.needsUpdate = true;
    }
    retain(): void { if (this.disposed) throw Error('Disposed Rhino artwork'); this.refs++; }
    release(): void { if (this.refs <= 0) throw Error('Unbalanced Rhino release'); this.refs--; }
    material(): RhinoMaterial {
        return new RhinoMaterial({ map: this.texture, remapMap: this.remap, palette: this.palette,
            paletteCount: 1, alphaTest: 0.05, toneMapped: false });
    }
    dispose(): void {
        if (this.disposed) return;
        if (this.refs) throw Error('Rhino artwork still in use');
        this.disposed = true;
        this.texture.dispose(); this.remap.dispose(); this.palette.dispose(); this.bitmap.close();
    }
}
export class LoadedRhinoHd {
    readonly parts = new Map<string, RhinoArtwork>();
    readonly report = { status: 'ORIGINAL', reason: '', manifestHash, partCount: 0, density: 4 };
    constructor(readonly enabled: BoxedVar<boolean>, density: 2 | 4 = 4) { this.report.density = density; }
    dispose(): void { this.parts.forEach(p => p.dispose()); }
}
export async function loadRhinoHd(theater: any, renderer: any, enabled: BoxedVar<boolean>, density: 2 | 4 = 4): Promise<LoadedRhinoHd | undefined> {
    if (!isLocalHdOrigin(location.href)) return;
    const loaded = new LoadedRhinoHd(enabled, density);
    const check = (value: unknown, message: string) => { if (!value) throw Error(message); };
    const read = async (name: string, hash: string): Promise<ArrayBuffer> => {
        const response = await fetch(`/local-rhino/${name}`, { signal: AbortSignal.timeout(10000) });
        check(response.ok, `Missing ${name}`);
        const bytes = await response.arrayBuffer();
        check(await digest(bytes) === hash, `Hash mismatch ${name}`);
        return bytes;
    };
    try {
        // Every original VXL/HVA source is verified below, independently of theater.
        const manifest = JSON.parse(new TextDecoder().decode(await read('manifest.json', manifestHash)));
        for (const [member, hash] of Object.entries(manifest.sources)) {
            const bytes = Uint8Array.from(Engine.vfs!.openFile(member).getBytes()).buffer;
            check(await digest(bytes) === hash, `Original family mismatch ${member}`);
        }
        for (const key of partKeys) {
            const entry = manifest.parts[key];
            const bytes = await read(`${key}.png`, entry.sha256);
            let mask = new Uint8Array(await read(`${key}.mask`, entry.maskSha256));
            check(mask.length === 320 * 288, 'Invalid mask dimensions');
            let bitmap = await createImageBitmap(new Blob([bytes]), {
                imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
            });
            if (bitmap.width !== 320 || bitmap.height !== 288) { bitmap.close(); throw Error('Invalid artwork dimensions'); }
            if (density === 2) {
                mask = downsampleMask(mask, 320, 288);
                bitmap = await downsampleHdBitmap(bitmap);
            }
            const resource = new RhinoArtwork(bitmap, mask);
            loaded.parts.set(key, resource);
            for (const t of [resource.texture, resource.remap, resource.palette]) renderer.renderer.initTexture(t);
            check(renderer.renderer.getContext().getError() === 0, 'Rhino texture upload failed');
        }
        loaded.report.status = 'READY'; loaded.report.partCount = loaded.parts.size;
    } catch (error) {
        loaded.dispose(); loaded.parts.clear();
        loaded.report.reason = error instanceof Error ? error.message : String(error);
    }
    console.info('[Rhino HD]', loaded.report);
    return loaded;
}

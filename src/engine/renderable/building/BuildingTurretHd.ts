import * as THREE from 'three';
import { Engine } from '../../Engine';
import { RhinoMaterial, colorDelta } from '../rhino/RhinoMaterial';
import { heading, headings, digest } from '../rhino/contract';
import { createSpriteGeometry } from '../../gfx/SpriteUtils';
import { Coords } from '../../../game/Coords';
import contracts from '../../../../desktop/building-turret-contracts.json';
import { gatlingRegistration } from './GatlingRegistration';
import { downsampleHdBitmap, downsampleMask } from '../builder/downsampleHdPage';
import { AnimationType } from '../entity/building/AnimationType';

export class BuildingTurretHd {
    readonly parts = new Map<number, { base: THREE.Texture; mask: THREE.DataTexture }>();
    readonly palette = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    readonly gpuBytes: number;
    constructor(readonly contract = contracts.NALASR, readonly density = 2,
                readonly assemblyCompletionFrame?: number, readonly nativePivot = false,
                readonly showMainAtAssemblyCompletion = false) {
        this.gpuBytes = 8 * contract.canvas[0] * contract.canvas[1] * density * density * 5 + 4;
    }
    disposed = false;
    upload(renderer: THREE.WebGLRenderer) {
        for (const texture of [this.palette, ...[...this.parts.values()].flatMap(p => [p.base, p.mask])]) renderer.initTexture(texture);
        if (renderer.getContext().getError() !== 0) throw Error('turret-upload');
    }
    dispose() {
        if (this.disposed) return;
        this.parts.forEach(p => { p.base.dispose(); (p.base.image as ImageBitmap).close(); p.mask.dispose(); });
        this.palette.dispose(); this.parts.clear(); this.disposed = true;
    }
}

export async function loadBuildingTurretHd(binding: any, family: string, requestedDensity: 2 | 4 = 4): Promise<BuildingTurretHd> {
    const check = (value: unknown, message: string) => { if (!value) throw Error(message); };
    const contract = contracts[family as keyof typeof contracts];
    check(contract && /^[a-f0-9]{64}$/.test(binding?.sha256), 'missing-turret-family');
    const prefix = `/local-hd/${binding.sha256}/turret/`;
    const read = async (file: string, hash: string, maxBytes: number) => {
        check(/^(manifest\.json|(?:0|45|90|135|180|225|270|315)\.(png|mask))$/.test(file), 'invalid-turret-file');
        const response = await fetch(prefix + file, { signal: AbortSignal.timeout(15000) });
        check(response.ok, 'missing-turret-file');
        const bytes = await response.arrayBuffer();
        check(bytes.byteLength <= maxBytes && await digest(bytes) === hash, 'turret-file-identity');
        return bytes;
    };
    const manifest = JSON.parse(new TextDecoder().decode(await read('manifest.json', binding.sha256, 32768)));
    check(manifest.schemaVersion === 1 && manifest.family === family && manifest.theater === 'TEMPERATE'
        && [2, 4].includes(manifest.density) && JSON.stringify(manifest.canvas) === JSON.stringify(contract.canvas)
        && JSON.stringify(manifest.offset) === JSON.stringify(contract.offset) && manifest.headings.length === 8, 'turret-contract');
    const members = contract.members;
    check(Object.keys(manifest.sources).length === members.length, 'turret-source-count');
    for (const member of members) check(await digest(Uint8Array.from(Engine.vfs!.openFile(member).getBytes()).buffer)
        === manifest.sources[member], 'turret-retail-identity');
    const [width, height] = contract.canvas.map(v => v * manifest.density);
    const density = Math.min(manifest.density, requestedDensity);
    check(manifest.assemblyCompletionFrame === undefined ||
        (family === 'YAGGUN' && manifest.assemblyCompletionFrame === 10), 'turret-assembly-completion');
    check(manifest.nativePivot === undefined || (family === 'YAGGUN' && manifest.nativePivot === true), 'turret-native-pivot');
    check(binding.constructionCompletionFrame === undefined ||
        (family === 'GTGCAN' && binding.constructionCompletionFrame === 11), 'construction-completion-binding');
    const loaded = new BuildingTurretHd(contract, density,
        manifest.assemblyCompletionFrame ?? binding.constructionCompletionFrame,
        manifest.nativePivot === true, binding.constructionCompletionFrame !== undefined);
    try {
        for (const [i, h] of headings.entries()) {
            const entry = manifest.headings[i];
            check(entry.heading === h && entry.base === `${h}.png` && entry.mask === `${h}.mask`, 'turret-heading-order');
            const png = await read(entry.base, entry.baseSha256, 2 * 1024 * 1024);
            let mask = new Uint8Array(await read(entry.mask, entry.maskSha256, width * height));
            check(mask.length === width * height && mask.every(v => v === 0 || v === 255), 'turret-mask');
            let image = await createImageBitmap(new Blob([png], { type: 'image/png' }),
                { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
            if (image.width !== width || image.height !== height) { image.close(); throw Error('turret-size'); }
            if (density < manifest.density) {
                mask = downsampleMask(mask, width, height);
                image = await downsampleHdBitmap(image);
            }
            const base = new THREE.Texture(image); base.colorSpace = THREE.SRGBColorSpace;
            base.minFilter = base.magFilter = THREE.NearestFilter; base.generateMipmaps = false; base.needsUpdate = true;
            const data = new THREE.DataTexture(mask, image.width, image.height, THREE.RedFormat);
            data.flipY = true; data.needsUpdate = true;
            loaded.parts.set(h, { base, mask: data });
        }
        loaded.palette.needsUpdate = true;
        return loaded;
    } catch (error) { loaded.dispose(); throw error; }
}

export class BuildingTurretRenderer {
    readonly meshes = new Map<number, [THREE.Mesh, THREE.Mesh]>();
    readonly originals: any[];
    readonly materials: any[];
    readonly hidden: any[];
    constructor(readonly building: any, readonly resources: BuildingTurretHd) {
        const r = building;
        if (!r.turret || r.turretBuilders?.length !== resources.contract.builders) throw Error('Unexpected building turret layout');
        this.originals = r.turretBuilders.flatMap((builder: any) => [...builder.sections.values()]);
        this.materials = this.originals.map(m => m.material);
        this.hidden = this.materials.map(m => { const hidden = m.clone(); hidden.colorWrite = hidden.depthWrite = false; return hidden; });
        for (const [h, part] of resources.parts) {
            const registration = resources.contract === contracts.YAGGUN ? gatlingRegistration(h, resources.nativePivot) : { x: 0, y: 0 };
            const geometry = createSpriteGeometry({ camera: r.camera, texture: part.base,
                logicalSize: { width: resources.contract.canvas[0], height: resources.contract.canvas[1] },
                offset: { x: resources.contract.offset[0] + registration.x, y: resources.contract.offset[1] + registration.y },
                align: { x: 1, y: -1 }, scale: Coords.ISO_WORLD_SCALE, depth: true });
            const rect = new Float32Array(geometry.getAttribute('position').count * 4);
            for (let i = 0; i < rect.length; i += 4) rect.set([0, 0, 1, 1], i);
            geometry.setAttribute('hdFrameRect', new THREE.BufferAttribute(rect, 4));
            const material = new RhinoMaterial({ map: part.base, remapMap: part.mask,
                palette: resources.palette, paletteCount: 1, alphaTest: .05, toneMapped: false });
            material.enableFiltering('full');
            const color = new THREE.Mesh(geometry, material);
            const depth = new THREE.Mesh(geometry, material.clone());
            depth.material.transparent = false; depth.material.depthWrite = true;
            depth.material.colorWrite = false; depth.material.alphaTest = .985;
            for (const mesh of [depth, color]) {
                mesh.name = `building-hd-turret-${h}`; mesh.matrixAutoUpdate = false; mesh.visible = false;
                r.turret.add(mesh);
            }
            this.meshes.set(h, [depth, color]);
        }
    }
    update() {
        const r = this.building, selected = heading(r.gameObject.turretTrait?.facing);
        if (this.resources.assemblyCompletionFrame !== undefined &&
            [AnimationType.BUILDUP, AnimationType.UNBUILD].includes(r.currentAnimType)) {
            const assembly = r.animObjects.get(r.currentAnimType)?.[0];
            r.turret.visible = r.gameObject.healthTrait.health > 0 && !!assembly &&
                assembly.builder.getFrame() >= this.resources.assemblyCompletionFrame;
            if (this.resources.showMainAtAssemblyCompletion && assembly) {
                // The completed cannon heading extends beyond the last native
                // MK trim. Publish the retained assembly at the native terminal
                // phase, avoiding a clipped substitute and a second pose change.
                r.mainObj.get3DObject().visible = r.turret.visible;
                assembly.get3DObject().visible = r.gameObject.healthTrait.health > 0 && !r.turret.visible;
            }
        }
        const opacity = this.originals[0].getOpacity?.() ?? this.materials[0].opacity;
        const color = colorDelta(r.gameObject.owner.color);
        for (let i = 0; i < this.originals.length; i++) this.originals[i].material = this.hidden[i];
        for (const [h, [depth, surface]] of this.meshes) {
            surface.visible = h === selected && !this.resources.disposed;
            depth.visible = surface.visible && opacity === 1;
            for (const mesh of [depth, surface]) {
                const material = mesh.material as RhinoMaterial;
                material.uniforms.rhinoColorDelta.value.copy(color);
                material.extraLight.copy(r.shpExtraLight);
                material.opacity = opacity;
                material.clippingPlanes = this.originals[0].getClippingPlanes?.() ?? this.materials[0].clippingPlanes;
                mesh.renderOrder = this.originals[0].renderOrder;
            }
        }
    }
    dispose() {
        this.originals.forEach((m, i) => m.material = this.materials[i]);
        this.hidden.forEach(m => m.dispose());
        this.meshes.forEach(([depth, surface]) => {
            depth.removeFromParent(); surface.removeFromParent(); depth.geometry.dispose();
            (depth.material as THREE.Material).dispose(); (surface.material as THREE.Material).dispose();
        });
        this.meshes.clear();
    }
}

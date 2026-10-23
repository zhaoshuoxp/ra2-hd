import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { extendShroudCoverage } from '../../src/engine/renderable/entity/map/shroudCoverage';
import { stabilizePowerPlantAnimation } from '../../src/engine/renderable/builder/stabilizePowerPlantAnimation';
import { createSpriteGeometry } from '../../src/engine/gfx/SpriteUtils';

function fixture(density: number) {
    const w = 12 * density, h = 24 * density;
    const base = new Uint8Array(w * h * 16 * 4), data = base.slice();
    for (let f = 0; f < 16; f++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = ((f * h + y) * w + x) * 4;
        // Deliberate lower machinery drift plus an animated warm upper core.
        base.set(y < h / 2 ? [220 + f, 150, 50, 255] : [40 + f, 60 + f, 80, 255], i);
        data.set([0, 0, 0, 255], i);
        if (x < density) data.set([255, f % 16, 0, 255], i);
    }
    const texture = (pixels: Uint8Array) => new THREE.DataTexture(pixels, w, h * 16);
    const override = { identity: 'fixture', frames: Array.from({ length: 16 }, (_, f) => ({ page: 0,
        sampleRect: { x: 0, y: f * h, width: w, height: h } })), pages: [{ base: texture(base), data: texture(data) }] };
    const source = { member: 'ggpowr_a.shp', sha256: 'a'.repeat(64), theater: 'TEMPERATE', canvas: [142,110],
        frames: Array.from({ length: 16 }, (_, nativeFrame) => ({ nativeFrame, trimOrigin: [48,14],
            trimSize: [12,24], legacyRenderSize: [12,24], empty: false })) };
    return { override, source, base, data, w, h };
}

test('shroud extension touches neutral exterior only, uses the original neighborhood, and cannot cross frame boundaries', () => {
    const pixels = new Uint8Array([254,254,254,254,254,254, 254,254,2,64,254,254, 254,254,254,254,254,254]);
    const before = pixels.slice(), fixed = extendShroudCoverage(pixels,6,3);
    expect(pixels).toEqual(before);
    expect(fixed[8]).toBe(2); expect(fixed[9]).toBe(64);
    expect(fixed[7]).toBe(2); expect(fixed[10]).toBe(64);
    expect(fixed[6]).toBe(254); expect(fixed[11]).toBe(254);
    expect(extendShroudCoverage(new Uint8Array([254,254,254,254]),2,2)).toEqual(new Uint8Array([254,254,254,254]));
    expect(() => extendShroudCoverage(pixels,5,3)).toThrow();
});

test('shroud UV inset leaves world geometry exactly unchanged', () => {
    const camera = new THREE.PerspectiveCamera(); camera.rotation.set(-Math.PI/6,Math.PI/4,0,'YXZ');
    const options = { camera, texture: { image: { width: 300,height:300 } } as THREE.Texture,
        textureArea: { x:0,y:150,width:60,height:30 }, flat:true, align:{x:0,y:-1}, scale:256/30 };
    const original = createSpriteGeometry(options);
    const fixed = createSpriteGeometry({ ...options, textureArea:{x:0.5,y:150.5,width:59,height:29}, logicalSize:{width:60,height:30} });
    expect(fixed.attributes.position.array).toEqual(original.attributes.position.array);
    original.dispose(); fixed.dispose();
});

test('normal/damaged animation freezes structure, alpha and remap while preserving local light motion at both densities', () => {
    for (const density of [2,4]) {
        const { override,source,base,data,w,h } = fixture(density);
        const before = base.slice(), oldData = data.slice();
        const report = stabilizePowerPlantAnimation(override,source,density);
        expect(base).toEqual(before); expect(data).toEqual(oldData);
        expect(report.effectPixels.every(n=>n>0)).toBe(true);
        const result = override.pages[0].base.image.data as Uint8Array;
        const remap = override.pages[0].data.image.data as Uint8Array;
        let outsideChanges = 0, coverageChanges = 0, remapChanges = 0, lightChanges = 0;
        for (let f=0;f<16;f++) for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
            const i=((f*h+y)*w+x)*4, anchor=(((f<8?0:8)*h+y)*w+x)*4;
            if(result[i+3]!==before[anchor+3])coverageChanges++;
            if(remap.slice(i,i+4).some((v,c)=>v!==oldData[anchor+c]))remapChanges++;
            const changed=result.slice(i,i+3).some((v,c)=>v!==before[anchor+c]);
            if(changed){if(y>=h/2||x<density)outsideChanges++;else lightChanges++;}
        }
        expect(outsideChanges).toBe(0); expect(coverageChanges).toBe(0); expect(remapChanges).toBe(0); expect(lightChanges).toBeGreaterThan(0);
        override.pages.forEach(p=>{p.base.dispose();p.data.dispose();});
    }
});

test('inconsistent phase geometry rejects before committing derived pixels', () => {
    const {override,source,base}=fixture(2);source.frames[3].trimOrigin=[49,14];
    expect(()=>stabilizePowerPlantAnimation(override,source,2)).toThrow('geometry');
    expect(override.pages[0].base.image.data).toBe(base);
    override.pages.forEach(p=>{p.base.dispose();p.data.dispose();});
});

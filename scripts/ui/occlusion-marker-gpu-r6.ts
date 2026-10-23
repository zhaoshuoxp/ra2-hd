import * as THREE from 'three';
import { acquireOcclusionMarkerHd } from '../../src/engine/renderable/entity/OcclusionMarkerHd';
import { HdSpriteMaterial } from '../../src/engine/gfx/material/HdSpriteMaterial';

(window as any).probeOcclusionMarker = (source: any) => {
    const shp = { filename: 'behind.shp', numImages: source.frames.length,
        getImage: (i: number) => ({ ...source.frames[i], imageData: source.frames[i].pixels }) };
    const lease = acquireOcclusionMarkerHd(shp, { hash: 1, getColor: (i: number) => source.palette[i] });
    const page = lease.override.pages[0], rows: any[] = [];
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(55 * 4, 43 * 4); renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
    const camera = new THREE.OrthographicCamera(0, 55, 0, 43, .1, 10); camera.position.z = 1;
    const scene = new THREE.Scene();
    const palette = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); palette.needsUpdate = true;
    const productionFlipY = page.base.flipY;
    for (const [control, flipY] of [['production', productionFlipY], ['reproducedR5', false]] as const) {
        page.base.flipY = flipY; page.base.needsUpdate = true;
        for (const f of source.frames) {
            const rect = lease.override.frames[f.frame].sampleRect, atlas = page.base.image as HTMLCanvasElement;
            const expected = document.createElement('canvas'); expected.width = 220; expected.height = 172;
            expected.getContext('2d')!.drawImage(atlas, rect.x, rect.y, rect.width, rect.height, f.x * 4, f.y * 4, rect.width, rect.height);
            const width = f.width + f.width % 2, height = f.height + f.height % 2;
            const g = new THREE.PlaneGeometry(width, height);
            g.scale(1, -1, 1); g.translate(f.x + width / 2, f.y + height / 2, 0);
            const u = rect.x / atlas.width, v = 1 - (rect.y + rect.height) / atlas.height;
            const du = rect.width / atlas.width, dv = rect.height / atlas.height;
            g.setAttribute('uv', new THREE.Float32BufferAttribute([u, v + dv, u + du, v + dv, u, v, u + du, v], 2));
            g.setAttribute('hdFrameRect', new THREE.Float32BufferAttribute(Array(4).fill([u, v, u + du, v + dv]).flat(), 4));
            const material = new HdSpriteMaterial({ map: page.base, remapMap: page.data, palette,
                transparent: true, depthTest: false, depthWrite: false, alphaTest: .001, toneMapped: false });
            material.enableBlendedCoverage();
            const mesh = new THREE.Mesh(g, material); scene.add(mesh); renderer.render(scene, camera);
            const canvas = document.createElement('canvas'); canvas.width = 220; canvas.height = 172;
            const c = canvas.getContext('2d')!; c.drawImage(renderer.domElement, 0, 0);
            const a = expected.getContext('2d')!.getImageData(0, 0, 220, 172).data;
            const b = c.getImageData(0, 0, 220, 172).data;
            let intersection = 0, union = 0, expectedCount = 0, actualCount = 0;
            let ex = 0, ey = 0, ax = 0, ay = 0;
            for (let i = 3; i < a.length; i += 4) {
                const x = ((i - 3) / 4) % 220, y = Math.floor((i - 3) / 4 / 220);
                const aa = a[i] > 127, bb = b[i] > 127;
                if (aa || bb) union++;
                if (aa && bb) intersection++;
                if (aa) { expectedCount++; ex += x; ey += y; }
                if (bb) { actualCount++; ax += x; ay += y; }
            }
            rows.push({ frame: f.frame, control, flipY, expectedCount, actualCount, iou: intersection / union,
                centerErrorNative: actualCount ? Math.hypot(ex / expectedCount - ax / actualCount, ey / expectedCount - ay / actualCount) / 4 : null,
                expectedPng: expected.toDataURL().split(',')[1], actualPng: canvas.toDataURL().split(',')[1] });
            scene.remove(mesh); g.dispose(); material.dispose();
        }
    }
    const error = renderer.getContext().getError(); renderer.dispose(); palette.dispose(); lease.release();
    return { productionFlipY, rows, glError: error, atlas: [page.base.image.width, page.base.image.height] };
};

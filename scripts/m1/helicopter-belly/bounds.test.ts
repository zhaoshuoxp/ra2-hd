import { resourceRoot } from '../../test-support/resources';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { componentGeometry } from '../../../src/engine/renderable/unitVxl/componentGeometry';
import { vxlUnitIdentities, registerHdResources } from '../../../desktop/hd-profile.mjs';

const local = test;
const camera = new THREE.OrthographicCamera();
camera.rotation.order = 'YXZ';
camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0);
camera.updateMatrixWorld();
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

function coverage(part: any, frame: any) {
    const geometry = componentGeometry({ ...part, override: { pages: [{ base: new THREE.Texture() }] } },
        frame, camera, true, 0);
    const uv = geometry.getAttribute('uv');
    const xs = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    const ys = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
    geometry.dispose();
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

local('SHAD metadata exposes every registered image corner without changing accepted artwork or pivots', () => {
    const entry = vxlUnitIdentities.SHAD;
    const corrected = read(`${resourceRoot}/` + entry.path);
    expect(sha(`${resourceRoot}/` + entry.path)).toBe(entry.hash);
    expect(corrected.density).toBe(4);
    expect(corrected.parts).toHaveLength(3);
    let frames = 0;
    for (let i = 0; i < corrected.parts.length; i++) {
        const part = corrected.parts[i];
        expect(part.depthBounds).toEqual(corrected.parts[0].depthBounds);
        for (const file of Object.values(part.files) as any[])
            expect(sha(`${resourceRoot}/` + entry.path.replace('manifest.json', file.file))).toBe(file.sha256);
        for (const frame of part.frames) {
            const [x, y, w, h] = frame.rect, [pw, ph] = part.pageSize;
            const wanted = [x / pw, 1 - (y + h) / ph, (x + w) / pw, 1 - y / ph];
            const actual = coverage(part, frame);
            actual.forEach((v, j) => expect(v).toBeCloseTo(wanted[j], 6));
            frames++;
        }
    }
    expect(frames).toBe(24);
});

local('the desktop resolves both helicopter families with complete body coverage', async () => {
    const entry = vxlUnitIdentities.SHAD;
    const registered = await registerHdResources(resourceRoot);
    expect(registered.availability['unit-shad']).toBe('HD available at 4x');
    expect(registered.routes.get(`/local-vxl/${entry.hash}/manifest.json`)).toBe(resourceRoot + '/' + entry.path);
    expect(sha(`${resourceRoot}/` + vxlUnitIdentities.SCHP.path)).toBe(vxlUnitIdentities.SCHP.hash);
    const control = read(`${resourceRoot}/` + vxlUnitIdentities.SCHP.path);
    for (const part of control.parts.filter((p: any) => p.section === 'DUMMY01'))
        for (const frame of part.frames) {
            const [x, y, w, h] = frame.rect, [pw, ph] = part.pageSize;
            const wanted = [x / pw, 1 - (y + h) / ph, (x + w) / pw, 1 - y / ph];
            coverage(part, frame).forEach((v, j) => expect(v).toBeCloseTo(wanted[j], 6));
        }
});

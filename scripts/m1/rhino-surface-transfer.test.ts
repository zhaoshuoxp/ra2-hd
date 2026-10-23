import { describe, expect, test } from 'bun:test';
import { Matrix4, Vector3 } from 'three';
import { transferRhinoSurface } from './rhino-surface-transfer';
import type { PlainSection } from '../../src/data/vxl/Section';

function fixture(color: (x: number) => number): PlainSection {
    const voxels = [];
    for (let x=0; x<4; x++) for (let y=0; y<3; y++) for (let z=0; z<2; z++) {
        voxels.push({ x, y, z, colorIndex: color(x), normalIndex: 0 });
    }
    return { name: 'synthetic', normalsMode: 2, minBounds: [0,0,0], maxBounds: [4,3,2],
        sizeX: 4, sizeY: 3, sizeZ: 2, hvaMultiplier: 1,
        transfMatrix: new Matrix4().toArray(), spans: [{ voxels, startIndex: 0, endIndex: voxels.length-1 }] };
}

describe('source-derived surface constraints', () => {
    test('convex occupied fixture stays within native bounds and faces outward', () => {
        const source = fixture(() => 70), snapshot = JSON.stringify(source);
        const { geometry } = transferRhinoSurface(source);
        expect(JSON.stringify(source)).toBe(snapshot);
        expect(geometry.boundingBox!.min.toArray()).toEqual([0,0,0]);
        expect(geometry.boundingBox!.max.toArray()).toEqual([4,3,2]);
        const p = geometry.getAttribute('position'), center = new Vector3(2,1.5,1);
        const i = geometry.index!;
        for (let n=0; n<i.count; n+=3) {
            const a = new Vector3().fromBufferAttribute(p,i.getX(n));
            const b = new Vector3().fromBufferAttribute(p,i.getX(n+1));
            const c = new Vector3().fromBufferAttribute(p,i.getX(n+2));
            const normal = b.clone().sub(a).cross(c.clone().sub(a));
            const radial = a.clone().add(b).add(c).multiplyScalar(1/3).sub(center);
            expect(normal.dot(radial)).toBeGreaterThan(0);
        }
        geometry.dispose();
    });

    test('owner and dark regions remain discrete palette entries across triangle boundaries', () => {
        const { geometry } = transferRhinoSurface(fixture(x => [16,23,31,59][x]));
        const colors = geometry.getAttribute('color'), i = geometry.index!;
        const used = new Set<number>();
        for (let n=0; n<i.count; n+=3) {
            const triangle = [0,1,2].map(k => Math.round(colors.getX(i.getX(n+k))*255));
            expect(new Set(triangle).size).toBe(1);
            used.add(triangle[0]);
        }
        expect([...used].sort((a,b) => a-b)).toEqual([16,23,31,59]);
        geometry.dispose();
    });

    test('native coordinate offsets and axis scales do not move or rescale the logical source', () => {
        const source = fixture(() => 70);
        source.minBounds = [-10,7,20]; source.maxBounds = [-2,10,21];
        const { geometry } = transferRhinoSurface(source);
        expect(geometry.boundingBox!.min.toArray()).toEqual(source.minBounds);
        expect(geometry.boundingBox!.max.toArray()).toEqual(source.maxBounds);
        const normals = geometry.getAttribute('normal');
        for (let i=0; i<normals.count; i++) {
            expect(new Vector3().fromBufferAttribute(normals,i).length()).toBeCloseTo(1,5);
        }
        geometry.dispose();
    });
});

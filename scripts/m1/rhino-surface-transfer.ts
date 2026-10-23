// Harness-only surface extraction from original occupancy, palette regions and normals.
// No generated PNG is used as a lit texture; original independent parts remain separate.
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { Section, type PlainSection } from '../../src/data/vxl/Section';

export const representation = 'section-mesh-v1';
export const builderVersion = 'rhino-source-surface-1';
export const settings = { samplesPerVoxel: 2, sourceNormalWeight: 0.8, armorIndex: [70, 70] };
type Point = [number, number, number];
const corners: Point[] = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
const edges = corners.flatMap((p, i) => [0,1,2].filter(a => p[a] === 0).map(a => [i, i ^ (1 << a)]));

export function transferRhinoSurface(plain: PlainSection) {
    const section = new Section().fromPlain(plain);
    const { voxels, voxelField } = section.getAllVoxels();
    const normals = section.getNormals();
    const size = [section.sizeX, section.sizeY, section.sizeZ];
    const dimensions = size.map(n => n * 2 + 3);
    const getVoxel = (x: number, y: number, z: number) => (
        x < 0 || y < 0 || z < 0 || x >= size[0] || y >= size[1] || z >= size[2]
            ? undefined : voxelField.get(x, y, z)
    );
    const density = (p: number[]) => {
        const base = p.map(v => Math.floor(v - 0.5));
        const fraction = p.map((v, i) => v - 0.5 - base[i]);
        let value = 0;
        for (const c of corners) {
            if (getVoxel(base[0]+c[0], base[1]+c[1], base[2]+c[2])) {
                value += c.reduce((w, v, a) => w * (v ? fraction[a] : 1-fraction[a]), 1);
            }
        }
        return value;
    };
    const gridPoint = (p: number[]) => p.map(v => v / 2 - 0.5) as Point;
    const key = (x: number, y: number, z: number) => x + dimensions[0]*(y + dimensions[1]*z);
    const samples = new Float32Array(dimensions.reduce((a,b) => a*b, 1));
    for (let z=0; z<dimensions[2]; z++) for (let y=0; y<dimensions[1]; y++) for (let x=0; x<dimensions[0]; x++) {
        samples[key(x,y,z)] = density(gridPoint([x,y,z]));
    }
    const cellVertices = new Map<number, Point>();
    for (let z=0; z<dimensions[2]-1; z++) for (let y=0; y<dimensions[1]-1; y++) for (let x=0; x<dimensions[0]-1; x++) {
        const values = corners.map(c => samples[key(x+c[0],y+c[1],z+c[2])]);
        if (values.every(v => v >= 0.5) || values.every(v => v < 0.5)) continue;
        const sum = [0,0,0];
        let count = 0;
        for (const [i,j] of edges) {
            if ((values[i] >= 0.5) === (values[j] >= 0.5)) continue;
            const t = (0.5-values[i])/(values[j]-values[i]);
            for (let a=0; a<3; a++) sum[a] += corners[i][a] + t*(corners[j][a]-corners[i][a]);
            count++;
        }
        cellVertices.set(key(x,y,z), gridPoint(sum.map((v,a) => [x,y,z][a] + v/count)));
    }

    const positions: number[] = [], shading: number[] = [], colors: number[] = [], indices: number[] = [];
    const vertexIds = new Map<string, number>();
    const materialCounts: Record<number, number> = {};
    const nearby = (p: Point) => {
        const found: { voxel: typeof voxels[number]; distance: number }[] = [];
        const base = p.map(Math.floor);
        for (let dz=-2; dz<=2; dz++) for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++) {
            const voxel = getVoxel(base[0]+dx,base[1]+dy,base[2]+dz);
            if (!voxel) continue;
            const distance = (voxel.x+0.5-p[0])**2 + (voxel.y+0.5-p[1])**2 + (voxel.z+0.5-p[2])**2;
            found.push({ voxel, distance });
        }
        found.sort((a,b) => a.distance-b.distance);
        if (!found.length) throw Error('Surface point has no source occupancy');
        return found;
    };
    const outward = (p: Point) => {
        const values = p.map((_,a) => {
            const low = [...p], high = [...p];
            low[a] -= 0.125; high[a] += 0.125;
            return (density(low)-density(high))/section.scale.toArray()[a];
        });
        return new Vector3(...values).normalize();
    };
    const addVertex = (p: Point, sourceIndex: number) => {
        const id = `${p.map(v => v.toFixed(7)).join(',')}:${sourceIndex}`;
        const existing = vertexIds.get(id);
        if (existing !== undefined) return existing;
        const sourceNormal = new Vector3();
        for (const {voxel, distance} of nearby(p).filter(v => v.voxel.colorIndex === sourceIndex).slice(0,4)) {
            sourceNormal.addScaledVector(normals[Math.min(voxel.normalIndex,normals.length-1)], 1/(0.1+distance));
        }
        sourceNormal.normalize();
        const geometricNormal = outward(p);
        if (!sourceNormal.lengthSq()) sourceNormal.copy(geometricNormal);
        sourceNormal.multiplyScalar(settings.sourceNormalWeight)
            .addScaledVector(geometricNormal,1-settings.sourceNormalWeight).normalize();
        const world = p.map((v,a) => section.minBounds.toArray()[a] + v*section.scale.toArray()[a]);
        const index = sourceIndex === settings.armorIndex[0] ? settings.armorIndex[1] : sourceIndex;
        const n = positions.length/3;
        positions.push(...world); shading.push(...sourceNormal.toArray()); colors.push(index/255,0,0);
        vertexIds.set(id,n);
        return n;
    };
    let degenerateTriangles = 0;
    const triangle = (points: Point[]) => {
        const centroid = [0,1,2].map(a => points.reduce((sum,p) => sum+p[a]/3,0)) as Point;
        const source = nearby(centroid)[0].voxel.colorIndex;
        const a = new Vector3(...points[0]), b = new Vector3(...points[1]), c = new Vector3(...points[2]);
        const face = b.sub(a).cross(c.sub(a));
        if (face.lengthSq() < 1e-12) { degenerateTriangles++; return; }
        if (face.dot(outward(centroid)) < 0) points = [points[0],points[2],points[1]];
        indices.push(...points.map(p => addVertex(p,source)));
        materialCounts[source] = (materialCounts[source] ?? 0)+1;
    };
    // Each crossing sample edge joins its four incident surface cells.
    for (let axis=0; axis<3; axis++) {
        const a=(axis+1)%3, b=(axis+2)%3;
        for (let z=1; z<dimensions[2]-1; z++) for (let y=1; y<dimensions[1]-1; y++) for (let x=1; x<dimensions[0]-1; x++) {
            const p=[x,y,z], q=[...p]; q[axis]++;
            if ((samples[key(...p as Point)]>=0.5) === (samples[key(...q as Point)]>=0.5)) continue;
            const cells = [[-1,-1],[0,-1],[0,0],[-1,0]].map(([da,db]) => {
                const v=[...p]; v[a]+=da; v[b]+=db;
                return cellVertices.get(key(...v as Point));
            });
            if (cells.some(v => !v)) throw Error('Open surface at grid boundary');
            triangle([cells[0]!,cells[1]!,cells[2]!]); triangle([cells[0]!,cells[2]!,cells[3]!]);
        }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal', new Float32BufferAttribute(shading,3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors,3));
    geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return { geometry, provenance: { sourceVoxels: voxels.length, materialCounts, degenerateTriangles,
        method: 'Half-voxel surface nets; original material regions and locally averaged source normals; original palette regions retained.' } };
}

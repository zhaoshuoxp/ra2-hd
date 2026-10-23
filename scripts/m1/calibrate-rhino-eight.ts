// Original VXL projection measures artwork scale only; never modifies geometry or rules.
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { Section } from '../../src/data/vxl/Section';
import { VxlGeometryMonotoneBuilder } from '../../src/engine/renderable/builder/vxlGeometry/VxlGeometryMonotoneBuilder';

const camera = new THREE.Object3D();
camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0, 'YXZ'); camera.updateMatrixWorld();
const view = camera.matrixWorld.clone().invert();
const axis = new THREE.Object3D();
axis.rotation.set(-Math.PI / 2, 0, Math.PI / 2); axis.updateMatrix();
const points = new Map<string, THREE.Vector3[]>();
for (const stem of ['htnk', 'htnktur', 'htnkbarl']) {
    const source = JSON.parse(readFileSync(`.artifacts/m1-3/source-v1/${stem}.json`, 'utf8'));
    const vertices: THREE.Vector3[] = [];
    for (const plain of source.sections) {
        const geometry = new VxlGeometryMonotoneBuilder().build(new Section().fromPlain(plain));
        const hva = new THREE.Matrix4().fromArray(plain.appliedHva);
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) vertices.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(hva).applyMatrix4(axis.matrix));
        geometry.dispose();
    }
    points.set(stem, vertices);
}
const result: any = { purpose: 'Relative native projected width; accepted artwork width at heading 0 remains the anchor.', parts: {} };
for (const [part, stems, acceptedWidth] of [['body', ['htnk'], 52], ['turret', ['htnktur', 'htnkbarl'], 39]] as const) {
    const measures: any = {};
    for (let heading = 0; heading < 360; heading += 45) {
        const rotation = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(heading));
        const box = new THREE.Box3().setFromPoints(stems.flatMap(s => points.get(s)!.map(p => p.clone().applyMatrix4(rotation).applyMatrix4(view))));
        measures[heading] = { width: box.max.x - box.min.x, height: box.max.y - box.min.y };
    }
    for (const measure of Object.values(measures) as any[]) measure.artworkWidth = acceptedWidth * measure.width / measures[0].width;
    result.parts[part] = measures;
}
writeFileSync('.artifacts/m1-3e/native-projection.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));

import * as THREE from 'three';
import { createSpriteGeometry } from '../../gfx/SpriteUtils';
import { Coords } from '../../../game/Coords';
import type { VxlFrame, VxlPart } from './loadVxlFamily';

// Clip one shared actor depth surface to each component's registered image.
// Independent crop bounds must never change the depth at overlapping pixels.
export function componentGeometry(
    part: VxlPart,
    frame: VxlFrame,
    camera: THREE.Camera,
    ground: boolean,
    bias: number,
    rotor?: { axis: THREE.Vector3; center: THREE.Vector3 },
    missile = false,
    bodyHeight?: [number, number],
) {
    const [x, y, width, height] = frame.rect;
    const origin = new THREE.Vector3().fromArray(frame.referenceOrigin ?? [0, 0, 0]);
    const rotation = new THREE.Matrix4().makeRotationFromEuler(
        new THREE.Euler(camera.rotation.x, camera.rotation.y, 0, 'YXZ'),
    );
    const inverse = rotation.clone().invert();
    const scale = Math.cos(camera.rotation.y) * Coords.ISO_WORLD_SCALE;
    const screenOrigin = origin.clone().applyMatrix4(inverse);
    const reference = rotor ? new THREE.Matrix4().fromArray(frame.referenceLinear) : new THREE.Matrix4();
    const rotorNormal = rotor?.axis.clone().transformDirection(reference);
    const rotorCenter = rotor?.center.clone();
    // An authored hub must lie on the native spin axis, rather than orbit it.
    // Keep the original registration for resources without an explicit anchor.
    if (rotorCenter && frame.rotorAnchor) rotorCenter.projectOnVector(rotor!.axis);
    const rotorPoint = rotorCenter?.applyMatrix4(reference).add(origin);
    const anchorPoint = rotorPoint?.clone().applyMatrix4(inverse);
    const left = rotor && frame.rotorAnchor
        ? anchorPoint!.x / scale - frame.rotorAnchor[0] * frame.logicalSize[0]
        : frame.offset[0] + screenOrigin.x / scale;
    const top = rotor && frame.rotorAnchor
        ? -anchorPoint!.y / scale - frame.rotorAnchor[1] * frame.logicalSize[1]
        : frame.offset[1] - screenOrigin.y / scale;
    const bounds = part.depthBounds ?? [
        left,
        top,
        left + frame.logicalSize[0],
        top + frame.logicalSize[1],
    ];
    const geometry = createSpriteGeometry({
        camera,
        texture: part.override.pages[0].base,
        textureArea: { x, y, width, height },
        textureSize: { width: part.pageSize[0], height: part.pageSize[1] },
        logicalSize: { width: bounds[2] - bounds[0], height: bounds[3] - bounds[1] },
        offset: { x: bounds[0], y: bounds[1] },
        align: { x: 1, y: -1 },
        scale: Coords.ISO_WORLD_SCALE,
        depth: true,
    });
    const toward = new THREE.Vector3(0, 0, 1).applyMatrix4(rotation);
    if (rotorNormal && Math.abs(rotorNormal.dot(toward)) < 0.05)
        throw Error('Rotor reference plane is edge-on');
    // A missile needs depth along its length. The generic folded sprite surface
    // can leave its painted nose pointing upward even during a native dive.
    // Recover a plane containing the VXL longitudinal axis along camera rays;
    // this preserves the accepted level-flight image and its native pivot.
    const missileAxis = missile
        ? new THREE.Vector3(1, 0, 0).transformDirection(new THREE.Matrix4().fromArray(frame.referenceLinear))
        : undefined;
    const missileNormal = missileAxis
        ? toward.clone().addScaledVector(missileAxis, -toward.dot(missileAxis)).normalize()
        : undefined;
    const positions = geometry.getAttribute('position');
    const vertices = Array.from({ length: positions.count }, (_, i) => {
        const p = new THREE.Vector3().fromBufferAttribute(positions, i);
        const screen = p.clone().applyMatrix4(inverse);
        if (rotorNormal && rotorPoint) {
            // Recover the actual rotor plane along camera rays. A billboard
            // would stretch or vanish when the native rotor joint spins.
            p.addScaledVector(toward, rotorPoint.clone().sub(p).dot(rotorNormal) / rotorNormal.dot(toward));
        } else if (missileNormal) {
            p.addScaledVector(toward, origin.clone().sub(p).dot(missileNormal) / missileNormal.dot(toward));
        } else if (bodyHeight) {
            // A folded sprite is not the helicopter's physical fuselage. Its
            // depth can otherwise rise through the rotor disks and hide blades.
            // Recover the native body's height range along camera rays, keeping
            // every authored pixel and avoiding the old voxel silhouette mask.
            const height = THREE.MathUtils.clamp(p.y, bodyHeight[0], bodyHeight[1]);
            p.addScaledVector(toward, (height - p.y) / toward.y);
        } else if (ground && p.y < 0.1) p.addScaledVector(toward, (0.1 - p.y) / toward.y);
        p.addScaledVector(toward, bias).sub(origin);
        return { p, x: screen.x / scale, y: -screen.y / scale };
    });
    type Vertex = (typeof vertices)[number];
    const output: number[] = [],
        uvs: number[] = [];
    const edges = [
        ['x', left, 1],
        ['x', left + frame.logicalSize[0], -1],
        ['y', top, 1],
        ['y', top + frame.logicalSize[1], -1],
    ] as const;
    const emit = (v: Vertex) => {
        output.push(...v.p.toArray());
        uvs.push(
            (x + ((v.x - left) / frame.logicalSize[0]) * width) / part.pageSize[0],
            1 - (y + ((v.y - top) / frame.logicalSize[1]) * height) / part.pageSize[1],
        );
    };
    const indices = geometry.index!.array;
    for (let i = 0; i < indices.length; i += 3) {
        let polygon = [vertices[indices[i]], vertices[indices[i + 1]], vertices[indices[i + 2]]];
        for (const [axis, limit, sign] of edges) {
            const clipped: Vertex[] = [];
            for (let j = 0; j < polygon.length; j++) {
                const a = polygon[j],
                    b = polygon[(j + 1) % polygon.length];
                const insideA = (a[axis] - limit) * sign >= 0;
                const insideB = (b[axis] - limit) * sign >= 0;
                if (insideA) clipped.push(a);
                if (insideA !== insideB) {
                    const t = (limit - a[axis]) / (b[axis] - a[axis]);
                    clipped.push({
                        p: a.p.clone().lerp(b.p, t),
                        x: a.x + (b.x - a.x) * t,
                        y: a.y + (b.y - a.y) * t,
                    });
                }
            }
            polygon = clipped;
        }
        for (let j = 1; j + 1 < polygon.length; j++) {
            emit(polygon[0]);
            emit(polygon[j]);
            emit(polygon[j + 1]);
        }
    }
    geometry.dispose();
    if (!output.length) throw Error('Empty registered VXL surface');
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(output, 3));
    result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return result;
}

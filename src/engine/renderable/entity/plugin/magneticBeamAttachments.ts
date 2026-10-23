import * as THREE from 'three';

// Midpoints between the paired tips in the accepted eight-view TELE turret.
// These normalized image positions follow the selected live registered surface.
const muzzleTips: Record<number, [number, number]> = {
    0: [.88, .12], 45: [.51, .04], 90: [.15, .11], 135: [.035, .43],
    180: [.10, .73], 225: [.50, .88], 270: [.84, .73], 315: [.97, .43],
};
const feet = new WeakMap<THREE.BufferGeometry, THREE.Vector3[]>();

export function surfacePoint(shape: any, uvPoint: THREE.Vector2): THREE.Vector3 | undefined {
    const geometry = shape.geometry as THREE.BufferGeometry, uv = geometry.getAttribute('uv');
    const positions = geometry.getAttribute('position'), index = geometry.index;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), weights = new THREE.Vector3();
    const point = new THREE.Vector3(uvPoint.x, uvPoint.y, 0);
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
        const ia = index ? index.getX(i) : i, ib = index ? index.getX(i + 1) : i + 1, ic = index ? index.getX(i + 2) : i + 2;
        a.set(uv.getX(ia), uv.getY(ia), 0); b.set(uv.getX(ib), uv.getY(ib), 0); c.set(uv.getX(ic), uv.getY(ic), 0);
        if (!THREE.Triangle.getBarycoord(point, a, b, c, weights) || Math.min(weights.x, weights.y, weights.z) < -.00001) continue;
        a.fromBufferAttribute(positions, ia).multiplyScalar(weights.x);
        b.fromBufferAttribute(positions, ib).multiplyScalar(weights.y);
        c.fromBufferAttribute(positions, ic).multiplyScalar(weights.z);
        return a.add(b).add(c);
    }
}

function visibleFrame(renderable: any, turret: boolean): any {
    const layer = renderable?.unitVxlHd?.active && renderable.unitVxlHd.layers.find((layer: any) => layer.turret === turret);
    return layer?.frames.find((frame: any) => frame.batch.visible || frame.translucent.visible);
}

export function magneticMuzzle(source: any, renderable: any): THREE.Vector3 {
    const frame = source.name === 'TELE' && visibleFrame(renderable, true);
    if (frame && frame.part.member === 'teletur.vxl') {
        const [x, y, width, height] = frame.frame.rect, [nx, ny] = muzzleTips[frame.frame.heading];
        const uv = new THREE.Vector2((x + width * nx) / frame.part.pageSize[0], 1 - (y + height * ny) / frame.part.pageSize[1]);
        const point = surfacePoint(frame.batch, uv);
        if (point) { frame.batch.updateWorldMatrix(true, false); return point.applyMatrix4(frame.batch.matrixWorld); }
    }
    const flh = source.armedTrait?.primaryWeapon?.flh ?? source.art?.primaryFireFlh;
    const axis = new THREE.Vector3(0, 1, 0);
    const position = new THREE.Vector3(flh?.lateral ?? 0, flh?.vertical ?? 0, -(flh?.forward ?? 0))
        .applyAxisAngle(axis, THREE.MathUtils.degToRad(Math.floor(source.turretTrait?.facing ?? source.direction ?? 0)));
    position.add(new THREE.Vector3(0, 0, -(source.art?.turretOffset ?? 0))
        .applyAxisAngle(axis, THREE.MathUtils.degToRad(Math.floor(source.direction ?? 0))));
    return position.add(source.position.worldPosition);
}

export function magneticBodyBounds(renderable: any): THREE.Box3 | undefined {
    const body = renderable?.bodyVxlBuilder;
    if (!body?.sections?.size) return;
    const bounds = new THREE.Box3();
    for (const mesh of body.sections.values()) {
        mesh.updateWorldMatrix(true, false);
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    }
    return bounds.isEmpty() ? undefined : bounds;
}

export function magneticFoot(target: any, renderable: any, source: THREE.Vector3, camera: THREE.Camera): THREE.Vector3 {
    const frame = visibleFrame(renderable, false);
    if (frame) {
        const shape = frame.batch;
        let points = feet.get(shape.geometry);
        if (!points) {
            const image = frame.part.override.pages[0].base.image;
            if (image?.data) {
                const [left, top, width, height] = frame.frame.rect, edge: [number, number][] = [];
                for (let x = left; x < left + width; x++) {
                    for (let y = top + height - 1; y >= top; y--) {
                        if (image.data[(y * image.width + x) * 4 + 3] < 128) continue;
                        edge.push([x, y]); break;
                    }
                }
                const bottom = Math.max(...edge.map(point => point[1]));
                points = edge.filter(point => point[1] >= bottom - height * .25).map(([x, y]) =>
                    surfacePoint(shape, new THREE.Vector2((x + .5) / image.width, 1 - (y + .5) / image.height)))
                    .filter((point): point is THREE.Vector3 => !!point);
                feet.set(shape.geometry, points);
            }
        }
        if (points?.length) {
            shape.updateWorldMatrix(true, false);
            const start = source.clone().project(camera);
            const aspect = camera.projectionMatrix.elements[5] / camera.projectionMatrix.elements[0];
            let closest: THREE.Vector3 | undefined, distance = Infinity;
            for (const local of points) {
                const world = local.clone().applyMatrix4(shape.matrixWorld), screen = world.clone().project(camera);
                const squared = ((screen.x - start.x) * aspect) ** 2 + (screen.y - start.y) ** 2;
                if (squared < distance) { closest = world; distance = squared; }
            }
            if (closest) return closest;
        }
    }
    const bounds = magneticBodyBounds(renderable);
    if (!bounds) return target.position.worldPosition.clone();
    // The selected gameplay reference uses this near bottom footprint contact,
    // with the field partially overlapping the visible hull in projection.
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const dx = source.x - center.x, dz = source.z - center.z;
    const step = Math.min(dx ? size.x / 2 / Math.abs(dx) : Infinity, dz ? size.z / 2 / Math.abs(dz) : Infinity);
    center.y = bounds.min.y;
    if (Number.isFinite(step)) { center.x += dx * step; center.z += dz * step; }
    return center;
}

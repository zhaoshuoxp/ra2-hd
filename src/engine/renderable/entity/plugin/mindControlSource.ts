import * as THREE from 'three';
import { Coords } from '@/game/Coords';

const crowns = new WeakMap<THREE.BufferGeometry, WeakMap<THREE.Texture, THREE.Vector2>>();

// Atlas padding is not the roof/head. Inspect the opaque crown once per frame,
// including the lossless tile pool, then attach through the live sprite surface.
function opaqueCrown(shape: any): THREE.Vector3 | undefined {
    const geometry = shape.geometry as THREE.BufferGeometry, material = shape.material;
    const texture = material?.map as THREE.Texture | undefined;
    const image = texture?.image as { data?: Uint8Array; width: number; height: number } | undefined;
    const pixels = image?.data, uv = geometry.getAttribute('uv');
    if (!texture || !image || !pixels || !uv) return;
    let frames = crowns.get(geometry);
    if (!frames) { frames = new WeakMap(); crowns.set(geometry, frames); }
    let crown = frames.get(texture);
    if (!crown) {
        const tiles = material.uniforms?.hdTileMap?.value?.image;
        const [width, height] = material.uniforms?.hdVirtualSize?.value ?? [image.width, image.height];
        let left = 1, right = 0, bottom = 1, top = 0;
        for (let i = 0; i < uv.count; i++) {
            left = Math.min(left, uv.getX(i)); right = Math.max(right, uv.getX(i));
            bottom = Math.min(bottom, uv.getY(i)); top = Math.max(top, uv.getY(i));
        }
        const indexed = !material.uniforms?.remapMap?.value;
        const alpha = (x: number, y: number) => {
            if (tiles) {
                const at = (Math.floor(y / 4) * tiles.width + Math.floor(x / 4)) * 4;
                const tile = tiles.data[at] + tiles.data[at + 1] * 256 + tiles.data[at + 2] * 65536;
                const columns = image.width / 4;
                x = tile % columns * 4 + x % 4; y = Math.floor(tile / columns) * 4 + y % 4;
            }
            return pixels[(y * image.width + x) * 4 + 3];
        };
        search: for (let y = Math.max(0, Math.round((1 - top) * height)); y < Math.min(height, Math.round((1 - bottom) * height)); y++) {
            let sum = 0, count = 0;
            for (let x = Math.max(0, Math.round(left * width)); x < Math.min(width, Math.round(right * width)); x++) {
                if (alpha(x, y) >= (indexed ? 1 : 128)) { sum += x + .5; count++; }
            }
            if (count) { crown = new THREE.Vector2(sum / count / width, 1 - (y + .5) / height); break search; }
        }
        if (!crown) return;
        frames.set(texture, crown);
    }
    const positions = geometry.getAttribute('position'), index = geometry.index;
    const count = index?.count ?? positions.count;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), weights = new THREE.Vector3();
    const point = new THREE.Vector3(crown.x, crown.y, 0);
    for (let i = 0; i < count; i += 3) {
        const ia = index ? index.getX(i) : i, ib = index ? index.getX(i + 1) : i + 1, ic = index ? index.getX(i + 2) : i + 2;
        a.set(uv.getX(ia), uv.getY(ia), 0); b.set(uv.getX(ib), uv.getY(ib), 0); c.set(uv.getX(ic), uv.getY(ic), 0);
        if (!THREE.Triangle.getBarycoord(point, a, b, c, weights) || Math.min(weights.x, weights.y, weights.z) < -.00001) continue;
        a.fromBufferAttribute(positions, ia).multiplyScalar(weights.x);
        b.fromBufferAttribute(positions, ib).multiplyScalar(weights.y);
        c.fromBufferAttribute(positions, ic).multiplyScalar(weights.z);
        shape.updateWorldMatrix(true, false);
        return a.add(b).add(c).applyMatrix4(shape.matrixWorld);
    }
}

export function mindControlSource(source: any, renderable: any, camera?: THREE.Camera): THREE.Vector3 {
    const layer = renderable?.unitVxlHd?.active
        ? renderable.unitVxlHd.layers.find((layer: any) => !layer.turret) : undefined;
    const frame = layer?.frames.find((frame: any) => frame.batch.visible || frame.translucent.visible);
    const shape = frame?.batch ?? renderable?.shpRenderable?.getShapeMesh();
    const crown = shape && opaqueCrown(shape);
    if (crown) return crown;
    const position = source.position.worldPosition.clone();
    const body = renderable?.bodyVxlBuilder;
    if (body?.sections?.size) {
        const bounds = new THREE.Box3();
        for (const mesh of body.sections.values()) {
            mesh.updateWorldMatrix(true, false);
            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
        }
        if (!bounds.isEmpty()) { bounds.getCenter(position); position.y = bounds.max.y; return position; }
    }
    const vertices = shape?.geometry?.getAttribute('position');
    if (vertices && camera) {
        shape.updateWorldMatrix(true, false);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
        let top = -Infinity, left = Infinity, end = -Infinity, depth = 0;
        const point = new THREE.Vector3();
        for (let i = 0; i < vertices.count; i++) {
            point.fromBufferAttribute(vertices, i).applyMatrix4(shape.matrixWorld);
            top = Math.max(top, point.dot(up)); left = Math.min(left, point.dot(right)); end = Math.max(end, point.dot(right));
            depth += point.dot(normal) / vertices.count;
        }
        return up.multiplyScalar(top).addScaledVector(right, (left + end) / 2).addScaledVector(normal, depth);
    }
    position.y += (source.isInfantry?.() && source.art?.primaryFireFlh?.vertical) || Coords.LEPTONS_PER_TILE / 4;
    return position;
}

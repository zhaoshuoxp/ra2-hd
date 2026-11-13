import * as THREE from 'three';
import { BufferGeometryUtils } from '@/engine/gfx/BufferGeometryUtils';

function nativeAttribute(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): attribute is THREE.BufferAttribute {
    return attribute instanceof THREE.BufferAttribute && attribute.constructor === THREE.BufferAttribute
        && attribute.array instanceof Float32Array && Number.isInteger(attribute.count)
        && attribute.count * 3 === attribute.array.length
        && attribute.itemSize === 3 && !attribute.normalized && attribute.usage === THREE.StaticDrawUsage
        && attribute.gpuType === THREE.FloatType && attribute.name === ''
        && attribute.getX === THREE.BufferAttribute.prototype.getX
        && attribute.getY === THREE.BufferAttribute.prototype.getY
        && attribute.getZ === THREE.BufferAttribute.prototype.getZ;
}

// The generic merger keys each vertex by the string of its truncated
// (~~(value * 10000)) components. Two vertices share a string exactly when all
// truncated int32 components are equal, so an integer tuple table is the same
// equivalence relation without building one string per index entry.
function quantize(values: Float32Array, offset: number, target: Int32Array, at: number): void {
    // Keep the project's existing truncation, including negative and wrapped values.
    target[at] = ~~(values[offset] * 10000);
    target[at + 1] = ~~(values[offset + 1] * 10000);
    target[at + 2] = ~~(values[offset + 2] * 10000);
}

// Native monotone meshes have a fixed, unnormalized Float32 layout. Preserve
// first-index order and exact samples while avoiding generic getters, growing
// number arrays and attribute copies that geometry.clone() would replace.
export function mergeNativeVxlVertices(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const { position, normal, color } = geometry.attributes, index = geometry.index;
    const names = Object.keys(geometry.attributes).join(',');
    if (geometry.constructor !== THREE.BufferGeometry || !nativeAttribute(position) || !nativeAttribute(color)
        || (normal !== undefined && !nativeAttribute(normal)) || color.count !== position.count
        || (normal !== undefined && normal.count !== position.count)
        || names !== (normal ? 'position,normal,color' : 'position,color')
        || !index || index.constructor !== THREE.BufferAttribute || !(index.array instanceof Uint32Array)
        || index.itemSize !== 1 || index.normalized || index.count !== index.array.length
        || index.getX !== THREE.BufferAttribute.prototype.getX
        || geometry.groups.length || Object.keys(geometry.morphAttributes).length || geometry.morphTargetsRelative
        || geometry.boundingBox || geometry.boundingSphere || geometry.name || Object.keys(geometry.userData).length
        || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) {
        return BufferGeometryUtils.mergeVertices(geometry);
    }
    const positions = position.array as Float32Array, colors = color.array as Float32Array;
    const normals = normal?.array as Float32Array | undefined;
    const outputPositions = new Float32Array(positions.length), outputColors = new Float32Array(colors.length);
    const outputNormals = normals && new Float32Array(normals.length), outputIndices = new Uint32Array(index.count);
    const indices = index.array as Uint32Array, vertexCount = position.count;
    for (let i = 0; i < indices.length; i++) {
        if (indices[i] >= vertexCount) return BufferGeometryUtils.mergeVertices(geometry);
    }
    // Every source vertex has one key, so it always resolves to the same merged
    // index; resolve each referenced source vertex once.
    const resolved = new Int32Array(vertexCount).fill(-1);
    const width = normals ? 9 : 6, keys = new Int32Array(Math.max(1, vertexCount) * width), key = new Int32Array(width);
    let slots = 1;
    while (slots < vertexCount * 2) slots <<= 1;
    const table = new Int32Array(slots).fill(-1), mask = slots - 1;
    let nextIndex = 0;
    for (let i = 0; i < indices.length; i++) {
        const vertex = indices[i];
        let merged = resolved[vertex];
        if (merged < 0) {
            const offset = vertex * 3;
            quantize(positions, offset, key, 0);
            if (normals) quantize(normals, offset, key, 3);
            quantize(colors, offset, key, width - 3);
            let hash = 0x811c9dc5;
            for (let k = 0; k < width; k++) hash = Math.imul(hash ^ key[k], 0x01000193);
            let slot = (hash ^ (hash >>> 15)) & mask;
            for (;; slot = (slot + 1) & mask) {
                const candidate = table[slot];
                if (candidate < 0) {
                    merged = nextIndex++; table[slot] = merged;
                    keys.set(key, merged * width);
                    const target = merged * 3;
                    for (let component = 0; component < 3; component++) {
                        outputPositions[target + component] = positions[offset + component];
                        outputColors[target + component] = colors[offset + component];
                        if (outputNormals && normals) outputNormals[target + component] = normals[offset + component];
                    }
                    break;
                }
                let same = true;
                for (let k = 0, base = candidate * width; k < width; k++) {
                    if (keys[base + k] !== key[k]) { same = false; break; }
                }
                if (same) { merged = candidate; break; }
            }
            resolved[vertex] = merged;
        }
        outputIndices[i] = merged;
    }
    const length = nextIndex * 3;
    const compact = (values: Float32Array) => length === values.length ? values : values.slice(0, length);
    const result = new THREE.BufferGeometry();
    result.userData = geometry.userData;
    result.setAttribute('position', new THREE.BufferAttribute(compact(outputPositions), 3));
    if (outputNormals) result.setAttribute('normal', new THREE.BufferAttribute(compact(outputNormals), 3));
    result.setAttribute('color', new THREE.BufferAttribute(compact(outputColors), 3));
    result.setIndex(new THREE.BufferAttribute(outputIndices, 1));
    return result;
}

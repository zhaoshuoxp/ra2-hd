import fs from 'node:fs';
import assert from 'node:assert/strict';
import { checkVoxelPaletteGpu } from './voxel-palette-gpu.mjs';

export async function runMcvProbe(page, output) {
    const { audit, images } = await page.evaluate(() => {
        const d = window.__ra2debug, T = window.THREE;
        const unit = d.localPlayer.getOwnedObjects().find(o => o.name === 'AMCV');
        const renderable = d.renderableManager.getRenderableByGameObject(unit);
        const builder = renderable.bodyVxlBuilder;
        const section = builder.vxlFile.sections[0];
        const mesh = [...builder.sections.values()][0];
        const { voxels, voxelField } = section.getAllVoxels();
        const cube = new T.BoxGeometry(1, 1, 1), positions = [], normals = [], colors = [], indices = [];
        const p = cube.attributes.position, n = cube.attributes.normal, index = cube.index;
        for (const voxel of voxels) {
            const normal = section.getNormals()[voxel.normalIndex];
            for (let face = 0; face < 6; face++) {
                const first = face * 4;
                if (voxelField.get(voxel.x + n.getX(first), voxel.y + n.getY(first), voxel.z + n.getZ(first))) continue;
                const base = positions.length / 3;
                for (let j = first; j < first + 4; j++) {
                    positions.push(section.minBounds.x + (voxel.x + p.getX(j) + .5) * section.scaleX,
                        section.minBounds.y + (voxel.y + p.getY(j) + .5) * section.scaleY,
                        section.minBounds.z + (voxel.z + p.getZ(j) + .5) * section.scaleZ);
                    normals.push(normal.x, normal.y, normal.z);
                    colors.push(voxel.colorIndex / 255, 0, 0);
                }
                for (let j = face * 6; j < face * 6 + 6; j++) indices.push(base + index.getX(j) - first);
            }
        }
        const oracle = new T.BufferGeometry();
        oracle.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
        oracle.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
        oracle.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
        oracle.setIndex(indices);
        oracle.computeBoundingBox();
        const area = geometry => {
            const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
            let sum = 0, volume = 0;
            for (let i = 0; i < geometry.index.count; i += 3) {
                a.fromBufferAttribute(geometry.attributes.position, geometry.index.getX(i));
                b.fromBufferAttribute(geometry.attributes.position, geometry.index.getX(i + 1));
                c.fromBufferAttribute(geometry.attributes.position, geometry.index.getX(i + 2));
                volume += a.dot(b.clone().cross(c)) / 6;
                sum += b.sub(a).cross(c.sub(a)).length() / 2;
            }
            return { area: sum, volume, vertices: geometry.attributes.position.count, triangles: geometry.index.count / 3 };
        };
        const original = mesh.geometry, light = mesh.material.extraLight.clone(), rotation = mesh.quaternion.clone();
        const matrix = mesh.matrix.clone(), visible = mesh.visible;
        const palette = builder.palette, opacity = mesh.material.opacity, transparent = mesh.material.transparent;
        const ambient = d.worldScene.ambientLight, ambientIntensity = ambient.intensity;
        const audit = { original: area(original), oracle: area(oracle), voxelVolume: voxels.length * section.scaleX * section.scaleY * section.scaleZ,
            normalMode: section.normalsMode, normals: section.getNormals().length, material: mesh.material.type,
            extraLight: light.toArray(), scale: mesh.scale.toArray(), angles: [],
            useVoxelLookup: !!mesh.material.uniforms.useVoxelLookup?.value };
        const canvas = d.renderer.renderer.domElement, gl = d.renderer.renderer.getContext();
        const pixels = () => {
            const data = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
            return data;
        };
        const images = {};
        // Each pair is rendered in the same JS turn: no simulation or animation changes.
        try {
            for (let facing = 0; facing < 8; facing++) {
                mesh.quaternion.copy(rotation);
                mesh.rotateZ(facing * Math.PI / 4);
                mesh.updateMatrix();
                mesh.updateMatrixWorld(true);
                mesh.geometry = original;
                d.renderer.render();
                const before = pixels();
                images[`facing-${facing * 45}`] = canvas.toDataURL();
                if (!facing) {
                    images.original = canvas.toDataURL();
                    mesh.visible = false;
                    d.renderer.render();
                    const hidden = pixels();
                    audit.visibleControlChangedPixels = hidden.reduce((n, value, i) => n + (i % 4 === 0 &&
                        (value !== before[i] || hidden[i + 1] !== before[i + 1] || hidden[i + 2] !== before[i + 2]) ? 1 : 0), 0);
                    mesh.visible = visible;
                }
                mesh.geometry = oracle;
                d.renderer.render();
                const after = pixels();
                if (!facing) images.oracle = canvas.toDataURL();
                let changedPixels = 0, maxChannelDelta = 0;
                for (let i = 0; i < before.length; i += 4) {
                    let delta = 0;
                    for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(before[i + c] - after[i + c]));
                    if (delta) changedPixels++;
                    maxChannelDelta = Math.max(maxChannelDelta, delta);
                }
                audit.angles.push({ degrees: facing * 45, changedPixels, maxChannelDelta });
            }
            mesh.quaternion.copy(rotation);
            mesh.matrix.copy(matrix);
            mesh.updateMatrixWorld(true);
            mesh.geometry = original;
            if (audit.useVoxelLookup) {
                d.renderer.render();
                const baseline = pixels();
                const changed = () => {
                    const current = pixels();
                    let count = 0;
                    for (let i = 0; i < current.length; i += 4) {
                        if (current[i] !== baseline[i] || current[i + 1] !== baseline[i + 1] || current[i + 2] !== baseline[i + 2]) count++;
                    }
                    return count;
                };
                audit.materialChecks = {};
                mesh.material.uniforms.useVoxelLookup.value = false;
                d.renderer.render();
                images.phongFallback = canvas.toDataURL();
                audit.materialChecks.vplChangedPixels = changed();
                mesh.material.uniforms.useVoxelLookup.value = true;
                builder.setPalette(palette.clone().remap({ r: 0, g: 64, b: 255 }));
                d.renderer.render();
                images.blueRemap = canvas.toDataURL();
                audit.materialChecks.remapChangedPixels = changed();
                builder.setPalette(palette);
                ambient.intensity *= 0.5;
                d.renderer.render();
                images.halfAmbient = canvas.toDataURL();
                audit.materialChecks.ambientChangedPixels = changed();
                ambient.intensity = ambientIntensity;
                builder.setOpacity(0.5);
                d.renderer.render();
                images.halfOpacity = canvas.toDataURL();
                audit.materialChecks.opacityChangedPixels = changed();
                builder.setOpacity(opacity);
                mesh.material.transparent = transparent;
            }
            mesh.material.extraLight.setScalar(0);
            d.renderer.render();
            images.noExtraLight = canvas.toDataURL();
        } finally {
            mesh.quaternion.copy(rotation);
            mesh.matrix.copy(matrix);
            mesh.updateMatrixWorld(true);
            mesh.visible = visible;
            mesh.geometry = original;
            mesh.material.extraLight.copy(light);
            builder.setPalette(palette);
            builder.setOpacity(opacity);
            mesh.material.transparent = transparent;
            ambient.intensity = ambientIntensity;
            if (mesh.material.uniforms.useVoxelLookup) mesh.material.uniforms.useVoxelLookup.value = audit.useVoxelLookup;
            oracle.dispose();
            cube.dispose();
            d.renderer.render();
        }
        return { audit, images };
    });
    for (const [name, data] of Object.entries(images)) {
        fs.writeFileSync(`${output}/mcv-${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
    }
    if (audit.useVoxelLookup) audit.gpuPaletteSamples = await checkVoxelPaletteGpu(page);
    fs.writeFileSync(`${output}/mesh-audit.json`, JSON.stringify(audit, null, 2));
    assert.ok(Math.abs(audit.original.area / audit.oracle.area - 1) < 1e-6, 'exposed surface area mismatch');
    assert.ok(Math.abs(audit.original.volume / audit.voxelVolume - 1) < 1e-6, 'occupied volume mismatch');
    assert.ok(audit.visibleControlChangedPixels > 100, 'MCV must be visible in the pixel comparison');
    assert.ok(audit.angles.every(angle => angle.changedPixels === 0), 'mesher changed the rendered voxel surface');
    if (audit.useVoxelLookup) {
        for (const [name, count] of Object.entries(audit.materialChecks)) assert.ok(count > 20, `${name} has no visible effect`);
    }
    assert.ok(new Set(Object.entries(images).filter(([name]) => name.startsWith('facing-')).map(([, data]) => data)).size >= 4,
        'probe must exercise distinct model orientations');
    return audit;
}

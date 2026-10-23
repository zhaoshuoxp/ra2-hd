import fs from 'node:fs';

// Isolated A/B experiment. Nothing here changes the production shader or rules.
export async function runMcvVplProbe(page, output) {
    const tables = JSON.parse(fs.readFileSync('.artifacts/mcv/vpl-tables.json', 'utf8'));
    const result = await page.evaluate(tables => {
        const d = window.__ra2debug, T = window.THREE;
        const unit = d.localPlayer.getOwnedObjects().find(o => o.name === 'AMCV');
        const renderable = d.renderableManager.getRenderableByGameObject(unit);
        const mesh = [...renderable.bodyVxlBuilder.sections.values()][0];
        const original = mesh.material, rotation = mesh.quaternion.clone(), matrix = mesh.matrix.clone();
        const vpl = new T.DataTexture(new Uint8Array(tables), 256, 32, T.RedFormat);
        vpl.minFilter = vpl.magFilter = T.NearestFilter;
        vpl.needsUpdate = true;
        const light = d.worldScene.directionalLight;
        const direction = light.position.clone().sub(light.target.position).normalize();
        const material = new T.ShaderMaterial({
            uniforms: { palette: { value: original.palette }, vpl: { value: vpl },
                lightDirection: { value: direction.transformDirection(d.worldScene.camera.matrixWorldInverse) },
                upDirection: { value: new T.Vector3(0, 1, 0).transformDirection(d.worldScene.camera.matrixWorldInverse) } },
            vertexShader: `attribute vec3 color;
                varying float paletteIndex;
                varying vec3 voxelNormal;
                void main() {
                    paletteIndex = color.r;
                    voxelNormal = normalMatrix * normal;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: `uniform sampler2D palette;
                uniform sampler2D vpl;
                uniform vec3 lightDirection;
                uniform vec3 upDirection;
                varying float paletteIndex;
                varying vec3 voxelNormal;
                void main() {
                    vec3 n = normalize(voxelNormal);
                    float halfDot = dot(n, normalize(lightDirection + upDirection));
                    float level = min(31.0, floor(16.0 * (max(0.0, dot(n, lightDirection))
                        + max(0.0, halfDot / (3.0 - 2.0 * halfDot)))));
                    float index = texture2D(vpl, vec2((paletteIndex * 255.0 + 0.5) / 256.0, (level + 0.5) / 32.0)).r;
                    gl_FragColor = texture2D(palette, vec2((index * 255.0 + 0.5) / 256.0, 0.5));
                    #include <colorspace_fragment>
                }`,
        });
        const images = {};
        try {
            for (let facing = 0; facing < 8; facing++) {
                mesh.quaternion.copy(rotation);
                mesh.rotateZ(facing * Math.PI / 4);
                mesh.updateMatrix();
                mesh.updateMatrixWorld(true);
                for (const [name, candidate] of [['phong', original], ['vpl', material]]) {
                    mesh.material = candidate;
                    d.renderer.render();
                    images[`${name}-${facing * 45}`] = d.renderer.renderer.domElement.toDataURL();
                }
            }
        } finally {
            mesh.material = original;
            mesh.quaternion.copy(rotation);
            mesh.matrix.copy(matrix);
            mesh.updateMatrixWorld(true);
            material.dispose();
            vpl.dispose();
            d.renderer.render();
        }
        return { images, lightDirection: direction.toArray(), tick: d.game.currentTick };
    }, tables);
    for (const [name, data] of Object.entries(result.images)) {
        fs.writeFileSync(`${output}/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
    }
    return { lightDirection: result.lightDirection, tick: result.tick, diagnosticOnly: true };
}

import assert from 'node:assert/strict';

export async function checkVoxelPaletteGpu(page) {
    const samples = await page.evaluate(() => {
        const d = window.__ra2debug, T = window.THREE;
        const unit = d.localPlayer.getOwnedObjects().find(o => o.name === 'AMCV');
        const builder = d.renderableManager.getRenderableByGameObject(unit).bodyVxlBuilder;
        const Material = [...builder.sections.values()][0].material.constructor;
        const paletteBytes = new Uint8Array(256 * 4), lookupBytes = new Uint8Array(256 * 32);
        for (let index = 0; index < 256; index++) {
            paletteBytes.set([index, 255 - index, 73, 255], index * 4);
            for (let row = 0; row < 32; row++) lookupBytes[row * 256 + index] = (row + index) % 256;
        }
        const palette = new T.DataTexture(paletteBytes, 256, 1), lookup = new T.DataTexture(lookupBytes, 256, 32, T.RedFormat);
        palette.colorSpace = T.SRGBColorSpace;
        palette.needsUpdate = lookup.needsUpdate = true;
        const material = new Material({ palette, voxelLookup: lookup, vertexColors: true,
            extraLight: new T.Vector3().setScalar(Math.PI * 1.5) });
        const geometry = new T.PlaneGeometry(2, 2);
        geometry.setAttribute('color', new T.Float32BufferAttribute([64/255,0,0,64/255,0,0,64/255,0,0,64/255,0,0], 3));
        const renderer = new T.WebGLRenderer({ preserveDrawingBuffer: true });
        renderer.setSize(8, 8);
        const scene = new T.Scene(), camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.z = 5;
        const directional = new T.DirectionalLight(0xffffff, 1);
        directional.position.set(0, 1, 0);
        scene.add(new T.Mesh(geometry, material), new T.AmbientLight(0xffffff, 0.8), directional);
        const result = [];
        try {
            for (const [normalY, row] of [[-1, 0], [1, 31]]) {
                for (let i = 0; i < geometry.attributes.normal.count; i++) geometry.attributes.normal.setXYZ(i, 0, normalY, 0);
                geometry.attributes.normal.needsUpdate = true;
                renderer.render(scene, camera);
                const actual = new Uint8Array(4), gl = renderer.getContext();
                gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, actual);
                const mapped = 64 + row;
                result.push({ row, actual: Array.from(actual), expected: [mapped, 255 - mapped, 73, 255] });
            }
        } finally {
            geometry.dispose(); material.dispose(); palette.dispose(); lookup.dispose(); renderer.dispose();
            renderer.forceContextLoss();
        }
        return result;
    });
    for (const sample of samples) {
        assert.ok(sample.actual.every((channel, i) => Math.abs(channel - sample.expected[i]) <= 1),
            `VPL GPU row ${sample.row}: ${sample.actual} != ${sample.expected}`);
    }
    return samples;
}

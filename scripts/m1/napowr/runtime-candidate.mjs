// Explicit partial-family review injection. Never imported by the game entry.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function captureCandidate(page, output, report) {
    const payload = JSON.parse(await fs.readFile('.artifacts/m1-6a/exports-v1/runtime-payload.json', 'utf8'));
    await page.evaluate(payload => {
        const d = window.__ra2debug, r = window.__napowr;
        const template = d.worldView.conscriptHd.override.pages[0];
        const sets = {};
        window.__napowrTextures = [];
        for (const density of [2, 4]) {
            const pages = [], frames = [];
            for (const entry of payload.filter(e => e.density === density)) {
                const pair = {};
                for (const role of ['base', 'data']) {
                    const rgba = Uint8Array.from(atob(entry[role]), c => c.charCodeAt(0));
                    const texture = new template[role].constructor(rgba, entry.width, entry.height);
                    for (const key of ['colorSpace', 'flipY', 'generateMipmaps', 'minFilter', 'magFilter', 'format', 'type'])
                        texture[key] = template[role][key];
                    texture.needsUpdate = true;
                    pair[role] = texture;
                    window.__napowrTextures.push(texture);
                }
                const index = pages.length;
                pages.push(pair);
                for (const frame of entry.aggregateFrames)
                    frames[frame] = { page: index, sampleRect: { x: 2, y: 2, width: entry.width - 4, height: entry.height - 4 } };
            }
            sets[density] = { identity: `NAPOWR_REPRESENTATIVE_ONLY/${density}`, pages, frames };
        }
        const models = [r.mainObj, r.animObjects.get(2)[0], r.animObjects.get(5)[0]];
        window.__setNapowrCandidate = density => {
            models.forEach((m, i) => {
                // Go through a retained native frame so material ownership changes
                // through the existing builder rather than manual shader replacement.
                m.setFrame([2, 37, 0][i]);
                for (const b of [m.builder, m.zShapeFixBuilder].filter(Boolean))
                    b.hdOverride = density ? sets[density] : undefined;
            });
        };
        window.__napowrReviewSets = sets;
    }, payload);
    const states = [['normal', { body: 0, active: 0 }], ['active-09', { body: 0, active: 9 }], ['damaged', { body: 1, active: 19 }], ['buildup-12', { buildup: 12 }]];
    for (const mode of ['1080p', '4k'])
        for (const [name, state] of states)
            for (const density of [0, 2, 4]) {
                await page.evaluate(density => window.__setNapowrCandidate(density), density);
                const sample = await page.evaluate(s => window.__captureNapowr(s), { ...state, mode });
                const filename = `${name}-${mode}-${density ? 'hd' + density : 'original'}.png`;
                await fs.writeFile(`${output}/${filename}`, Buffer.from(sample.png.split(',')[1], 'base64'));
                delete sample.png;
                sample.filename = filename;
                sample.name = name;
                sample.density = density || 1;
                sample.materials = await page.evaluate(() => { const r = window.__napowr; return [r.mainObj, r.animObjects.get(2)[0], r.animObjects.get(5)[0]].map(m => ({ type: m.getShapeMesh().material.type, identity: m.builder.hdOverride?.identity, shadowMap: m.getShadowMesh()?.material.map?.uuid })); });
                report.samples.push(sample);
                if (density)
                    assert(sample.materials.some(m => m.type === 'HdSpriteMaterial'));
            }
    for (const mode of ['1080p', '4k'])
        for (const [name] of states) {
            const samples = report.samples.filter(s => s.name === name && s.mode === mode);
            for (const s of samples.slice(1))
                for (const key of ['tick', 'logical', 'camera', 'points', 'models'])
                    assert.deepEqual(s[key], samples[0][key], `${name}/${key}`);
        }
    report.diagnosticComposition = 'Full authored active master at native activity depth; transparent diagnostic body retains its indexed shadow. Construction uses its native layer. No ordinary family registered; powered-off body is not validated.';
    report.cleanup = await page.evaluate(() => {
        window.__setNapowrCandidate(0);
        window.__captureNapowr({ body: 0, active: 0 });
        const renderer = window.__ra2debug.renderer.renderer;
        window.__napowrTextures.forEach(t => t.dispose());
        return { textures: window.__napowrTextures.length, released: window.__napowrTextures.every(t => !renderer.properties.get(t).__webglTexture) };
    });
    assert(report.cleanup.released);
}

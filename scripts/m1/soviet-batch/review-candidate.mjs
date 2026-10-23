// Explicit partial representative binding; never registered with production loaders.
import fs from 'node:fs/promises';
export async function install(page, root) {
    const payload = JSON.parse(await fs.readFile(`${root}/${process.env.M16B_EXPORTS ?? 'exports-v1'}/runtime-payload.json`, 'utf8'));
    await page.evaluate(() => {
        window.__batchTextures = [];
        window.__batchSets = {};
    });
    // Keep diagnostic transport bounded when a motion review includes many frames.
    for (const entry of payload) {
        await page.evaluate(entry => {
            const d = window.__ra2debug, template = d.worldView.conscriptHd.override.pages[0], sets = window.__batchSets;
            const key = `${entry.id}/${entry.state}/${entry.density}`;
            const set = sets[key] ??= ({ identity: `M16B_REPRESENTATIVE_ONLY/${key}`, pages: [], frames: [] });
            const pair = {};
            for (const role of ['base', 'data']) {
                const rgba = Uint8Array.from(atob(entry[role]), c => c.charCodeAt(0));
                const texture = new template[role].constructor(rgba, entry.width, entry.height);
                for (const k of ['colorSpace', 'flipY', 'generateMipmaps', 'minFilter', 'magFilter', 'format', 'type'])
                    texture[k] = template[role][k];
                texture.needsUpdate = true;
                pair[role] = texture;
                window.__batchTextures.push(texture);
            }
            const index = set.pages.length;
            set.pages.push(pair);
            set.frames[entry.aggregateFrame] = { page: index, sampleRect: { x: 2, y: 2, width: entry.width - 4, height: entry.height - 4 } };
        }, entry);
    }
    await page.evaluate(() => {
        const sets = window.__batchSets;
        window.__setBatchCandidate = (id, state, density) => {
            const { r, parts } = window.__batchParts(id);
            const set = density ? sets[`${id}/${state}/${density}`] : undefined;
            if (density && !set)
                throw Error(`No authored representative ${id}/${state}/${density}`);
            for (const { m } of parts)
                for (const b of [m.builder, m.zShapeFixBuilder].filter(Boolean)) {
                    // First transition while the OLD binding is intact. Builders alone avoid
                    // offsetting parent shadows twice; the first aggregate shadow is uncovered.
                    b.setFrame(r.aggregatedImageData.file.numImages / 2 - b.frameOffset);
                    b.hdOverride = set;
                }
        };
    });
}

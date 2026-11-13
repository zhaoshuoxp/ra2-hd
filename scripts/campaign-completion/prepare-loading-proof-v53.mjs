import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const history = path.resolve('../project-history/ra2-campaign-completion-20261026');
const output = path.resolve(process.argv[2]);
await fs.mkdir(output, { recursive: true });
for (const mission of ['all01t', 'all02s', 'all03u', 'all04u']) {
    const recipe = JSON.parse(await fs.readFile(path.join(history, 'Art/V53/LoadingWorlds', mission, 'world-recipe.json')));
    const originalBytes = await fs.readFile(recipe.original), original = PNG.sync.read(originalBytes);
    assert.equal(createHash('sha256').update(originalBytes).digest('hex'), recipe.originalPngSha256);
    const rgb = (x, y) => [...original.data.subarray((y * original.width + x) * 4, (y * original.width + x) * 4 + 3)];
    const state = ([r, g, b]) => r > 32 && r > b * 2 && r > g * 2 ? 'red'
        : b > 32 && b > r * 2 && b > g * 1.4 ? 'blue' : undefined;
    const samples = [];
    // The same predeclared uncovered regions are sampled for every source.
    // Classify source pixels only; no generated-image result selects a sample.
    for (const [index, [rx, ry, rw, rh]] of recipe.sourceRegions.entries()) {
        for (const color of ['red', 'blue']) {
            const candidates = [];
            for (let y = ry + 10; y < ry + rh - 10; y += 5) for (let x = rx + 10; x < rx + rw - 10; x += 5) {
                if (state(rgb(x, y)) !== color) continue;
                let matching = 0;
                for (let dy = -8; dy <= 8; dy += 4) for (let dx = -8; dx <= 8; dx += 4)
                    matching += Number(state(rgb(x + dx, y + dy)) === color);
                if (matching === 25) candidates.push({ x, y, distance: Math.hypot(x - rx - rw / 2, y - ry - rh / 2) });
            }
            candidates.sort((a, b) => a.distance - b.distance);
            let selected = 0;
            for (const candidate of candidates) {
                if (samples.some(s => Math.hypot(s.at[0] - candidate.x, s.at[1] - candidate.y) < 35)) continue;
                samples.push({ name: `Source region ${index + 1} ${color} ${samples.length + 1}`,
                    at: [candidate.x, candidate.y], state: color, originalRgb: rgb(candidate.x, candidate.y) });
                if (++selected === 2) break;
            }
        }
    }
    assert(samples.length >= 5 && samples.some(s => s.state === 'red') && samples.some(s => s.state === 'blue'));
    const proof = { original: recipe.original, originalPngSha256: recipe.originalPngSha256,
        loadingSourceSha256: recipe.source.sha256, samples,
        grid: [[72, 20], [100, 201]].map(at => ({ at, originalRgb: rgb(...at) })), absentLegacyGrid: [],
        qualification: 'Source-only, predeclared uncovered region sampling of political color and grid. Coastline registration is separately bounded by the retained fit, not whole-world pixel identity.' };
    await fs.writeFile(path.join(output, mission + '.json'), JSON.stringify(proof, null, 2) + '\n');
    console.log(JSON.stringify({ mission, samples: samples.length }));
}

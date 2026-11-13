import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { vectorPaths } from '../art/palette-contours.mjs';

const [recipeArg, outputArg] = process.argv.slice(2);
const recipeFile = path.resolve(recipeArg), recipe = JSON.parse(await fs.readFile(recipeFile));
const resolve = name => path.resolve(path.dirname(recipeFile), name);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const originalBytes = await fs.readFile(resolve(recipe.original));
const atlasBytes = await fs.readFile(resolve(recipe.atlas));
assert.equal(sha(originalBytes), recipe.originalPngSha256);
assert.equal(sha(atlasBytes), 'cac525710da77cac0c9be65917bf60c195f4934c1ca22f3701d42f857f0059f8');
assert.equal(sha(atlasBytes), recipe.atlasSha256);
const original = PNG.sync.read(originalBytes), atlas = PNG.sync.read(atlasBytes);
assert.deepEqual([original.width, original.height], [800, 520]);
assert.deepEqual([atlas.width, atlas.height], [1915, 821]);
assert.equal(recipe.schema, 'source-pinned-loading-world-recipe-v1');
assert(/^[a-f0-9]{64}$/.test(recipe.source.sha256));
assert(!(recipe.sourceRegion && recipe.sourceRegions), 'Declare one source-region form');
const sourceRegions = recipe.sourceRegions ?? [recipe.sourceRegion], exclusions = recipe.sourceExclusions ?? [];
const validRect = rect => Array.isArray(rect) && rect.length === 4 && rect.every(Number.isSafeInteger)
    && rect[0] >= 1 && rect[1] >= 1 && rect[2] > 0 && rect[3] > 0
    && rect[0] + rect[2] < 800 && rect[1] + rect[3] < 520;
assert(Array.isArray(sourceRegions) && sourceRegions.length > 0 && sourceRegions.length <= 16
    && sourceRegions.every(validRect), 'Invalid source regions');
assert(Array.isArray(exclusions) && exclusions.length <= 32 && exclusions.every(validRect), 'Invalid source exclusions');
assert(recipe.wrapLongitude === undefined || typeof recipe.wrapLongitude === 'boolean', 'Invalid longitude policy');
const allowed = new Uint8Array(800 * 520);
for (const [rx, ry, rw, rh] of sourceRegions) for (let y = ry; y < ry + rh; y++)
    allowed.fill(1, y * 800 + rx, y * 800 + rx + rw);
for (const [rx, ry, rw, rh] of exclusions) for (let y = ry; y < ry + rh; y++)
    allowed.fill(0, y * 800 + rx, y * 800 + rx + rw);
assert(allowed.some(Boolean), 'Source regions are fully excluded');
const atlasTerritories = recipe.atlasTerritories ?? [];
const propagation = recipe.territoryPropagation;
assert(recipe.politicalInkPolicy === undefined || recipe.politicalInkPolicy === 'source-mask', 'Invalid political ink policy');
if (propagation) assert(propagation.schema === 'visible-source-country-regions-v1'
    && Number.isInteger(propagation.minimumVotes) && propagation.minimumVotes >= 16 && propagation.minimumVotes <= 256
    && propagation.minimumDominance >= .8 && propagation.minimumDominance <= 1
    && propagation.minimumFraction >= .001 && propagation.minimumFraction <= .1,
    'Invalid source country-region propagation');
assert(Array.isArray(atlasTerritories) && atlasTerritories.length <= 8, 'Invalid atlas territories');
for (const territory of atlasTerritories) {
    const rect = territory?.rect, samples = territory?.sourceSamples;
    assert(Array.isArray(rect) && rect.length === 4 && rect.every(Number.isSafeInteger)
        && rect[0] >= 0 && rect[1] >= 0 && rect[2] > 0 && rect[3] > 0
        && rect[0] + rect[2] <= atlas.width && rect[1] + rect[3] <= atlas.height
        && ['red', 'blue'].includes(territory.state) && typeof territory.authority === 'string'
        && territory.authority.length > 20 && Array.isArray(samples) && samples.length >= 3 && samples.length <= 16,
    'Invalid atlas territory declaration');
    for (const point of samples) {
        assert(Array.isArray(point) && point.length === 2 && point.every(Number.isSafeInteger)
            && point[0] >= 0 && point[0] < 800 && point[1] >= 0 && point[1] < 520
            && allowed[point[1] * 800 + point[0]], 'Territory sample is outside declared original visibility');
        const [r, g, b] = original.data.subarray((point[1] * 800 + point[0]) * 4, (point[1] * 800 + point[0]) * 4 + 3);
        assert(territory.state === 'red' ? r > 40 && r > g * 1.5 && r > b * 1.25
            : b > 40 && g < 100 && b > r * 1.25 && b > g * 1.25, 'Original territory authority disagrees');
    }
}
const { scale, sourceLocator, nativeLocator, gridOrigin, gridStep, gridInk } = recipe.registration;
assert(Number.isFinite(scale) && scale >= .4 && scale <= 1);
for (const [point, width, height] of [[sourceLocator, 1915, 821], [nativeLocator, 800, 520], [gridOrigin, 800, 520]]) {
    assert(Array.isArray(point) && point.length === 2 && point.every(Number.isFinite));
    assert(point[0] >= 0 && point[0] <= width && point[1] >= 0 && point[1] <= height);
}
assert(sourceLocator[0] >= 155, 'Calibrate against the unique complete world cycle');
assert(Array.isArray(gridStep) && gridStep.length === 2
    && gridStep.every(step => Number.isFinite(step) && step >= 80 && step <= 320) && /^#[0-9a-f]{6}$/.test(gridInk));
function territoryPaths(kind) {
    const mask = new PNG({ width: 800, height: 520 }), field = new Uint8Array(800 * 520);
    for (let y = 1; y < 519; y++) for (let x = 1; x < 799; x++) {
        if (!allowed[y * 800 + x]) continue;
        const i = (y * 800 + x) * 4, [r, g, b] = original.data.subarray(i, i + 3);
        field[y * 800 + x] = Number(kind === 'red' ? r > 40 && r > g * 1.5 && r > b * 1.25
            : b > 40 && g < 100 && b > r * 1.25 && b > g * 1.25);
    }
    // Close small relief/old-grid holes without tracing material noise or cyan UI lines.
    const dilated = new Uint8Array(field.length);
    for (let y = 1; y < 519; y++) for (let x = 1; x < 799; x++) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            dilated[y * 800 + x] ||= field[(y + dy) * 800 + x + dx];
        }
    }
    for (let y = 1; y < 519; y++) for (let x = 1; x < 799; x++) {
        if (!allowed[y * 800 + x]) continue;
        let inside = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) inside &&= !!dilated[(y + dy) * 800 + x + dx];
        if (inside) mask.data.set([255, 255, 255, 255], (y * 800 + x) * 4);
    }
    return vectorPaths(mask, undefined, { tolerance: .65, cornerRadius: .45, minimumArea: 9 }).map(item => item.d);
}
const redPaths = territoryPaths('red'), bluePaths = territoryPaths('blue');
const monochrome = recipe.monochrome;
if (monochrome) {
    assert(monochrome.schema === 'source-world-faction-monochrome-v1'
        && /^ls800[sa]0[1-7]\.shp$/.test(recipe.source.member)
        && ['allied', 'soviet'].includes(monochrome.faction)
        && Array.isArray(monochrome.coefficients) && monochrome.coefficients.length === 3
        && monochrome.coefficients.every(value => Number.isFinite(value) && value > 0 && value <= 2)
        && monochrome.boundaryGain >= 1 && monochrome.boundaryGain <= 3
        && Array.isArray(monochrome.sourceSamples) && monochrome.sourceSamples.length >= 3);
    for (const sample of monochrome.sourceSamples) {
        const [x, y] = sample.at;
        assert(Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < 800 && y >= 0 && y < 520
            && allowed[y * 800 + x], 'World tint sample is outside original visibility');
        const rgb = [...original.data.subarray((y * 800 + x) * 4, (y * 800 + x) * 4 + 3)];
        assert.deepEqual(rgb, sample.rgb, 'World tint sample identity mismatch');
        const [r, g, b] = rgb;
        assert(monochrome.faction === 'soviet' ? r > g * 1.2 && r > b * 1.3 : b > r * 1.2 && b > g * 1.1,
            'World tint sample disagrees with original faction palette');
    }
}
assert(redPaths.length + bluePaths.length > 0
    && [...redPaths, ...bluePaths].every(d => d.length < 300000 && /^[MLQZ0-9 .,-]+$/.test(d)));
const output = path.resolve(outputArg); await fs.mkdir(output, { recursive: false });
const maskFile = path.join(output, 'political-mask.json');
await fs.writeFile(maskFile, JSON.stringify({ redPaths, bluePaths, scale, sourceLocator, nativeLocator,
    ...(monochrome ? { monochrome } : {}),
    ...(recipe.politicalInkPolicy ? { politicalInkPolicy: recipe.politicalInkPolicy } : {}),
    ...(propagation ? { territoryPropagation: propagation } : {}),
    ...(recipe.wrapLongitude ? { wrapLongitude: true } : {}),
    ...(atlasTerritories.length ? { atlasTerritories } : {}) }) + '\n', { flag: 'wx' });
const name = recipe.assetName;
assert(/^interface-world-[a-z0-9-]+\.png$/.test(name));
const baked = JSON.parse(execFileSync('python3', [path.join(import.meta.dirname, 'bake-loading-world.py'),
    resolve(recipe.atlas), maskFile, path.join(output, name)], { encoding: 'utf8', maxBuffer: 1024 * 1024 }));
const worldBytes = await fs.readFile(path.join(output, name));
const receipt = { schema: 'source-pinned-campaign-world-preparation-v1', source: recipe.source,
    originalPngSha256: recipe.originalPngSha256, atlasSha256: recipe.atlasSha256,
    recipeSha256: sha(await fs.readFile(recipeFile)), politicalMask: { redPaths: redPaths.length, bluePaths: bluePaths.length,
        sha256: sha(await fs.readFile(maskFile)), sourceRegion: recipe.sourceRegion,
        ...(recipe.sourceRegions ? { sourceRegions, sourceExclusions: exclusions } : {}),
        ...(recipe.wrapLongitude ? { wrapLongitude: true, uniqueLongitudeCycle: [155, 1915] } : {}),
        ...(propagation ? { territoryPropagation: propagation } : {}),
        ...(atlasTerritories.length ? { atlasTerritories } : {}),
        ...(recipe.politicalInkPolicy ? { politicalInkPolicy: recipe.politicalInkPolicy } : {}),
        method: 'Original red/blue territory; small-hole closure and continuous source contours. Correct only opposite-color atlas pixels; retain green boundaries and matching material exactly.' },
    asset: { file: name, bytes: worldBytes.length, sha256: sha(worldBytes), width: 1915, height: 821 },
    binding: { schema: 'campaign-world-backdrop-v1', file: name, width: 1915, height: 821,
        scale, sourceLocator, nativeLocator, gridOrigin, gridStep, gridInk }, baked,
    qualification: 'Reuse of the unchanged accepted relief atlas with source-pinned registration and political palette. Only old straight grid strips and the source political mask are derived; this is not a new HD raster redraw or exact whole-world source-pixel identity. The source-native grid is drawn separately. Complete-page native/user review remains required.' };
if (monochrome) {
    receipt.monochrome = monochrome;
    receipt.politicalMask.method = 'Original visible-world samples authorize the global monochrome faction palette. Original-pixel political masks do not supply material.';
    receipt.qualification = 'Accepted relief geometry and material with a global faction tint derived from pinned original visible-world samples. No low-resolution original pixels supply material or a political texture mask. Source-registered viewport and reconstructed grid are separate. Complete-page native/user review remains required.';
}
await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, asset: receipt.asset, politicalPaths: redPaths.length + bluePaths.length, ...baked }));

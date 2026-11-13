import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]);
const history = path.resolve(root, '../project-history/ra2-campaign-completion-20261026');
const publish = process.argv.includes('--publish'), sha = bytes => createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(out, { recursive: false });
const atlas = path.join(root, 'public/res/presentation/campaign-backdrop-world-r2a.png');
const atlasSha256 = sha(await fs.readFile(atlas)), rows = [];
for (const mission of ['all01t', 'all02s', 'all03u', 'all04u']) {
    const directory = path.join(root, '.local/campaign/ra2', mission), work = path.join(out, mission);
    await fs.mkdir(work);
    const manifestBytes = await fs.readFile(path.join(directory, 'manifest.json'));
    const interfaceBytes = await fs.readFile(path.join(directory, 'interface-hd.json'));
    const formalReceiptFile = path.join(root, 'docs/campaign-art', mission + '-loading.json');
    const formalBytes = await fs.readFile(formalReceiptFile), formal = JSON.parse(formalBytes);
    const spec = JSON.parse(interfaceBytes), manifest = JSON.parse(manifestBytes);
    assert(!spec.loading.world && spec.loading.foreground === true);
    const original = path.join(history, 'Art/OriginalLoading', mission + '-original.png');
    const originalPngSha256 = sha(await fs.readFile(original));
    assert.equal(originalPngSha256, formal.originalPngSha256);
    await fs.writeFile(path.join(work, 'previous-interface-hd.json'), interfaceBytes);
    await fs.writeFile(path.join(work, 'previous-manifest.json'), manifestBytes);
    await fs.writeFile(path.join(work, 'previous-formal-receipt.json'), formalBytes);
    const sourceRegions = [[8, 12, 332, 280], [238, 181, 100, 185], [646, 12, 144, 150], [732, 181, 58, 80]];
    const probe = { schema: 'source-pinned-loading-world-recipe-v1', source: formal.source,
        original, originalPngSha256, atlas, atlasSha256, sourceRegions,
        assetName: `interface-world-v53-${mission}-r1.png`, registrationProbe: {
            sourceRegions, bounds: [[.5, .85], [-230, 60], [-90, 70]], nativeLocator: [264, 160] } };
    const probeFile = path.join(work, 'fit-input.json');
    await fs.writeFile(probeFile, JSON.stringify(probe, null, 2) + '\n');
    execFileSync('python3', [path.join(import.meta.dirname, 'fit-loading-world.py'), probeFile, path.join(work, 'fit')], { stdio: 'pipe' });
    const fitted = JSON.parse(await fs.readFile(path.join(work, 'fit/uniform-fit.json')));
    assert(fitted.landDice > .72, `${mission}: insufficient source coastline fit: ${fitted.landDice}`);
    const recipe = { ...probe, registration: { scale: fitted.uniformScale, sourceLocator: fitted.masterLocator,
        nativeLocator: [264, 160], gridOrigin: [72, 201.5], gridStep: [162.75, 133], gridInk: '#10006c' },
        calibrationQualification: 'Bounded original-source coastline fit; exact whole-world raster identity is not claimed.',
        paletteQualification: 'Original visible red/blue political masks; preserve accepted relief and unrevealed regions.' };
    delete recipe.registrationProbe;
    const recipeFile = path.join(work, 'world-recipe.json');
    await fs.writeFile(recipeFile, JSON.stringify(recipe, null, 2) + '\n');
    execFileSync(process.execPath, [path.join(import.meta.dirname, 'prepare-loading-world.mjs'), recipeFile,
        path.join(work, 'world')], { stdio: 'pipe' });
    const receipt = JSON.parse(await fs.readFile(path.join(work, 'world/receipt.json')));
    spec.revision += '-world-v53-r1'; spec.loading.world = receipt.binding;
    const updatedInterface = Buffer.from(JSON.stringify(spec) + '\n');
    const file = { name: receipt.asset.file, bytes: receipt.asset.bytes, sha256: receipt.asset.sha256,
        route: `/local-campaign/ra2/${mission}/${receipt.asset.file}` };
    const before = new Map(manifest.files.map(file => [file.name, file.sha256]));
    const entry = manifest.files.find(file => file.name === 'interface-hd.json');
    assert.equal(entry.sha256, sha(interfaceBytes)); entry.sha256 = sha(updatedInterface); entry.bytes = updatedInterface.length;
    manifest.files.push(file);
    const unchanged = manifest.files.filter(file => file.name !== 'interface-hd.json' && before.has(file.name));
    assert(unchanged.every(file => before.get(file.name) === file.sha256));
    const row = { mission, previousInterfaceSha256: sha(interfaceBytes), interfaceSha256: sha(updatedInterface),
        world: file, binding: receipt.binding, fit: fitted.landDice, unchangedPayloads: unchanged.length,
        foregroundPayloadsExact: true, status: publish ? 'PUBLISHED_NATIVE_AND_USER_REVIEW_PENDING' : 'PREPARED_NOT_PUBLISHED' };
    await fs.writeFile(path.join(work, 'interface-hd.json'), updatedInterface);
    await fs.writeFile(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    if (publish) {
        assert.equal(sha(await fs.readFile(path.join(directory, 'interface-hd.json'))), row.previousInterfaceSha256);
        await fs.copyFile(path.join(work, 'world', file.name), path.join(directory, file.name), 1);
        await fs.writeFile(path.join(directory, 'interface-hd.json'), updatedInterface);
        await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
        formal.priorForegroundAcceptance = formal.acceptance;
        formal.acceptance = 'SOURCE_WORLD_REPAIR_NATIVE_AND_USER_REVIEW_PENDING';
        formal.revision = spec.revision;
        const selector = formal.files.find(file => file.name === 'interface-hd.json');
        selector.sha256 = entry.sha256; selector.bytes = entry.bytes;
        formal.files.push(file); formal.worldRepairV53 = row;
        await fs.writeFile(formalReceiptFile, JSON.stringify(formal, null, 2) + '\n');
    }
    rows.push(row);
    console.log(JSON.stringify({ mission, fit: row.fit, status: row.status, binding: row.binding }));
}
await fs.writeFile(path.join(out, 'repair.json'), JSON.stringify({ schema: 'source-loading-world-repair-v53', rows,
    policy: 'Only per-mission background registration/political palette and their selectors change. Accepted foreground SVGs, photographs, emblems, original sources, loading bars and budgets remain exact.' }, null, 2) + '\n');

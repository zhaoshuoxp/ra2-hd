import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const output = path.resolve(process.argv[2]);
const history = path.resolve('../project-history/ra2-campaign-completion-20261026');
const sha = data => createHash('sha256').update(data).digest('hex');
if (process.argv.includes('--publish-prepared')) {
    const receipt = JSON.parse(await fs.readFile(path.join(output, 'repair.json')));
    for (const row of receipt.rows) {
        assert.equal(sha(await fs.readFile(path.join(row.directory, 'interface-hd.json'))), row.previousInterfaceSha256);
        assert.equal(sha(await fs.readFile(path.join(row.directory, 'manifest.json'))), row.previousManifestSha256);
        assert.equal(sha(await fs.readFile(path.join(row.work, 'world', row.asset.name))), row.asset.sha256);
    }
    for (const row of receipt.rows) {
        await fs.copyFile(path.join(row.work, 'world', row.asset.name), path.join(row.directory, row.asset.name), fs.constants.COPYFILE_EXCL);
        for (const file of ['interface-hd.json', 'manifest.json']) await fs.copyFile(path.join(row.work, file), path.join(row.directory, file));
        const file = path.resolve('docs/campaign-art', row.mission + '-loading.json');
        const formal = JSON.parse(await fs.readFile(file)); formal.revision = row.revision;
        formal.worldRepairV53 = row; formal.acceptance = 'SOURCE_WORLD_REPAIR_NATIVE_AND_USER_REVIEW_PENDING';
        const entry = formal.files.find(f => f.name === 'interface-hd.json');
        entry.sha256 = row.interfaceSha256; entry.bytes = (await fs.stat(path.join(row.directory, entry.name))).size;
        formal.files.push(row.asset); row.status = 'PUBLISHED_NATIVE_AND_USER_REVIEW_PENDING';
        await fs.writeFile(file, JSON.stringify(formal, null, 2) + '\n');
    }
    await fs.writeFile(path.join(output, 'repair.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({ output, status: 'PUBLISHED', missions: receipt.rows.length }));
    process.exit(0);
}
await fs.mkdir(output, { recursive: false });
const rows = [];
for (const mission of ['all01t', 'all02s', 'all03u', 'all04u']) {
    const work = path.join(output, mission); await fs.mkdir(work);
    const recipe = JSON.parse(await fs.readFile(path.join(history, 'Art/V53/LoadingWorlds', mission, 'world-recipe.json')));
    recipe.assetName = `interface-world-v53-${mission}-r3.png`;
    recipe.politicalInkPolicy = 'source-mask';
    Object.assign(recipe.registration, { gridOrigin: [72, 201.5], gridStep: [162.75, 133], gridInk: '#10006c' });
    const recipeFile = path.join(work, 'world-recipe.json');
    await fs.writeFile(recipeFile, JSON.stringify(recipe, null, 2) + '\n');
    execFileSync(process.execPath, [path.join(import.meta.dirname, 'prepare-loading-world.mjs'), recipeFile, path.join(work, 'world')]);
    const receipt = JSON.parse(await fs.readFile(path.join(work, 'world/receipt.json')));
    const directory = path.resolve('.local/campaign/ra2', mission);
    const interfaceBytes = await fs.readFile(path.join(directory, 'interface-hd.json'));
    const manifestBytes = await fs.readFile(path.join(directory, 'manifest.json'));
    const spec = JSON.parse(interfaceBytes), manifest = JSON.parse(manifestBytes);
    await fs.writeFile(path.join(work, 'previous-interface-hd.json'), interfaceBytes);
    await fs.writeFile(path.join(work, 'previous-manifest.json'), manifestBytes);
    spec.revision = spec.revision.replace(/-world-v53-r\d+$/, '-world-v53-r3'); spec.loading.world = receipt.binding;
    const bytes = Buffer.from(JSON.stringify(spec) + '\n');
    const entry = manifest.files.find(file => file.name === 'interface-hd.json');
    assert.equal(entry.sha256, sha(interfaceBytes)); entry.sha256 = sha(bytes); entry.bytes = bytes.length;
    const asset = { name: receipt.asset.file, bytes: receipt.asset.bytes, sha256: receipt.asset.sha256,
        route: `/local-campaign/ra2/${mission}/${receipt.asset.file}` };
    manifest.files.push(asset);
    await fs.writeFile(path.join(work, 'interface-hd.json'), bytes);
    await fs.writeFile(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    rows.push({ mission, directory, work, previousInterfaceSha256: sha(interfaceBytes), previousManifestSha256: sha(manifestBytes),
        interfaceSha256: sha(bytes), revision: spec.revision, asset, binding: receipt.binding,
        recipeSha256: receipt.recipeSha256, unchangedForegroundPayloads: true, status: 'STAGED_NATIVE_REVIEW_PENDING' });
}
await fs.writeFile(path.join(output, 'repair.json'), JSON.stringify({ rows,
    scope: 'Source-state ink includes mixed dark red/blue antialias pixels. Accepted relief, green borders and foreground artwork remain preserved. Grid uses the earlier source cut, not later-mission coordinates.' }, null, 2) + '\n');
console.log(JSON.stringify({ output, missions: rows.length, status: 'STAGED' }));

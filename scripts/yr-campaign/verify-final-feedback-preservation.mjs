import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const [beforeDir, restoredDir, afterDir, output] = process.argv.slice(2).map(p => path.resolve(p));
const read = async file => JSON.parse(await fs.readFile(file));
const prefix = 'Contents/Resources/GameResources/';
const resources = dir => path.join(dir, 'Red Alert 2 HD.app/Contents/Resources/GameResources');
const inventory = async dir => new Map((await read(path.join(dir, 'app-inventory.json')))
    .filter(row => row.file.startsWith(prefix)).map(row => [row.file.slice(prefix.length), row]));
const [old, restored, current] = await Promise.all([inventory(beforeDir), inventory(restoredDir), inventory(afterDir)]);
const allowed = new Set(['terrain-lunar-selection.json', 'campaign/yr/sov07tmd/manifest.json']);
const changed = [...old].filter(([file, row]) => current.has(file) && current.get(file).sha256 !== row.sha256)
    .map(([file]) => file);
assert.deepEqual(changed.sort(), [...allowed].sort(), 'Only Lunar selection and the additive castle campaign manifest may change');
const counts = {};
for (const [label, accept] of [
    ['originalMaps', file => /^campaign\/(ra2|yr)\/.+\.map$/.test(file)],
    ['priorCampaignPayloads', file => file.startsWith('campaign/') && !file.endsWith('/manifest.json')],
    ['oldSnow', file => file.startsWith('environment-packs/snow-') || file.startsWith('terrain-packs/yr-snow-')
        || file === 'environment-snow-selection.json' || file === 'terrain-snow-selection.json'],
    ['acceptedActorPaint', file => /^(hd-packs|construction-packs)\//.test(file) && /\.(png|rgba)$/.test(file)],
    ['movies', file => file.startsWith('media/movie-library-v51/')],
]) {
    const rows = [...old].filter(([file]) => accept(file));
    assert(rows.length > 0, label);
    for (const [file, row] of rows) assert.equal(current.get(file)?.sha256, row.sha256, file);
    counts[label] = rows.length;
}
assert.equal(counts.originalMaps, 40);
assert.equal(counts.movies, 61);
const lunar = await read(path.join(resources(afterDir), 'terrain-lunar-selection.json'));
assert.deepEqual(lunar, await read(path.join(resources(restoredDir), 'terrain-lunar-selection.json')));
assert.equal(lunar.revision, 'yr-lunar-complete-terrain-r2');
const lunarFiles = [...restored].filter(([file]) => file.startsWith('terrain-packs/'+lunar.revision+'/'));
assert(lunarFiles.length > 0);
for (const [file, row] of lunarFiles) assert.equal(current.get(file)?.sha256, row.sha256, file);
const bridge = await read(path.join(resources(beforeDir), 'terrain-newurban-selection.json'));
assert.deepEqual(await read(path.join(resources(afterDir), 'terrain-newurban-selection.json')), bridge);
const bridgeFiles = [...old].filter(([file]) => file.startsWith('terrain-packs/'+bridge.revision+'/'));
for (const [file, row] of bridgeFiles) assert.equal(current.get(file)?.sha256, row.sha256, file);
const priorCampaign = await read(path.join(resources(beforeDir), 'campaign/yr/sov07tmd/manifest.json'));
const nextCampaign = await read(path.join(resources(afterDir), 'campaign/yr/sov07tmd/manifest.json'));
for (const row of priorCampaign.files) assert.deepEqual(nextCampaign.files.find(f => f.name === row.name), row);
assert.equal(nextCampaign.files.length-priorCampaign.files.length, 23);
const newPayloads = nextCampaign.files.filter(row => !priorCampaign.files.some(old => old.name === row.name));
assert(newPayloads.every(row => row.name.includes('yr-feedback-castle-collapse-r11')));
const beforeContract = await read(path.join(beforeDir, 'Red Alert 2 HD.app/Contents/Resources/app/desktop/environment-hd-contract.json'));
const nextContract = await read(path.join(afterDir, 'Red Alert 2 HD.app/Contents/Resources/app/desktop/environment-hd-contract.json'));
const oldCastle = beforeContract.identities.yr.CATRAN03;
assert.equal(nextContract.identities.yr.CATRAN03, oldCastle);
assert.deepEqual(nextContract.families[oldCastle], beforeContract.families[oldCastle]);
assert.equal(nextContract.identities.yr.CATR03DM, 'yr-feedback-castle-collapse-r11');
const report = { status: 'PASS_ACCEPTED_RESOURCES_EXACT_LUNAR_PRIOR_MATERIAL_EXACT_AND_CASTLE_ADDITIVE_ONLY',
    beforePackage: beforeDir, restoredMaterialPackage: restoredDir, afterPackage: afterDir, counts,
    existingResourceMetadataChanges: changed, lunarSelection: lunar, restoredLunarPayloadsExact: lunarFiles.length,
    acceptedBridgePayloadsExact: bridgeFiles.length, priorCastleBodyFamilyExact: oldCastle,
    additiveCastleFiles: newPayloads.length, realProfilesIncluded: false, userVisualAcceptance: 'PENDING_CURRENT_FOUR_ITEMS' };
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify(report));

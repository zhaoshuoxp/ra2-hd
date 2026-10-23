// Run only the changed actor paths in the reusable isolated Mac package.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = '.artifacts/m2-4/urban-actors-native-batch62-v1';
const stage = `${root}/active-stage.json`;
const read = file => JSON.parse(fs.readFileSync(file));
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const selected = read('desktop/environment-urban-hd-contract.json').selectedPack;
assert.equal(selected.sha256, 'd9c2da03f5583d16d8d3eb06ae6b8a2a4eaec1d013bf89cb47e4c70ac39994e8');
const cases = [];
for (const density of [2, 4]) for (const group of [
    { id: 'ra2', edition: 'ra2', map: 'mp34u4.map', names: ['CIVBBP'], families: ['urban-civbbp'] },
    { id: 'yr', edition: 'yr', map: 'xpotomac.map', names: ['CIVBBP', 'PRES', 'SSRV'],
        families: ['urban-civbbp', 'urban-pres', 'urban-ssrv'] },
]) {
    const stem = `native-inf-${group.id}-${density}x-v${group.id === 'ra2' && density === 2 ? 2 : 1}`;
    const flags = [`--edition=${group.edition}`, '--theater=URBAN', `--map=${group.map}`, '--bot-slot=1',
        `--density=${density}`, `--families=${group.families}`, '--capture-objects-only',
        `--capture-object-names=${group.names}`, '--states', `--state-names=${group.names}`,
        '--record-each-actor', '--render-resolution=1080p'];
    if (density === 4) flags.push(`--capture-reference=${root}/native-inf-${group.id}-2x-v${group.id === 'ra2' ? 2 : 1}/report.json`, '--release');
    cases.push({ stem, edition: group.edition, map: group.map, script: 'scripts/m2/official-maps/native-coverage.mjs',
        args: [stage, `${root}/${stem}`, ...flags], density, kind: 'infantry' });
}
for (const density of [2, 4]) for (const group of [
    { id: 'vehicles', map: 'hillbtwn.map', names: ['JEEP', 'YCAB', 'BCAB', 'AMBU', 'FTRK'] },
    { id: 'plane', map: 'xoceansid.map', names: ['CIVP'] },
]) {
    const stem = `native-${group.id}-${density}x-v${group.id === 'vehicles' && density === 2 ? 2 : 1}`;
    const flags = ['--edition=yr', '--theater=URBAN', `--map=${group.map}`, '--bot-slot=1',
        `--density=${density}`, '--voxel-only', `--voxel-actions=${group.names}`, '--render-resolution=1080p'];
    if (density === 4) flags.push('--release', '--next-map=xdisaster.map');
    cases.push({ stem, edition: 'yr', map: group.map, script: 'scripts/m2/official-maps/native-coverage.mjs',
        args: [stage, `${root}/${stem}`, ...flags], density, kind: 'vehicles' });
}
for (const group of ['ra2', 'yr']) {
    const stem = `native-inf-${group}-original-v1`;
    cases.push({ stem, edition: group, map: group === 'ra2' ? 'mp34u4.map' : 'xpotomac.map',
        script: 'scripts/m2-4/native-original-review.mjs', kind: 'original-infantry', density: 1,
        args: [stage, `${root}/native-inf-${group}-2x-v${group === 'ra2' ? 2 : 1}/report.json`,
            `${root}/${stem}`, '--match-actor-states'] });
}
for (const group of ['vehicles', 'plane']) {
    const stem = `native-${group}-original-v1`;
    cases.push({ stem, edition: 'yr', map: group === 'vehicles' ? 'hillbtwn.map' : 'xoceansid.map',
        script: 'scripts/m2-4/native-original-review.mjs', kind: 'original-vehicles', density: 1,
        args: [stage, `${root}/native-${group}-2x-v${group === 'vehicles' ? 2 : 1}/report.json`, `${root}/${stem}`,
            '--match-neutral-vehicle-bearings'] });
}
const completed = [];
for (const spec of cases) {
    const file = `${root}/${spec.stem}/report.json`;
    const reused = fs.existsSync(file);
    if (!reused) {
        assert(!fs.existsSync(`${root}/${spec.stem}`), 'Preserve incomplete attempts; choose a new version');
        const log = fs.openSync(`${root}/${spec.stem}.log`, 'wx');
        let result;
        try { result = spawnSync(process.execPath, [spec.script, ...spec.args], { stdio: ['ignore', log, log] }); }
        finally { fs.closeSync(log); }
        assert.equal(result.status, 0, `Inspect ${root}/${spec.stem}.log`);
    }
    const report = read(file);
    assert.equal(report.status, 'PASS_SELECTED_NATIVE_CASES');
    assert.equal(report.edition, spec.edition);
    assert.equal(report.selectedMap, spec.map);
    assert.equal(report.errors.length, 0);
    completed.push({ ...spec, report: file, sha256: sha(file) });
    console.log(JSON.stringify({ case: spec.stem, status: 'PASS', reusedSuccessfulCase: reused }));
}
fs.writeFileSync(`${root}/native-run-v1.json`, JSON.stringify({ status: 'PASS_CHANGED_ACTOR_PATHS',
    stageSha256: sha(stage), selectedEnvironment: selected, cases: completed,
    deduplication: 'Four unchanged official maps cover both CIVBBP edition paths and every new source actor. Other placements share exact source hashes, palettes and loading paths. Original controls are captured once per path; no full-match or Windows claim.' }, null, 2) + '\n', { flag: 'wx' });

// Run source-pinned civilian state cases sequentially in the reusable Mac host.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const [planFile, stageFile] = process.argv.slice(2);
assert(planFile && stageFile);
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const only = process.argv.find(value => value.startsWith('--only='))?.slice(7).split(',');
const hdOnly = process.argv.includes('--hd-only');
for (const entry of plan.cases) {
    if (only && !only.includes(entry.id)) continue;
    for (const density of [2, 4]) {
        const output = `${entry.output}-${density}x-v1`;
        assert(!fs.existsSync(output), `Immutable native output already exists: ${output}`);
        const flags = [`--edition=${entry.edition}`, '--theater=URBAN', `--map=${entry.runtimeName}`,
            '--bot-slot=1', `--density=${density}`, `--families=${entry.families.join(',')}`,
            '--capture-objects-only', `--capture-object-names=${entry.captureName}`, '--states',
            `--state-names=${entry.identities.join(',')}`, '--render-resolution=1080p'];
        if (density === 4) flags.push(`--capture-reference=${entry.output}-2x-v1/report.json`);
        if (density === 4 && entry.checkRelease) flags.push('--release');
        if (entry.technologyNames?.length)
            flags.push('--technology-actions', `--technology-names=${entry.technologyNames.join(',')}`);
        if (entry.linkedMembers?.length)
            flags.push(`--linked-building-members=${entry.linkedMembers.join(',')}`);
        if (entry.cycleMembers?.length)
            flags.push(`--linked-building-cycles=${entry.cycleMembers.join(',')}`,
                `--linked-building-cycle-source=${entry.cycleSource}`);
        const log = fs.openSync(`${output}.log`, 'wx');
        let result;
        try {
            result = spawnSync(process.execPath, ['scripts/m2/official-maps/native-coverage.mjs',
                stageFile, output, ...flags], { stdio: ['ignore', log, log] });
        } finally { fs.closeSync(log); }
        assert.equal(result.status, 0, `Native case failed; inspect ${output}.log`);
        const report = JSON.parse(fs.readFileSync(path.join(output, 'report.json'), 'utf8'));
        assert.equal(report.status, 'PASS_SELECTED_NATIVE_CASES');
        assert.deepEqual(report.newNativeStates.buildings.map(row => row.normal.name).sort(),
            [...entry.identities].sort());
        console.log(JSON.stringify({ case: entry.id, density, families: entry.families.length,
            status: report.status, worldBytes: report.combinedWorldAllocation.total }));
    }
    if (hdOnly) {
        assert(entry.reusedOriginalReport, 'HD-only correction requires pinned Original evidence');
        const reference = JSON.parse(fs.readFileSync(entry.reusedOriginalReport, 'utf8'));
        const hd = JSON.parse(fs.readFileSync(`${entry.output}-2x-v1/report.json`, 'utf8'));
        assert.equal(reference.status, 'PASS_SELECTED_NATIVE_CASES');
        assert.equal(reference.edition, entry.edition);
        assert.equal(reference.selectedMap, entry.runtimeName);
        assert.equal(reference.linkedBuildingCycleSource.sha256, hd.linkedBuildingCycleSource.sha256);
        for (const cycle of hd.linkedBuildingCycles) {
            assert(reference.linkedBuildingCycles.some(original => original.member === cycle.member
                && original.state === cycle.state && original.fixture === cycle.fixture
                && original.status === cycle.status
                && JSON.stringify(original.expectedPhases) === JSON.stringify(cycle.expectedPhases)),
            `Missing unchanged Original cycle: ${cycle.member}/${cycle.state}`);
        }
        console.log(JSON.stringify({ case: entry.id, comparison: 'REUSED_UNCHANGED_ORIGINAL',
            report: entry.reusedOriginalReport, matchedSceneParityClaimed: false }));
        continue;
    }
    const output = entry.originalOutput ?? `${entry.output}-original-v1`;
    assert(!fs.existsSync(output));
    const log = fs.openSync(`${output}.log`, 'wx');
    let result;
    try {
        result = spawnSync(process.execPath, ['scripts/m2-4/native-original-review.mjs', stageFile,
            `${entry.output}-2x-v1/report.json`, output,
            ...(entry.cycleMembers?.length ? ['--match-linked-building-cycles'] : [])],
        { stdio: ['ignore', log, log] });
    } finally { fs.closeSync(log); }
    assert.equal(result.status, 0, `Original comparison failed; inspect ${output}.log`);
    console.log(JSON.stringify({ case: entry.id, comparison: 'Original', status: 'PASS' }));
}

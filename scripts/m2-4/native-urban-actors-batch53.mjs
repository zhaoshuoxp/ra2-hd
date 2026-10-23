// Sequential actor and gate checks in the frozen internal Mac host.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const root = '.artifacts/m2-4/urban-accepted-actors-batch53-v1';
const stage = `${root}/active-stage.json`;
function run(script, output, flags) {
    assert(!fs.existsSync(output), `Preserve immutable output: ${output}`);
    const log = fs.openSync(`${output}.log`, 'wx');
    let result;
    try {
        result = spawnSync(process.execPath, [script, stage, output, ...flags],
            { stdio: ['ignore', log, log] });
    } finally { fs.closeSync(log); }
    assert.equal(result.status, 0, `Inspect ${output}.log`);
    console.log(JSON.stringify({ output, status: 'PASS' }));
}
for (const density of [2, 4]) {
    const flags = ['--edition=yr', '--theater=URBAN', '--map=xhailmary.map', '--bot-slot=1',
        `--density=${density}`, '--families=urban-civsfm', '--capture-objects-only',
        '--capture-object-names=CIVSFM', '--states', '--state-names=CIVSFM', '--render-resolution=1080p'];
    if (density === 4) flags.push(`--capture-reference=${root}/native-civsfm-2x-v1/report.json`, '--release');
    run('scripts/m2/official-maps/native-coverage.mjs', `${root}/native-civsfm-${density}x-v1`, flags);
}
const originalOutput = `${root}/native-civsfm-original-v1`;
assert(!fs.existsSync(originalOutput));
const originalLog = fs.openSync(`${originalOutput}.log`, 'wx');
let original;
try {
    original = spawnSync(process.execPath, ['scripts/m2-4/native-original-review.mjs', stage,
        `${root}/native-civsfm-2x-v1/report.json`, originalOutput], { stdio: ['ignore', originalLog, originalLog] });
} finally { fs.closeSync(originalLog); }
assert.equal(original.status, 0, `Inspect ${originalOutput}.log`);
console.log(JSON.stringify({ output: originalOutput, status: 'PASS' }));
for (const density of [2, 4])
    run('scripts/m2-4/native-snow-gate.mjs', `${root}/native-gate-actions-${density}x-v${density === 2 ? 3 : 1}`,
        [`--density=${density}`, '--map=xbarrel.map', '--source=gugate_a.shp', '--placements=4', '--clear-passage']);

// Run only reopened R4 facts sequentially in the complete copied native app.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const [receipt, root] = process.argv.slice(2);
assert(receipt && root, 'Usage: run-feedback-native.mjs <package-receipt.json> <new-output>');
const plan = JSON.parse(await fs.readFile('.artifacts/m2-3/feedback-r4-v1/native-feedback-plan-v1.json'));
await fs.mkdir(root, { recursive: false });
const completed = [];
const reuseRoot = process.argv.find(arg => arg.startsWith('--reuse='))?.slice(8);
const reusable = reuseRoot ? JSON.parse(await fs.readFile(path.join(reuseRoot, 'completed.json'))) : [];
const artifact = JSON.parse(await fs.readFile(receipt));
const run = async (script, folder, options) => {
    const output = path.join(root, folder);
    const existing = reusable.find(row => row.script === script && JSON.stringify(row.options) === JSON.stringify(options));
    if (existing) {
        const report = JSON.parse(await fs.readFile(path.join(existing.output, 'report.json')));
        assert.equal(report.status, 'PASS_SELECTED_NATIVE_CASES');
        assert.equal(report.app, artifact.app);
        completed.push({ ...existing, reused: true });
        await fs.writeFile(path.join(root, 'completed.json'), JSON.stringify(completed, null, 2) + '\n');
        console.log(`REUSE ${folder}`);
        return;
    }
    console.log(`START ${folder}`);
    await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [`scripts/m2/official-maps/${script}.mjs`, receipt, output, ...options,
            '--4k', '--bot-slot=1'],
            { stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(Error(`${folder} exited ${code}`)));
    });
    completed.push({ script, output, options });
    await fs.writeFile(path.join(root, 'completed.json'), JSON.stringify(completed, null, 2) + '\n');
};
for (const density of [2, 4]) {
    for (const snow of [false, true]) await run('native-building-owners', `YAGNTC-${snow ? 'snow' : 'temperate'}-${density}x`,
        [`--density=${density}`, '--phase=feedback-r4', '--names=YAGNTC', ...(snow ? ['--snow'] : [])]);
    for (const sample of plan.cases) await run('native-coverage', `${sample.edition}-${sample.map}-${density}x`,
        [`--density=${density}`, `--edition=${sample.edition}`, `--map=${sample.map}`, '--states',
            `--families=${sample.families.join(',')}`, ...(sample.map === 'mp05t4.map' ? ['--release'] : [])]);
    await run('native-coverage', `wood-bridge-${density}x`, [`--density=${density}`, '--edition=yr',
        '--map=xhills.map', '--bridge-actions', '--families=environment-bridgb']);
    await run('native-fallback', `outpost-fallback-${density}x`, [`--density=${density}`, '--map=mp05t4.map']);
}
await fs.writeFile(path.join(root, 'status.json'), JSON.stringify({
    status: 'PASS_COPIED_R4_NATIVE_REOPENED_CASES', completed: completed.length,
    notPreviouslyNativePlaced: plan.notPreviouslyNativePlaced, userAcceptance: false,
    windows: 'NOT_RUN', physicalInput: 'NOT_RUN',
}, null, 2) + '\n');

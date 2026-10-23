// Exercise the changed map-building cover in the exact complete copied Mac app.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const [receipt, planFile, root] = process.argv.slice(2);
assert(receipt && planFile && root, 'Usage: run-edge-feedback-native.mjs <receipt> <plan> <new-output>');
const plan = JSON.parse(await fs.readFile(planFile));
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
    } else {
        console.log(`START ${folder}`);
        await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [`scripts/m2/official-maps/${script}.mjs`, receipt, output,
                ...options, '--4k', '--bot-slot=1'], { stdio: 'inherit' });
            child.on('error', reject);
            child.on('exit', code => code === 0 ? resolve() : reject(Error(`${folder} exited ${code}`)));
        });
        completed.push({ script, output, options });
    }
    await fs.writeFile(path.join(root, 'completed.json'), JSON.stringify(completed, null, 2) + '\n');
};
for (const density of [2, 4]) {
    await run('native-building-owners', `owners-tech-${density}x`, [`--density=${density}`, '--phase=feedback-r5',
        '--names=CAAIRP,CAOILD']);
    await run('native-building-owners', `owners-occupied-${density}x`, [`--density=${density}`, '--phase=feedback-r5',
        '--names=CATEXS08,CANEWY20', '--occupiable-states', '--edition=ra2', '--map=mp03t4.map']);
    for (const sample of plan.cases) await run('native-coverage', `${sample.edition}-${sample.map}-${density}x`,
        [`--density=${density}`, `--edition=${sample.edition}`, `--map=${sample.map}`, '--states',
            `--families=${sample.families.join(',')}`, ...(sample.map === 'mp05t4.map' ? ['--release'] : [])]);
    await run('native-fallback', `outpost-fallback-${density}x`, [`--density=${density}`, '--map=mp05t4.map']);
}
await fs.writeFile(path.join(root, 'status.json'), JSON.stringify({
    status: 'PASS_COPIED_R5_CHANGED_BUILDING_CASES', completed: completed.length,
    notNativeSelectable: plan.notNativeSelectable, userAcceptance: false,
    windows: 'NOT_RUN', physicalInput: 'NOT_RUN',
}, null, 2) + '\n');

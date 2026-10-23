// Check reported capturable civilian owner colors after the primary R4 batch.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const [receipt, primary, output] = process.argv.slice(2);
assert(receipt && primary && output, 'Usage: run-feedback-owner-supplement.mjs <receipt> <primary> <new-output>');
const status = JSON.parse(await fs.readFile(path.join(primary, 'status.json')));
assert.equal(status.status, 'PASS_COPIED_R4_NATIVE_REOPENED_CASES');
await fs.mkdir(output, { recursive: false });
const completed = [];
for (const density of [2, 4]) {
    const folder = path.join(output, `civil-owners-${density}x`);
    const options = [`--density=${density}`, '--phase=feedback-r4-civil-owner', '--names=CAAIRP,CAOILD'];
    await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['scripts/m2/official-maps/native-building-owners.mjs',
            receipt, folder, ...options, '--4k', '--bot-slot=1'], { stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(Error(`${folder} exited ${code}`)));
    });
    completed.push({ script: 'native-building-owners', output: folder, options });
    await fs.writeFile(path.join(output, 'completed.json'), JSON.stringify(completed, null, 2) + '\n');
}
await fs.writeFile(path.join(output, 'status.json'), JSON.stringify({
    status: 'PASS_COPIED_R4_CIVIL_OWNER_CASES', completed: completed.length,
    userAcceptance: false, windows: 'NOT_RUN', physicalInput: 'NOT_RUN',
}, null, 2) + '\n');

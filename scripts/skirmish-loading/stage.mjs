import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const source = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
const receipt = JSON.parse(await fs.readFile(path.join(source, 'package-receipt.json')));
const commit = receipt.runtimeIdentity.head;
const name = `RA2-HD-Loading-Optimized-${commit.slice(0, 7)}-macOS-arm64`;
await fs.mkdir(output, { recursive: false });
const folder = path.join(output, name);
await fs.mkdir(folder);
const app = path.join(folder, path.basename(receipt.app)), resources = path.join(folder, 'RA2-HD-Editions-Resources');
execFileSync('/usr/bin/ditto', [receipt.app, app]);
await fs.cp(receipt.resources, resources, { recursive: true, mode: constants.COPYFILE_FICLONE,
    force: false, errorOnExist: true, verbatimSymlinks: true });
for (const row of receipt.inventory) {
    const file = path.join(resources, row.file);
    assert.equal(createHash('sha256').update(await fs.readFile(file)).digest('hex'), row.sha256);
    assert.notEqual((await fs.stat(file)).ino, (await fs.stat(path.join(receipt.resources, row.file))).ino);
}
for (const file of ['Launch Loading Optimized.command', 'README.txt'])
    await fs.copyFile(path.join(source, file), path.join(folder, file), constants.COPYFILE_EXCL);
await fs.chmod(path.join(folder, 'Launch Loading Optimized.command'), 0o755);
await fs.writeFile(path.join(folder, 'BUILD-INFO.json'), JSON.stringify({ runtimeCommit: commit,
    branch: 'fix/skirmish-loading-isolated', integration: 'NOT_MERGED', mainBaseline: '0370e9b41d4736a0b80bbe35d2552b3f3a39a4a4',
    acceptedAlliedCorrection: '3b4202a8862ce637e3322dd0e31efaba87499149',
    resourceFiles: receipt.inventory.length,
    preparedIndex: JSON.parse(await fs.readFile(path.join(app, 'Contents/Resources/app/desktop/prepared-hd-contract.json'))).sha256,
    preservation: 'Accepted Allied art and committed Yuri resources; later Task C work excluded; native rules and geometry unchanged',
    profile: 'Created locally on launch; no test profiles or saves included' }, null, 2) + '\n');
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
await fs.writeFile(path.join(output, 'stage-receipt.json'), JSON.stringify({ status: 'STAGED_ARCHIVE_VALIDATION_PENDING',
    folder, app, resources, name, runtimeCommit: commit, resourceFiles: receipt.inventory.length }, null, 2) + '\n');
console.log(folder);

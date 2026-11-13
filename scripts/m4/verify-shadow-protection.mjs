import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const artifacts = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
const before = JSON.parse(fs.readFileSync(path.join(artifacts, 'preflight.json'), 'utf8'));
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const streamSha = async file => {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file, { highWaterMark: 1024 * 1024 })) hash.update(chunk);
    return hash.digest('hex');
};
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const workingFiles = before.workingFiles.map(row => {
    assert.equal(sha(path.join(root, row.path)), row.sha256, row.path);
    assert.equal(git('status', '--short', '--', row.path), row.status, row.path + ': status');
    assert.equal(git('ls-files', '--stage', '--', row.path), row.index, row.path + ': index');
    return { path: row.path, sha256: row.sha256, unchanged: true };
});
const names = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? names(file) : entry.isFile() ? [file] : [];
});
const profiles = before.realProfileRoots.flatMap(names).sort();
assert.deepEqual(profiles, before.realProfileFiles.map(row => row.path).sort(), 'Real profile inventory');
for (const row of before.realProfileFiles) assert.equal(sha(row.path), row.sha256, row.path);
assert.equal(sha(path.join(root, before.selectedResourceLedger.path)), before.selectedResourceLedger.sha256);
const selected = JSON.parse(fs.readFileSync(path.join(root, before.selectedResourceLedger.path), 'utf8'));
const started = performance.now();
for (const row of selected) {
    const file = path.join(root, '.local', row.path);
    assert.equal(fs.statSync(file).size, row.bytes, row.path + ': bytes');
    assert.equal(await streamSha(file), row.sha256, row.path + ': SHA256');
}
const applications = ['RA2-HD-Mac-v0.5-20261112', 'RA2-HD-Mac-M4.1-20261112'].map(name => {
    const app = path.resolve(root, '..', name, 'Red Alert 2 HD.app');
    execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
    return { path: app, signature: 'PASS_DEEP_STRICT', sourceHead: JSON.parse(fs.readFileSync(
        path.join(app, 'Contents/Resources/app/package.json'), 'utf8')).sourceHead };
});
const result = { schema: 'm4-3a-protection-v1', status: 'PASS_PROTECTED_FILES_RESOURCES_PROFILES_AND_APPS',
    head: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), workingFiles,
    realProfileFiles: profiles.length, selectedResourceFiles: selected.length,
    selectedResourceBytes: selected.reduce((sum, row) => sum + row.bytes, 0),
    selectedResourceLedgerSha256: before.selectedResourceLedger.sha256, applications,
    verificationSeconds: (performance.now() - started) / 1000 };
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, workingFiles: workingFiles.length,
    realProfileFiles: profiles.length, selectedResourceFiles: selected.length, applications: applications.length }));

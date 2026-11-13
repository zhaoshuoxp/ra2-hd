import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), output = path.resolve(process.argv[2]);
const allowlist = new Set(JSON.parse(await fs.readFile(path.join(root, 'desktop/app-files.json'), 'utf8')));
for (const name of await fs.readdir(path.join(root, 'dist/assets'))) {
    if (!allowlist.has(`dist/assets/${name}`)) throw Error('Refresh desktop/app-files.json with desktop:prepare before freezing');
}
for (const name of allowlist) if (!(await fs.stat(path.join(root, name))).isFile()) throw Error('Missing allowlisted file: ' + name);
await fs.mkdir(output, { recursive: false });
for (const name of ['dist', 'desktop']) await fs.cp(path.join(root, name), path.join(output, name), { recursive: true, verbatimSymlinks: true });
for (const name of ['package.json', 'LICENSE']) await fs.copyFile(path.join(root, name), path.join(output, name));
const files = [];
async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(file);
        else {
            if (!entry.isFile()) throw Error('Runtime snapshots require regular files');
            const bytes = await fs.readFile(file);
            files.push({ path: path.relative(output, file), bytes: bytes.length,
                sha256: createHash('sha256').update(bytes).digest('hex') });
        }
    }
}
await walk(output); files.sort((a, b) => a.path.localeCompare(b.path));
const diff = execFileSync('git', ['diff', 'HEAD', '--', 'src', 'desktop', 'public'], { cwd: root, encoding: 'utf8' });
const sourceNames = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard',
    'src', 'desktop', 'public'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const sourceFiles = [];
for (const name of [...new Set(sourceNames)].sort()) {
    const bytes = await fs.readFile(path.join(root, name));
    sourceFiles.push({ path: name, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const report = { schema: 'm4-production-runtime-v1', buildMode: 'production', root: output,
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceDiffSha256: createHash('sha256').update(diff).digest('hex'), sourceDiffBytes: Buffer.byteLength(diff),
    sourceFiles,
    files, bytes: files.reduce((sum, row) => sum + row.bytes, 0) };
await fs.writeFile(output + '.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ root: output, sourceHead: report.sourceHead, files: files.length, bytes: report.bytes }));

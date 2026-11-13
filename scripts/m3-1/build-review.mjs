import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..');
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, '.artifacts/m3-1/review-runtime');
await fs.mkdir(output, { recursive: !process.argv[2] });
execFileSync('bun', ['run', 'build', '--outDir', path.join(output, 'dist'), '--emptyOutDir'], { cwd: root, stdio: 'inherit' });
await fs.mkdir(path.join(output, 'desktop'), { recursive: true });
for (const name of await fs.readdir(path.join(root, 'desktop'))) {
    if (/\.(mjs|cjs|json)$/.test(name) && name !== 'app-files.json') await fs.copyFile(path.join(root, 'desktop', name), path.join(output, 'desktop', name));
}
async function inventory(directory, prefix = '') {
    const rows = [];
    for (const entry of await fs.readdir(path.join(directory, prefix), { withFileTypes: true })) {
        const relative = path.posix.join(prefix, entry.name);
        if (entry.isDirectory()) rows.push(...await inventory(directory, relative));
        else if (entry.isFile()) {
            const bytes = await fs.readFile(path.join(directory, relative));
            rows.push({ path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
        } else throw new Error(`Unexpected payload symlink: ${relative}`);
    }
    return rows;
}
const web = await inventory(path.join(output, 'dist'));
await fs.writeFile(path.join(output, 'desktop/app-files.json'), JSON.stringify(web.map(file => `dist/${file.path}`), null, 2) + '\n');
await fs.writeFile(path.join(output, 'package.json'), JSON.stringify({ name: 'ra2-hd-unified-desktop', private: true, version: '0.3.1',
    type: 'module', main: 'desktop/main.mjs', reviewMilestone: 'M3.1-NORMAL-REVIEW',
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() }, null, 2) + '\n');
await fs.copyFile(path.join(root, 'LICENSE'), path.join(output, 'LICENSE'));
await fs.writeFile(path.join(output, 'build.json'), JSON.stringify({ status: 'REVIEW_RUNTIME_SEE_MATCHED_ACCEPTANCE_RECEIPTS', web,
    resources: path.resolve(root, '../ra2-hd/.local'), campaign: path.join(root, '.local/campaign'),
    note: 'Reuses unchanged canonical resources and installed Electron. No application or multi-gigabyte resource copy.' }, null, 2) + '\n');
console.log(output);

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const output = path.resolve(process.argv[2]);
await fs.mkdir(output, { recursive: false });
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' });
const head = run('git', ['rev-parse', 'HEAD']).trim();
if (run('git', ['status', '--porcelain']).trim()) throw Error('Commit the runtime source before packaging');
execFileSync('bun', ['run', 'build', '--outDir', path.join(output, 'dist')], { stdio: 'inherit' });
await fs.cp('desktop', path.join(output, 'desktop'), { recursive: true, force: false, errorOnExist: true });
const files = [];
async function inventory(directory, prefix = '') {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.posix.join(prefix, item.name), absolute = path.join(directory, item.name);
        if (item.isSymbolicLink()) throw Error(`Unexpected payload link: ${file}`);
        if (item.isDirectory()) await inventory(absolute, file);
        else files.push({ file, sha256: createHash('sha256').update(await fs.readFile(absolute)).digest('hex') });
    }
}
await inventory(path.join(output, 'dist'), 'dist');
await fs.writeFile(path.join(output, 'desktop/app-files.json'), JSON.stringify(files.map(row => row.file).sort()) + '\n');
await inventory(path.join(output, 'desktop'), 'desktop');
await fs.writeFile(path.join(output, 'package.json'), JSON.stringify({ name: 'ra2-hd-unified-desktop', version: '0.2.5',
    private: true, type: 'module', main: 'desktop/main.mjs', reviewMilestone: 'OFFLINE-TRAINER-R1' }) + '\n');
await fs.writeFile(path.join(output, 'identity.json'), JSON.stringify({ head, branch: run('git', ['branch', '--show-current']).trim(),
    output, resourceRoot: path.resolve('.local'), files: files.sort((a, b) => a.file.localeCompare(b.file)) }, null, 2) + '\n');
console.log(output);

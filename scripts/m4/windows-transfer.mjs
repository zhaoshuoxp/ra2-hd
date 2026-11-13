import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../../..');
const source = path.join(root, 'source');
const resources = path.join(root, 'GameResources');
const node = path.join(root, 'tools/node/node.exe');
const bun = path.join(root, 'tools/bun/bun.exe');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const write = async (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export function checkedPath(directory, relative) {
    if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes(':')
        || relative.includes('\0') || relative.split('/').some(part => !part || part === '.' || part === '..')
        || path.isAbsolute(relative)) throw Error('Unsafe manifest path: ' + relative);
    return path.join(directory, ...relative.split('/'));
}

async function sha(file) {
    const h = createHash('sha256');
    for await (const chunk of createReadStream(file)) h.update(chunk);
    return h.digest('hex');
}

function run(executable, args, options = {}) {
    const result = spawnSync(executable, args, { cwd: source, stdio: 'inherit', ...options });
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error(`${path.basename(executable)} exited ${result.status}`);
}

function git(args) {
    const result = spawnSync('git', args, { cwd: source, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw Error(result.error?.message ?? result.stderr);
    return result.stdout.trim();
}

async function verifyRows(directory, rows) {
    for (const [i, row] of rows.entries()) {
        const file = checkedPath(directory, row.path), stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== row.bytes || await sha(file) !== row.sha256)
            throw Error('Integrity mismatch: ' + row.path);
        if (i % 2000 === 0) console.log(`Verified ${i}/${rows.length}`);
    }
    console.log(`PASS: ${rows.length} files`);
}

async function setup() {
    if (process.platform !== 'win32') throw Error('Development setup requires Windows');
    git(['--version']);
    const baseline = await read(path.join(root, 'TRANSFER.json'));
    if (git(['rev-parse', 'HEAD']) !== baseline.sourceHead) throw Error('Initialize dependencies at the exported baseline first');
    const link = path.join(source, '.local');
    if (await fs.lstat(link).catch(() => null)) {
        if (await fs.realpath(link) !== await fs.realpath(resources)) throw Error('Existing .local points elsewhere; do not overwrite it');
    } else await fs.symlink(resources, link, 'junction');
    const env = { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' };
    run(bun, ['install', '--frozen-lockfile'], { env });
    const electronModule = path.join(source, 'node_modules/electron');
    const metadata = await read(path.join(electronModule, 'package.json'));
    if (metadata.version !== baseline.versions.electron) throw Error('Electron version changed');
    for (const item of await read(path.join(root, 'manifests/electron-files.json'))) {
        const target = checkedPath(path.join(electronModule, 'dist'), item.original);
        const input = checkedPath(root, item.path);
        if (await sha(input) !== item.sha256) throw Error('Bundled Electron changed: ' + item.path);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(input, target);
    }
    await fs.writeFile(path.join(electronModule, 'path.txt'), 'electron.exe');
    console.log('Development ready. Formal resources are shared through source/.local.');
}

function cleanHead() {
    if (git(['status', '--porcelain'])) throw Error('Commit intended source changes and resolve unrelated work before freezing/exporting');
    return git(['rev-parse', 'HEAD']);
}

async function refresh() {
    const head = cleanHead();
    run(bun, ['run', 'desktop:prepare']);
    const output = path.join(root, 'evidence/windows', 'freeze-' + stamp());
    await fs.mkdir(path.dirname(output), { recursive: true });
    run(node, [path.join(source, 'scripts/m4/freeze-runtime.mjs'), output]);
    const identity = await read(output + '.json');
    if (identity.sourceHead !== head || identity.sourceDiffBytes !== 0) throw Error('Frozen source is not the clean committed candidate');
    const app = path.join(root, 'resources/app'), baselineApp = path.join(root, 'resources/baseline-app');
    const wrapper = await fs.readFile(path.join(app, 'desktop/windows-transfer-main.mjs'));
    const old = await read(path.join(app, 'package.json'));
    const metadata = { ...old, sourceHead: head,
        sourceDigest: createHash('sha256').update(JSON.stringify(identity.sourceFiles)).digest('hex'),
        sourceDigestSchema: 'sha256-json-frozen-source-files', main: 'desktop/windows-transfer-main.mjs' };
    await fs.writeFile(path.join(output, 'desktop/windows-transfer-main.mjs'), wrapper);
    await write(path.join(output, 'package.json'), metadata);
    // Keep one small baseline program; all programs share the single resource tree.
    const backup = await fs.stat(baselineApp).catch(() => null) ? app + '.previous-' + stamp() : baselineApp;
    await fs.rename(app, backup);
    try { await fs.rename(output, app); }
    catch (error) { await fs.rename(backup, app); throw error; }
    if (backup !== baselineApp) await fs.rm(backup, { recursive: true });
    console.log('Portable candidate refreshed at ' + head + '. Test this actual executable again.');
}

async function benchmark(extra) {
    const edition = extra[0] ?? 'yr', scene = extra[1] ?? 'sustained', phase = extra[2] ?? 'measure';
    if (!['ra2', 'yr'].includes(edition) || !['dense', 'sustained', 'overload'].includes(scene)
        || !['measure', 'profile', 'explore'].includes(phase)) throw Error('Expected edition, scene and phase');
    const parent = path.join(root, 'evidence/windows');
    await fs.mkdir(parent, { recursive: true });
    const out = path.join(parent, `${edition}-${scene}-${phase}-${stamp()}`);
    run(node, [path.join(source, 'scripts/m4/benchmark.mjs'), `--windows-app=${root}`,
        `--out=${out}`, `--edition=${edition}`, `--scene=${scene}`, `--phase=${phase}`,
        ...(phase === 'profile' ? ['--seconds=25'] : [])]);
}

async function listFiles(directory, prefix = '', excludedDirectories = new Set()) {
    const result = [];
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const relative = prefix + entry.name, file = path.join(directory, entry.name);
        if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
        if (entry.isSymbolicLink()) throw Error('Unexpected symbolic link in transfer content: ' + relative);
        if (entry.isDirectory()) result.push(...await listFiles(file, relative + '/', excludedDirectories));
        else if (entry.isFile()) result.push(relative);
    }
    return result;
}

async function createReturn() {
    const head = cleanHead(), baseline = await read(path.join(root, 'TRANSFER.json'));
    git(['merge-base', '--is-ancestor', baseline.sourceHead, head]);
    if (head === baseline.sourceHead) throw Error('Commit the Windows findings or changes before returning');
    const out = path.join(root, 'returns', 'M4.2-Windows-Return-' + stamp());
    await fs.mkdir(out, { recursive: true });
    run('git', ['bundle', 'create', path.join(out, 'changes.bundle'), `${baseline.sourceHead}..HEAD`]);
    await fs.writeFile(path.join(out, 'changes.patch'), git(['diff', '--binary', baseline.sourceHead, head]) + '\n');
    const evidence = path.join(root, 'evidence/windows');
    const excluded = new Set(['profile', 'node_modules', 'UserData', 'Cache', 'Code Cache', 'GPUCache']);
    for (const name of await listFiles(evidence, '', excluded)) {
        if (!/\.(json|log|txt|md|csv|cpuprofile|png)$/.test(name)) continue;
        const target = path.join(out, 'evidence', name);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(path.join(evidence, name), target);
    }
    const original = new Map((await read(path.join(root, 'manifests/resources.json'))).map(row => [row.path, row]));
    const changed = [], seen = new Set();
    for (const name of await listFiles(resources)) {
        if (name.split('/').some(part => part === '.DS_Store')) continue;
        seen.add(name);
        if (seen.size % 2000 === 0) console.log(`Checking return resource delta: ${seen.size}`);
        const file = path.join(resources, name), stat = await fs.stat(file), hash = await sha(file), prior = original.get(name);
        if (prior?.sha256 === hash && prior.bytes === stat.size) continue;
        const target = path.join(out, 'resource-delta', name);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(file, target);
        changed.push({ path: name, bytes: stat.size, sha256: hash });
    }
    const appMetadata = await read(path.join(root, 'resources/app/package.json'));
    const receipt = { schema: 'm4-windows-return-v1', base: baseline.sourceHead, head,
        sourceChanges: git(['diff', '--name-status', baseline.sourceHead, head]),
        packagedSourceHead: appMetadata.sourceHead, packagedMatchesHead: appMetadata.sourceHead === head,
        resourceChanges: changed, removedResources: [...original.keys()].filter(name => !seen.has(name)),
        qualification: 'Inspect evidence and performance gates. Export success does not mean acceptance.' };
    await write(path.join(out, 'RETURN.json'), receipt);
    const inventory = [];
    for (const name of await listFiles(out)) {
        const file = path.join(out, name);
        inventory.push({ path: name, bytes: (await fs.stat(file)).size, sha256: await sha(file) });
    }
    await write(path.join(out, 'FILES.json'), inventory);
    const archive = out + '.tar.gz';
    run('tar.exe', ['-czf', archive, '-C', path.dirname(out), path.basename(out)]);
    await fs.writeFile(archive + '.sha256', `${await sha(archive)}  ${path.basename(archive)}\n`);
    console.log('Return to the Mac: ' + archive);
}

export async function main(action, extra = []) {
    process.env.PATH = [path.dirname(node), path.dirname(bun), process.env.PATH].join(path.delimiter);
    if (action === 'verify') await verifyRows(root, await read(path.join(root, 'FILES.json')));
    else if (action === 'verify-resources') await verifyRows(resources, await read(path.join(root, 'manifests/resources.json')));
    else if (action === 'setup') await setup();
    else if (action === 'refresh') await refresh();
    else if (action === 'benchmark') await benchmark(extra);
    else if (action === 'return') await createReturn();
    else throw Error('Expected verify, verify-resources, setup, refresh, benchmark or return');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main(process.argv[2], process.argv.slice(3));
}

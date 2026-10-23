// Build only into a new versioned directory; never touch dist or retained apps.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, encoding: 'utf8', ...options });
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw Error('macOS Apple Silicon is required');
const version = `build-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const output = path.join(root, '.artifacts/m1-6b', version);
await fs.mkdir(output, { recursive: true });
const web = path.join(output, 'web');
const sourceFiles = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = [];
for (const file of [...new Set(sourceFiles)].sort()) source.push({ file, sha256: hash(await fs.readFile(path.join(root, file))) });
const identity = { head: run('git', ['rev-parse', 'HEAD']).trim(), branch: run('git', ['branch', '--show-current']).trim(),
    dirty: run('git', ['status', '--porcelain']), files: source, sourceDigest: hash(JSON.stringify(source)),
    note: 'Source content snapshot taken before build; HEAD is the parent when dirty. A later commit must be bound by content comparison.' };
await fs.writeFile(path.join(output, 'source.json'), JSON.stringify(identity, null, 2) + '\n');
await fs.writeFile(path.join(output, 'source.patch'), run('git', ['diff', 'HEAD', '--binary']));
run('bun', ['run', 'build', '--outDir', web], { stdio: 'inherit' });
const staticFiles = ['index.html', 'config.ini', 'mods.ini', 'servers.ini', '7zz.wasm', 'css/main-legacy.css',
    'other/file-explorer.css', 'other/fileexplorer_sprites.png', 'res/locale/en-US.json', 'res/locale/zh-CN.json',
    'res/img/drag-archive.png', 'res/img/drag-folder.png', 'res/img/download-arrow.png', 'res/fonts/fonts.css',
    'res/fonts/wEOsEADFm8hSaQTFG18FErVhsC9x-tarWU3IuMR0cg.woff2', 'res/fonts/wEOsEADFm8hSaQTFG18FErVhsC9x-tarWQXOuMR0cg.woff2'];
const emitted = await fs.readdir(path.join(web, 'assets'));
if (emitted.some(name => !/^[\w.-]+\.(js|css)$/.test(name) && !/^fileexplorer_sprites-[\w-]+\.png$/.test(name)))
    throw Error('Unexpected emitted asset; review the allowlist');
const webFiles = [...staticFiles, ...emitted.map(name => `assets/${name}`)].sort();
const app = path.join(output, 'Red Alert 2 HD M1.6b R2.app');
await fs.cp(path.join(root, 'node_modules/electron/dist/Electron.app'), app, { recursive: true, verbatimSymlinks: true });
const payload = path.join(app, 'Contents/Resources/app');
await fs.mkdir(payload, { recursive: true });
async function copy(from, relative) {
    if (await fs.realpath(from) !== from) throw Error(`Symlink payload refused: ${from}`);
    const target = path.join(payload, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(from, target);
}
for (const file of webFiles) await copy(path.join(web, file), `dist/${file}`);
const desktopFiles = ['main.mjs', 'display.mjs', 'controls.mjs', 'profile.mjs', 'hd-profile.mjs', 'ui-profile.mjs', 'protocol.mjs', 'url-policy.mjs', 'preload.cjs'];
for (const name of desktopFiles) await copy(path.join(root, 'desktop', name), `desktop/${name}`);
run('/usr/bin/clang', ['-O2', '-arch', 'arm64', '-framework', 'ApplicationServices',
    path.join(root, 'desktop/native/restore-cursor.c'), '-o', path.join(payload, 'desktop/restore-cursor')]);
await copy(path.join(root, 'LICENSE'), 'LICENSE');
await copy(path.join(root, 'node_modules/electron/LICENSE'), 'ELECTRON-LICENSE');
await fs.writeFile(path.join(payload, 'desktop/app-files.json'), JSON.stringify(webFiles.map(f => `dist/${f}`), null, 2) + '\n');
await fs.writeFile(path.join(payload, 'package.json'), JSON.stringify({ name: 'ra2-hd-unified-desktop', version: '0.1.6', reviewMilestone: 'M1.6b-R2',
    private: true, type: 'module', main: 'desktop/main.mjs' }, null, 2) + '\n');
run('python3', ['-c', `import plistlib,sys\np=sys.argv[1]\nwith open(p,'rb') as f: d=plistlib.load(f)\nd.update(CFBundleIdentifier='local.ra2hd.m16b.r2',CFBundleName='RA2 HD M1.6b R2',CFBundleDisplayName='Red Alert 2 HD M1.6b R2',CFBundleShortVersionString='0.1.6')\nwith open(p,'wb') as f: plistlib.dump(d,f)`, path.join(app, 'Contents/Info.plist')]);
async function inventory(directory, prefix = '') {
    const rows = [];
    for (const entry of (await fs.readdir(path.join(directory, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path.posix.join(prefix, entry.name);
        if (entry.isDirectory()) rows.push(...await inventory(directory, file));
        else if (entry.isSymbolicLink()) rows.push({ file, link: await fs.readlink(path.join(directory, file)) });
        else { const bytes = await fs.readFile(path.join(directory, file)); rows.push({ file, bytes: bytes.length, sha256: hash(bytes) }); }
    }
    return rows;
}
const report = { status: 'BUILT_NOT_YET_DESKTOP_VALIDATED', artifact: app, executable: path.join(app, 'Contents/MacOS/Electron'),
    target: 'darwin-arm64', electron: JSON.parse(await fs.readFile(path.join(root, 'node_modules/electron/package.json'))).version,
    source: identity, web: await inventory(web), payload: await inventory(payload), bundle: await inventory(app),
    exclusions: ['retail data', 'HD artwork and masks', 'registration and profiles', 'fixtures', 'evidence', 'repository tree'],
    packaging: 'Local development Electron bundle; no signing, notarization, installer or publication' };
await fs.writeFile(path.join(output, 'artifact.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`M1.6b application: ${app}\nIdentity: ${path.join(output, 'artifact.json')}`);

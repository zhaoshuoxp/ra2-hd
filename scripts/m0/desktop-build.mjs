import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const staticFiles = ['index.html', 'config.ini', 'mods.ini', 'servers.ini', '7zz.wasm', 'css/main-legacy.css',
    'other/file-explorer.css', 'other/fileexplorer_sprites.png', 'res/locale/en-US.json', 'res/locale/zh-CN.json', 'res/locale/zh-TW.json',
    ...['ra2', 'yr'].flatMap(edition => ['en-US', 'zh-CN', 'zh-TW'].map(language => `res/locale/retail-${edition}-${language}.json`)),
    ...['victory', 'defeat'].flatMap(outcome => [2, 4].map(density => `res/ui/result-${outcome}-hd-v1-${density}x.png`)),
    ...['dialog-background-r2.png', 'dialog-background-yr-r2.png', 'save-files-neutral-r3.png',
        'save-files-allied-r3.png', 'save-files-soviet-r3.png', 'yuri-pause-emblem-hd-v2.png'].map(name => `res/ui/${name}`),
    'res/img/drag-archive.png', 'res/img/drag-folder.png', 'res/img/download-arrow.png', 'res/fonts/fonts.css',
    'res/fonts/wEOsEADFm8hSaQTFG18FErVhsC9x-tarWU3IuMR0cg.woff2', 'res/fonts/wEOsEADFm8hSaQTFG18FErVhsC9x-tarWQXOuMR0cg.woff2'];
const emitted = await fs.readdir('dist/assets');
if (emitted.some(name => !/^[\w.-]+\.(js|css)$/.test(name) && !/^fileexplorer_sprites-[\w-]+\.png$/.test(name))) throw new Error('Unexpected built asset; review the application allowlist');
const files = [...staticFiles, ...emitted.map(name => `assets/${name}`)].map(name => `dist/${name}`).sort();
for (const file of files) {
    const full = path.join(root, file);
    if (await fs.realpath(full) !== full || !(await fs.stat(full)).isFile()) throw new Error(`Unsafe build file: ${file}`);
}
await fs.writeFile('desktop/app-files.json', JSON.stringify(files, null, 2) + '\n');
if (process.argv.includes('--app')) {
    if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('This development artifact command targets macOS arm64 only');
    const output = path.join(root, '.artifacts/m0-3/apps', `build-${Date.now()}`, 'Red Alert 2 HD.app');
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.cp('node_modules/electron/dist/Electron.app', output, { recursive: true, verbatimSymlinks: true });
    const destination = path.join(output, 'Contents/Resources/app');
    const entries = [...files, 'LICENSE', ...['main.mjs', 'display.mjs', 'profile.mjs', 'hd-profile.mjs', 'ui-profile.mjs', 'protocol.mjs', 'url-policy.mjs', 'preload.cjs', 'app-files.json'].map(name => `desktop/${name}`)];
    const hashes = [];
    for (const file of entries) {
        const target = path.join(destination, file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(file, target);
        hashes.push({ file, sha256: createHash('sha256').update(await fs.readFile(target)).digest('hex') });
    }
    await fs.writeFile(path.join(destination, 'package.json'), JSON.stringify({ name: 'ra2-hd-desktop', version: '0.0.3', private: true, type: 'module', main: 'desktop/main.mjs' }, null, 2));
    await fs.copyFile('node_modules/electron/LICENSE', path.join(destination, 'ELECTRON-LICENSE'));
    const report = { artifact: output, target: 'darwin-arm64', electron: JSON.parse(await fs.readFile('node_modules/electron/package.json')).version,
        source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }), files: hashes,
        packaging: 'Local development copy of the pinned Electron.app with an explicit application payload allowlist; no installer or signing step' };
    await fs.writeFile('.artifacts/m0-3/app-artifact.json', JSON.stringify(report, null, 2));
    console.log(output);
} else console.log(`Desktop route allowlist prepared: ${files.length} built files`);

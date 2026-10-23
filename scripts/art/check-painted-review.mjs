// Verify the actual delivered offline frames, controls and recorded media.
import { webkit, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const [directory, output] = process.argv.slice(2);
await fs.mkdir(output, { recursive: false });
const root = path.resolve(directory);
const contents = JSON.parse(await fs.readFile(path.join(root, 'review-contents.json')));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'file-manifest.json')));
for (const row of manifest.files) {
    const bytes = await fs.readFile(path.join(root, row.file));
    assert.equal(bytes.length, row.bytes, row.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256, row.file);
}
const reuseArgument = process.argv.find(value => value.startsWith('--reuse-accepted-check='));
const reuseDirectory = process.argv.find(value => value.startsWith('--reuse-accepted-directory='));
let reuse;
if (reuseArgument) {
    const file = path.resolve(reuseArgument.split('=').slice(1).join('='));
    const bytes = await fs.readFile(file);
    const report = JSON.parse(bytes);
    assert.equal(report.status, 'PASS_COMPLETE_OFFLINE_FRAMES_CONTROLS_AND_ACTUAL_VIDEO_PLAYBACK');
    const priorRoot = reuseDirectory
        ? path.resolve(reuseDirectory.split('=').slice(1).join('=')) : report.directory;
    const manifestBytes = await fs.readFile(path.join(priorRoot, 'file-manifest.json'));
    assert.equal(createHash('sha256').update(manifestBytes).digest('hex'), report.sourceManifestSha256);
    const priorManifest = JSON.parse(manifestBytes);
    const contentBytes = await fs.readFile(path.join(priorRoot, 'review-contents.json'));
    assert.equal(createHash('sha256').update(contentBytes).digest('hex'),
        priorManifest.files.find(row => row.file === 'review-contents.json').sha256);
    reuse = { file, sha256: createHash('sha256').update(bytes).digest('hex'), report,
        directory: priorRoot, manifest: priorManifest, contents: JSON.parse(contentBytes) };
}
const useElectron = process.argv.includes('--electron');
const electronApp = useElectron ? await electron.launch({
    executablePath: path.resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.resolve('scripts/art/review-electron.mjs'), path.resolve(output, 'test-profile')],
}) : undefined;
if (electronApp) assert.equal(await electronApp.evaluate(({ app }) => app.getPath('userData')),
    path.resolve(output, 'test-profile'));
const browser = useElectron ? {
    async newPage({ viewport }) {
        const opened = electronApp.waitForEvent('window');
        await electronApp.evaluate(async ({ BrowserWindow }, viewport) => {
            const window = new BrowserWindow({ ...viewport, show: false,
                webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
            globalThis.reviewWindows ??= new Set();
            globalThis.reviewWindows.add(window);
            window.on('closed', () => globalThis.reviewWindows.delete(window));
            await window.loadURL('about:blank');
        }, viewport);
        const page = await opened;
        await page.setViewportSize(viewport);
        return page;
    },
    close: () => electronApp.close(),
} : await webkit.launch({ headless: true });
const results = [];
let checkedFrames = 0, playedClips = 0, checkedReadyStates = 0;
let reusedFrames = 0, reusedClips = 0, reusedReadyStates = 0;
try {
    for (const entry of contents.pages) {
        if (reuse && entry.sequences.every(key => contents.acceptedUnchangedKeys.includes(key))) {
            const prior = reuse.report.results.find(result => result.file === entry.file);
            const oldEntry = reuse.contents.pages.find(page => page.file === entry.file);
            const oldHash = reuse.manifest.files.find(row => row.file === entry.file)?.sha256;
            const newHash = manifest.files.find(row => row.file === entry.file)?.sha256;
            if (prior && oldEntry && oldHash === newHash) {
                assert.deepEqual(prior.sequences, entry.sequences);
                assert.deepEqual(oldEntry, entry);
                assert.deepEqual(prior.errors, []); assert.deepEqual(prior.remote, []);
                assert.equal(prior.nativeRecordings, 'PASS_ACTUAL_PLAYBACK');
                // Each page embeds all frame and media bytes plus its controls.
                // An identical sealed HTML hash retains the prior playback proof.
                const html = await fs.readFile(path.join(root, entry.file), 'utf8');
                const payload = JSON.parse(html.split('const families=')[1].split(';const $=')[0]);
                const frames = payload.reduce((total, family) => total + family.frames * 2, 0);
                reusedFrames += frames;
                reusedClips += entry.recordedRuns * 2;
                reusedReadyStates += entry.recordedRuns;
                results.push({ ...prior, verification: 'HASH_IDENTICAL_ACCEPTED_EMBEDDED_PAGE',
                    htmlSha256: newHash, priorCheck: reuse.file, priorCheckSha256: reuse.sha256,
                    priorSealedDirectory: reuse.directory });
                continue;
            }
        }
        const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
        const errors = [], remote = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
        await page.goto(pathToFileURL(path.join(root, entry.file)).href);
        const keys = await page.locator('#family option').allTextContents();
        assert.deepEqual(keys, entry.sequences);
        const backdropChecks = [];
        if (await page.locator('#backdrop').count()) {
            for (const mode of ['dark', 'light', 'checker', 'terrain']) {
                await page.locator('#backdrop').selectOption(mode);
                const backgrounds = await page.evaluate(() => ['original', 'before', 'candidate'].map(id => {
                    const style = getComputedStyle(document.getElementById(id));
                    return { color: style.backgroundColor, image: style.backgroundImage };
                }));
                assert.deepEqual(backgrounds[0], backgrounds[1]);
                assert.deepEqual(backgrounds[1], backgrounds[2]);
                if (mode === 'checker') assert.match(backgrounds[0].image, /conic-gradient/);
                else assert.equal(backgrounds[0].color,
                    { dark: 'rgb(16, 16, 16)', light: 'rgb(243, 243, 243)', terrain: 'rgb(52, 72, 61)' }[mode]);
                backdropChecks.push(mode);
            }
        }
        for (const [index, key] of keys.entries()) {
            await page.locator('#family').selectOption(String(index));
            const count = await page.evaluate(() => selected.frames);
            for (const density of ['2', '4']) {
                await page.locator('#density').selectOption(density);
                for (let phase = 0; phase < count; phase++) {
                    await page.evaluate(phase => {
                        const slider = document.getElementById('phase');
                        slider.value = String(phase); slider.dispatchEvent(new Event('input', { bubbles: true }));
                    }, phase);
                    await page.waitForFunction(() => ['original', 'before', 'candidate'].every(id => {
                        const image = document.getElementById(id);
                        return image.complete && image.naturalWidth > 0;
                    }));
                    assert.equal(await page.locator('#label').textContent(), `Phase ${phase} / ${count - 1}`);
                    checkedFrames++;
                }
                if (entry.nativeRecordings) {
                    const matched = await page.evaluate(() => recordings[+$('recorded-run').value]);
                    assert.equal(matched.key, key);
                    assert.equal(String(matched.density), density);
                }
            }
        }
        await page.locator('#reverse').click();
        assert.equal(await page.locator('#reverse').textContent(), 'Unbuild');
        const before = await page.locator('#label').textContent();
        await page.locator('#play').click();
        await page.waitForTimeout(350);
        await page.locator('#play').click();
        assert.notEqual(await page.locator('#label').textContent(), before);
        if (entry.nativeRecordings) {
            const options = await page.locator('#recorded-run option').allTextContents();
            assert.equal(options.length, entry.recordedRuns ?? 5);
            for (let run = 0; run < options.length; run++) {
                await page.locator('#recorded-run').selectOption(String(run));
                for (const kind of ['build', 'sale']) {
                    const info = await page.evaluate(async kind => {
                        const video = document.getElementById('native-' + kind);
                        await video.play();
                        // Embedded clips can take longer than one fixed delay
                        // to decode. Require real media-clock progress, bounded
                        // by a timeout, before accepting playback.
                        const deadline = performance.now() + 5000;
                        while (video.currentTime === 0 && !video.error && performance.now() < deadline)
                            await new Promise(resolve => setTimeout(resolve, 80));
                        await new Promise(resolve => setTimeout(resolve, 120));
                        video.pause();
                        return { time: video.currentTime, width: video.videoWidth, height: video.videoHeight,
                            error: video.error?.message, duration: video.duration };
                    }, kind);
                    assert(info.time > 0 && info.width > 0 && info.height > 0 && !info.error, JSON.stringify(info));
                    playedClips++;
                }
                const hasReady = await page.evaluate(() => !!recordings[+$('recorded-run').value].ready);
                if (hasReady) {
                    await page.waitForFunction(() => {
                        const image = document.getElementById('native-ready');
                        return image.complete && image.naturalWidth > 0;
                    });
                    checkedReadyStates++;
                }
                const hasTransition = await page.evaluate(() => !!recordings[+$('recorded-run').value].transition);
                if (hasTransition) {
                    await page.waitForFunction(() => {
                        const image = document.getElementById('native-transition');
                        return image.complete && image.naturalWidth === 1024 && image.naturalHeight === 512;
                    });
                }
                const original = await page.evaluate(() => recordings[+$('recorded-run').value].original);
                if (!original) await page.waitForFunction(() => {
                    const image = document.getElementById('native-sheet');
                    return image.complete && image.naturalWidth > 0;
                });
            }
            await page.locator('#next').click();
            assert.equal(await page.locator('#recorded-run').inputValue(), String(options.length - 1), 'Original control survives frame stepping');
        } else {
            assert.equal(await page.locator('video').count(), 0, 'Unrecorded candidate has no reused footage');
            assert.match(await page.locator('.status').textContent(), /Native game recordings have not been captured/);
        }
        await page.screenshot({ path: path.join(output, entry.identity + '.png'), fullPage: false });
        assert.deepEqual(errors, []); assert.deepEqual(remote, []);
        results.push({ file: entry.file, sequences: keys, densities: [2, 4], errors, remote,
            backdropChecks,
            nativeRecordings: entry.nativeRecordings ? 'PASS_ACTUAL_PLAYBACK' : 'EXPLICITLY_NOT_CAPTURED' });
        await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [], remote = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
    await page.goto(pathToFileURL(path.join(root, 'Open-Review.html')).href);
    await page.waitForFunction(() => [...document.querySelectorAll('img.preview')].every(i => i.complete && i.naturalWidth));
    assert.equal(await page.locator('a.open').count(), contents.pages.length);
    assert.equal(await page.locator('img.preview').count(), contents.selectedSequences);
    await page.screenshot({ path: path.join(output, 'review-index.png') });
    assert.deepEqual(errors, []); assert.deepEqual(remote, []);
    await page.close();
} finally { await browser.close(); }
assert.equal(checkedFrames + reusedFrames, contents.checkedDensityFrames);
assert.equal(playedClips + reusedClips, contents.nativeRecordings);
assert.equal(checkedReadyStates + reusedReadyStates, contents.readyScreenshots ?? 0);
const report = { status: reusedFrames ? 'PASS_COMPLETE_REVIEW_WITH_HASH_IDENTICAL_ACCEPTED_PLAYBACK'
    : 'PASS_COMPLETE_OFFLINE_FRAMES_CONTROLS_AND_ACTUAL_VIDEO_PLAYBACK', directory: root,
    checkedFiles: manifest.files.length, checkedDensityFrames: checkedFrames, playedClips, checkedReadyStates, results,
    reusedDensityFrames: reusedFrames, reusedPlayedClips: reusedClips, reusedReadyStates,
    verifiedDensityFrames: checkedFrames + reusedFrames, verifiedClips: playedClips + reusedClips,
    verifiedReadyStates: checkedReadyStates + reusedReadyStates,
    browser: useElectron ? 'Electron Chromium' : 'WebKit',
    sourceManifestSha256: createHash('sha256').update(await fs.readFile(path.join(root, 'file-manifest.json'))).digest('hex') };
await fs.writeFile(path.join(output, 'review-check.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, pages: results.length, checkedFrames, playedClips,
    checkedReadyStates, reusedFrames, reusedClips, reusedReadyStates }));

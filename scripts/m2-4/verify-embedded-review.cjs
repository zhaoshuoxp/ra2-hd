// Render the static standalone review in an isolated project-owned Electron window.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const html = path.resolve(argument('html'));
const output = path.resolve(argument('output'));
const metadata = JSON.parse(fs.readFileSync(html.replace(/\.html$/, '.json'), 'utf8'));
assert(!fs.existsSync(output));
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
const report = { status: 'RUNNING', html, errors: [], checks: [] };
app.whenReady().then(async () => {
    const window = new BrowserWindow({ show: false, width: 1440, height: 1000,
        webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
    window.webContents.on('console-message', (_event, level, message) => {
        if (level >= 3) report.errors.push(message);
    });
    try {
        await window.loadFile(html);
        for (const density of ['2X', 'Original', '4X', 'all']) {
            const result = await window.webContents.executeJavaScript(`(async () => {
                const density = ${JSON.stringify(density)};
                const id = { '2X': 'density-2', Original: 'density-original', '4X': 'density-4', all: 'density-all' }[density];
                document.getElementById(id).click();
                const first = document.querySelector('#scene-0');
                const visible = [...first.querySelectorAll('figure')].filter(figure => getComputedStyle(figure).display !== 'none');
                for (const figure of visible) await figure.querySelector('img').decode();
                return { density, visible: visible.map(figure => figure.dataset.density),
                    images: visible.map(figure => { const image = figure.querySelector('img');
                        return { embedded: image.src.startsWith('data:image/png;base64,'), source: image.dataset.source,
                            native: [image.naturalWidth, image.naturalHeight],
                            displayed: [image.getBoundingClientRect().width, image.getBoundingClientRect().height],
                            viewerHeight: image.parentElement.getBoundingClientRect().height }; }),
                    scripts: document.scripts.length, totalImages: document.images.length,
                    fit: document.getElementById('fit').checked };
            })()`);
            assert.deepEqual(result.visible, density === 'all' ? ['Original', '2X', '4X'] : [density]);
            assert.equal(result.totalImages, metadata.images.length);
            assert.equal(result.scripts, 0); assert.equal(result.fit, false);
            for (const image of result.images) {
                assert(image.embedded);
                assert.deepEqual(image.native, metadata.images.find(entry => entry.file === image.source).size);
                assert.deepEqual(image.displayed, image.native);
                assert(image.viewerHeight > 500);
            }
            report.checks.push(result);
        }
        // Narrow the test window so smaller native crops also need scaling.
        window.setSize(640, 1000);
        report.fit = await window.webContents.executeJavaScript(`(async () => {
            await new Promise(resolve => requestAnimationFrame(resolve));
            document.getElementById('density-2').click(); document.getElementById('fit').click();
            const image = document.querySelector('#scene-0 figure[data-density="2X"] img');
            return { nativeWidth: image.naturalWidth, displayedWidth: image.width,
                fit: document.getElementById('fit').checked };
        })()`);
        assert(report.fit.fit && report.fit.displayedWidth < report.fit.nativeWidth);
        await window.webContents.executeJavaScript("document.getElementById('fit').click()");
        window.setSize(1440, 1000);
        if (metadata.videos?.length) {
            report.videos = [];
            await window.webContents.executeJavaScript("document.getElementById('density-all').click()");
            for (const expected of metadata.videos) {
                const result = await window.webContents.executeJavaScript(`(async () => {
                    const source = ${JSON.stringify(expected.file)};
                    const video = [...document.querySelectorAll('video')].find(item => item.dataset.source === source);
                    if (!video) throw new Error('Missing native recording: ' + source);
                    const details = video.closest('details');
                    details.open = true;
                    video.muted = true;
                    await Promise.race([
                        new Promise((resolve, reject) => {
                            video.addEventListener('loadeddata', resolve, { once: true });
                            video.addEventListener('error', () => reject(new Error('Cannot decode ' + source)), { once: true });
                            video.load();
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Video load timeout: ' + source)), 10000))
                    ]);
                    await video.play();
                    await new Promise(resolve => setTimeout(resolve, 160));
                    video.pause();
                    const result = { source, embedded: video.src.startsWith('data:video/webm;base64,'),
                        native: [video.videoWidth, video.videoHeight], timeAdvanced: video.currentTime > 0,
                        decodedFrames: video.getVideoPlaybackQuality().totalVideoFrames, error: video.error?.message ?? null };
                    video.removeAttribute('src'); video.load();
                    details.open = false;
                    return result;
                })()`);
                assert(result.embedded && result.timeAdvanced && result.decodedFrames > 0 && result.error === null);
                assert.deepEqual(result.native, expected.size);
                report.videos.push(result);
            }
            await window.webContents.executeJavaScript("document.getElementById('density-2').click()");
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        fs.writeFileSync(path.join(output, 'preview.png'), (await window.webContents.capturePage()).toPNG());
        assert.equal(report.errors.length, 0);
        report.status = metadata.videos?.length
            ? 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_CONTROLS_AND_NATIVE_VIDEO_PLAYBACK'
            : 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS';
    } catch (error) { report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1; }
    finally {
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        window.destroy(); app.exit(report.status === 'FAIL' ? 1 : 0);
    }
});

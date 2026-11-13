import assert from 'node:assert/strict';
import path from 'node:path';

export async function inspectScoreLayout(app, page, out, mission) {
    const expected = mission.startsWith('sov') ? 'campaign-backdrop-soviet-score-original-r4.png'
        : 'campaign-backdrop-allied-score-original-v50-r1.png';
    const browserWindow = await app.browserWindow(page), layouts = [];
    for (const [name, dimensions] of [['wide', [1280, 720]], ['standard', [1024, 768]], ['fullscreen', null]]) {
        await browserWindow.evaluate((window, dimensions) => {
            if (dimensions) { window.setFullScreen(false); window.unmaximize(); window.setContentSize(...dimensions); }
            else window.setFullScreen(true);
        }, dimensions);
        await page.waitForFunction(expected => {
            const root = document.querySelector('[data-campaign-score=retail]'), canvas = root?.querySelector('canvas');
            if (!canvas || canvas.dataset.campaignBackdrop !== expected) return false;
            const width = canvas.clientWidth, height = canvas.clientHeight;
            const density = Math.min(2, Math.sqrt(1700000 / (width * height)));
            return canvas.width === Math.floor(width * density) && canvas.height === Math.floor(height * density);
        }, expected);
        // Resizing resets the backing canvas before the next animation paint.
        await page.waitForFunction(() => {
            const canvas = document.querySelector('[data-campaign-score=retail] canvas');
            const context = canvas.getContext('2d');
            return [[.03, .1], [.97, .1], [.03, .9], [.97, .9]].every(([x, y]) =>
                context.getImageData(Math.floor(x * canvas.width), Math.floor(y * canvas.height), 1, 1).data[3] === 255);
        });
        const state = await page.evaluate(() => {
            const root = document.querySelector('[data-campaign-score=retail]'), canvas = root.querySelector('canvas');
            const content = root.querySelector('[data-campaign-result-content]');
            const context = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
            return { viewport: [innerWidth, innerHeight], backdrop: canvas.dataset.campaignBackdrop,
                root: root.getBoundingClientRect().toJSON(), canvas: canvas.getBoundingClientRect().toJSON(),
                content: content.getBoundingClientRect().toJSON(), scale: content.dataset.scoreContentScale,
                backing: [w, h], ui: window.__ra2debug.uiArt.metrics(),
                samples: [[.03, .1], [.97, .1], [.03, .9], [.97, .9]].map(([x, y]) =>
                    [...context.getImageData(Math.floor(x * w), Math.floor(y * h), 1, 1).data]) };
        });
        assert.equal(state.backdrop, expected); assert.equal(state.scale, '0.78');
        assert(state.backing[0] * state.backing[1] <= 1700000);
        assert(state.canvas.width > state.root.width * .95 && state.canvas.height > state.root.height * .95);
        assert(Math.abs(state.content.width / state.content.height - 632 / 568) < .0001);
        assert(state.samples.every(pixel => pixel[3] === 255));
        assert.equal(state.ui.budget, 16 * 1024 * 1024);
        assert(state.ui.reservedBytes <= state.ui.budget);
        assert.equal(state.ui.domImageGpuBytesUpperBound, 6800000);
        await page.screenshot({ path: path.join(out, 'native-score-layout-' + name + '.png') });
        layouts.push({ name, ...state });
    }
    const frames = await page.evaluate(async () => {
        const canvas = document.querySelector('[data-campaign-score=retail] canvas'), seen = new Set();
        const started = performance.now();
        while (seen.size < 44 && performance.now() - started < 8000) {
            seen.add(Number(canvas.dataset.emblemFrame));
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        return [...seen].sort((a, b) => a - b);
    });
    assert.deepEqual(frames, Array.from({ length: 44 }, (_, index) => index));
    await browserWindow.evaluate(window => { window.setFullScreen(false); window.unmaximize(); window.setContentSize(1280, 928); });
    return { status: 'PASS_NATIVE_FULL_AREA_FACTION_SCORE_LAYOUT_AND_ANIMATION', layouts, frames };
}

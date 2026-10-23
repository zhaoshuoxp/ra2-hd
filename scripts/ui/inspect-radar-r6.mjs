import path from 'node:path';
import assert from 'node:assert/strict';

export async function inspectRadarR6(page, out, name) {
    await page.locator('[data-radar-footage=retail]').waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: /Skirmish|遭遇战/, exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const layers = await page.locator('.hd-menu-scene svg').evaluate(svg => ({
        ellipses: svg.querySelectorAll('ellipse').length,
        thinGrids: svg.querySelectorAll('g[stroke]').length,
        images: [...svg.querySelectorAll('image')].map(i => i.getAttribute('href')),
        preserveAspectRatio: svg.getAttribute('preserveAspectRatio'),
    }));
    assert.equal(layers.ellipses, 0, 'The added elliptical rings must be removed');
    assert.equal(layers.thinGrids, 0, 'The duplicate grid and ticks must be removed together');
    assert.equal(layers.preserveAspectRatio, 'xMidYMid slice');
    const samples = [];
    for (const time of [.9, 9.9, 22.2]) {
        samples.push(await page.locator('[data-retail-menu-video]').evaluate(async (video, time) => {
            video.pause(); await new Promise(resolve => {
                video.addEventListener('seeked', resolve, { once: true }); video.currentTime = time;
            });
            return { time: video.currentTime, width: video.videoWidth, height: video.videoHeight, source: video.currentSrc };
        }, time));
        await page.screenshot({ path: path.join(out, `${name}-home-${time}.png`) });
    }
    await page.locator('[data-retail-menu-video]').evaluate(video => { void video.play(); });
    return { layers, samples };
}

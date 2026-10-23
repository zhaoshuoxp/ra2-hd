import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const [reviewArg, outputArg] = process.argv.slice(2);
const review = path.resolve(reviewArg), output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: false });
const browser = await chromium.launch({ headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const report = { status: 'RUNNING', review, errors: [], externalRequests: [], rasters: [] };
page.on('pageerror', error => report.errors.push(error.stack));
page.on('request', request => { if (/^https?:/i.test(request.url())) report.externalRequests.push(request.url()); });
try {
    await page.goto(pathToFileURL(review).href, { waitUntil: 'load' });
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
    await page.selectOption('#language', 'all');
    report.layout = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        return { duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
            images: document.images.length, externalImages: [...document.images].filter(image => !image.src.startsWith('data:')).length,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            glyphs: [...document.querySelectorAll('.current text')].map(text => {
                const box = text.getBBox(), previous = text.closest('article').querySelector('.previous text').getBBox();
                return { text: text.textContent, x: box.x, y: box.y, right: box.x + box.width, bottom: box.y + box.height,
                    preserveFace: ['retail-gold-r3', 'retail-gold-r4', 'retail-gold-r5'].includes(text.closest('svg').dataset.resultLettering),
                    geometryMatchesPrevious: box.x === previous.x && box.y === previous.y && box.width === previous.width && box.height === previous.height };
            }) };
    });
    assert.equal(report.layout.externalImages, 0); assert.deepEqual(report.layout.duplicateIds, []);
    assert(!report.layout.horizontalOverflow); assert.equal(report.layout.glyphs.length, 12);
    assert(report.layout.glyphs.every(box => box.x >= 0 && box.y >= 0 && box.right <= 436 && box.bottom <= 112));
    assert(report.layout.glyphs.every(box => !box.preserveFace || box.geometryMatchesPrevious), 'The outline/shadow correction must preserve glyph geometry');
    for (const density of [2, 4]) {
        const rows = await page.evaluate(async density => {
            const render = async (source, shadow) => {
                const svg = source.cloneNode(true);
                svg.removeAttribute('style'); svg.setAttribute('width', String(436 * density)); svg.setAttribute('height', String(112 * density));
                if (!shadow) {
                    svg.querySelector('text').removeAttribute('filter');
                    svg.querySelectorAll('filter').forEach(filter => filter.remove());
                }
                const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
                try {
                    const image = new Image(); image.src = url; await image.decode();
                    const canvas = document.createElement('canvas'); canvas.width = 436 * density; canvas.height = 112 * density;
                    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, canvas.width, canvas.height);
                    return { png: canvas.toDataURL(), pixels: context.getImageData(0, 0, canvas.width, canvas.height).data };
                } finally { URL.revokeObjectURL(url); }
            };
            const rows = [];
            for (const banner of document.querySelectorAll('.current')) {
                const svg = banner.querySelector('svg'), withShadow = await render(svg, true), withoutShadow = await render(svg, false);
                const previousSvg = banner.closest('article').querySelector('.previous svg');
                const previous = await render(previousSvg, false), previousShadow = await render(previousSvg, true);
                const width = 436 * density, gold = [];
                let shadowPixels = 0, shadowLightness = 0, opaqueShadowPixels = 0, previousGoldPixels = 0;
                let shadowAlpha = 0, previousShadowAlpha = 0, previousShadowPixels = 0, facePixelDifferences = 0;
                let faceMaxChannelDifference = 0;
                let shadowDarkness = 0, previousShadowDarkness = 0;
                for (let index = 0; index < withShadow.pixels.length; index += 4) {
                    const [red, green, blue, alpha] = withShadow.pixels.slice(index, index + 4);
                    if (red > 210 && green > 80 && blue < 205 && alpha > 220) gold.push({ y: Math.floor(index / 4 / width), green });
                    const added = Math.max(0, alpha - withoutShadow.pixels[index + 3]);
                    const previousAdded = Math.max(0, previousShadow.pixels[index + 3] - previous.pixels[index + 3]);
                    shadowAlpha += added / 255; previousShadowAlpha += previousAdded / 255;
                    shadowDarkness += added / 255 * (1 - (red + green + blue) / 765);
                    previousShadowDarkness += previousAdded / 255 * (1 - (
                        previousShadow.pixels[index] + previousShadow.pixels[index + 1] + previousShadow.pixels[index + 2]) / 765);
                    if (added > 40) shadowPixels++;
                    if (previousAdded > 40) previousShadowPixels++;
                    if (withoutShadow.pixels.slice(index, index + 4).some((channel, offset) => channel !== previous.pixels[index + offset])) facePixelDifferences++;
                    for (let channel = 0; channel < 4; channel++) faceMaxChannelDifference = Math.max(faceMaxChannelDifference,
                        Math.abs(withoutShadow.pixels[index + channel] - previous.pixels[index + channel]));
                    if (alpha > 220 && withoutShadow.pixels[index + 3] === 0) {
                        shadowLightness += (red + green + blue) / 3; opaqueShadowPixels++;
                    }
                    const [pr, pg, pb, pa] = previous.pixels.slice(index, index + 4);
                    if (pr > 210 && pg > 80 && pb < 205 && pa > 220) previousGoldPixels++;
                }
                const top = Math.min(...gold.map(pixel => pixel.y)), bottom = Math.max(...gold.map(pixel => pixel.y));
                const average = values => values.reduce((sum, pixel) => sum + pixel.green, 0) / values.length;
                const topGreen = average(gold.filter(pixel => pixel.y < top + (bottom - top) * .25));
                const bottomGreen = average(gold.filter(pixel => pixel.y > bottom - (bottom - top) * .25));
                rows.push({ language: banner.closest('article').dataset.language, slot: Number(banner.dataset.slot), density,
                    width, height: 112 * density, topGreen, bottomGreen, shadowPixels,
                    preserveFace: ['retail-gold-r3', 'retail-gold-r4', 'retail-gold-r5'].includes(svg.dataset.resultLettering),
                    shadowCorrection: ['retail-gold-r4', 'retail-gold-r5'].includes(svg.dataset.resultLettering),
                    revision: svg.dataset.resultLettering,
                    shadowLightness: shadowLightness / opaqueShadowPixels,
                    shadowAlpha, previousShadowAlpha, previousShadowPixels, shadowDarkness, previousShadowDarkness, facePixelDifferences, faceMaxChannelDifference,
                    goldPixels: gold.length, previousGoldPixels, png: withShadow.png });
            }
            return rows;
        }, density);
        for (const row of rows) {
            report.checkingRaster = { ...row, png: undefined };
            assert(row.goldPixels > 100 * density ** 2);
            assert(row.topGreen > row.bottomGreen + 45, 'The source-like yellow-to-orange change must survive rasterization');
            assert(row.shadowPixels > 30 * density ** 2, 'The lower-right shadow must remain visible outside the text face');
            if (row.shadowCorrection) {
                assert(row.shadowLightness > 60 && row.shadowLightness < 115, 'The wider shadow must be dark gray without returning to near-black');
                assert.equal(row.facePixelDifferences, 0, 'Strengthening the shadow must leave the complete face and thin edge unchanged');
                const furtherIncrease = row.revision === 'retail-gold-r5';
                assert(row.shadowPixels > row.previousShadowPixels * (furtherIncrease ? 1.2 : 1.4), 'The visible shadow footprint must expand beyond the preceding revision');
                assert(row.shadowAlpha > row.previousShadowAlpha * (furtherIncrease ? 1.15 : 1.2), 'The wider shadow must add opacity beyond the preceding revision');
                assert(row.shadowDarkness > row.previousShadowDarkness * (furtherIncrease ? 1.3 : 1.5), 'The external shadow must be stronger than the preceding revision');
            } else assert(row.shadowLightness > 100 && row.shadowLightness < 155, 'The original uses a medium-gray shadow, not black');
            if (!row.preserveFace) assert(row.goldPixels < row.previousGoldPixels * .93,
                'The glyph face must be lighter than the rejected bold treatment');
            const file = `${row.language}-slot${row.slot}-${density}x-lettering.png`;
            await fs.writeFile(path.join(output, file), Buffer.from(row.png.split(',')[1], 'base64'));
            delete row.png; report.rasters.push({ ...row, file });
        }
    }
    delete report.checkingRaster;
    for (const language of ['zh-CN', 'zh-TW', 'en-US']) {
        await page.selectOption('#language', language);
        assert.equal(await page.locator('article:visible').count(), 4);
        await page.locator('article:visible').nth(2).screenshot({ path: path.join(output, `${language}-skirmish-comparison.png`) });
    }
    await page.selectOption('#language', 'zh-CN');
    await page.screenshot({ path: path.join(output, 'review-first-page.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
    report.status = 'PASS_12_LOCALIZED_SLOTS_2X_4X_VERTICAL_GRADIENT_SHADOW_AND_OFFLINE_REVIEW';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1; console.error(error); }
finally { await browser.close(); }
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, rasterCases: report.rasters.length }));

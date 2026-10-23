// Inspect a self-contained review page without changing a game or shared profile.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const review = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const executablePath = process.argv[4];
const expectedImages = Number(process.argv[5] ?? 12);
await fs.mkdir(output, { recursive: false });
const temp = path.join(output, 'temp');
await fs.mkdir(temp);
const errors = [], externalRequests = [];
const context = await chromium.launchPersistentContext(path.join(output, 'profile'), {
    executablePath, headless: true, viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2,
    env: { ...process.env, TMPDIR: temp },
});
try {
    await context.route('**/*', route => {
        const url = route.request().url();
        if (/^https?:/.test(url)) { externalRequests.push(url); return route.abort(); }
        return route.continue();
    });
    const page = context.pages()[0];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(review).href, { waitUntil: 'load' });
    const images = await page.locator('img').evaluateAll(images => images.map(image => {
        const bounds = image.getBoundingClientRect();
        return { alt: image.alt, complete: image.complete, naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight, width: bounds.width, height: bounds.height,
            embedded: image.src.startsWith('data:image/png;base64,') };
    }));
    if (images.length !== expectedImages || images.some(image => !image.complete || !image.embedded || !image.naturalWidth)) {
        throw Error('Review has missing, broken or external images');
    }
    const native = await page.locator('.cameo').evaluateAll(images => images.map(image => ({
        width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height,
    })));
    if (native.some(image => image.width !== 60 || image.height !== 48)) throw Error('Native logical preview size changed');
    await page.screenshot({ path: path.join(output, 'native-size.png'), fullPage: true });
    await page.getByRole('button', { name: '4x inspection', exact: true }).click();
    const scaled = await page.locator('.cameo').evaluateAll(images => images.map(image => ({
        width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height,
    })));
    if (scaled.some(image => image.width !== 240 || image.height !== 192)) throw Error('Inspection scale failed');
    const rankBoxes = await page.locator('.rank-box').evaluateAll(boxes => boxes.map(box => {
        const bounds = box.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
    }));
    if (rankBoxes.some(box => box.width !== 240 || box.height !== 192)) throw Error('Rank container scale failed');
    await page.screenshot({ path: path.join(output, 'inspection-size.png'), fullPage: true });
    if (errors.length || externalRequests.length) throw Error('Review is not isolated or has page errors');
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ status: 'PASS_EMBEDDED_REVIEW_ONLY',
        review, images, scaled, errors, externalRequests, renderer: 'macOS Chromium', gameRuntime: 'NOT_RUN',
        humanAcceptance: 'PENDING', uiDensityPath: 'EXPORT_PREVIEW_ONLY' }, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'PASS_EMBEDDED_REVIEW_ONLY', images: images.length, externalRequests: 0 }));
} finally {
    await context.close();
}

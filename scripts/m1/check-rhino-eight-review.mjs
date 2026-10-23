import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(process.argv[2]);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    const checks = [];
    for (const width of [1440, 600]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2, javaScriptEnabled: false });
        const page = await context.newPage(), external = [];
        page.on('request', req => { if (/^https?:/.test(req.url())) external.push(req.url()); });
        await page.goto('file://' + root + '/review.html');
        await page.locator('details').evaluateAll(nodes => nodes.forEach(n => n.open = true));
        const images = await page.locator('img').evaluateAll(imgs => imgs.map(i => ({ width: i.width, height: i.height,
            actualWidth: i.getBoundingClientRect().width, naturalWidth: i.naturalWidth, loaded: i.complete })));
        assert.equal(images.length, 304);
        images.forEach((i,index) => {
            const expected = index < 64 ? [150,110] : [300,220];
            assert.equal(i.width, expected[0]); assert.equal(i.height, expected[1]);
            assert.equal(i.actualWidth, expected[0]); assert(i.loaded && i.naturalWidth >= expected[0]);
        });
        for (const href of await page.locator('a').evaluateAll(a => a.map(a => a.getAttribute('href')))) await fs.access(path.resolve(root, href));
        const video = await page.locator('video').evaluate(v => ({ width: v.videoWidth, height: v.videoHeight, cssWidth: v.getBoundingClientRect().width }));
        assert.deepEqual(video, { width:640,height:360,cssWidth:640 });
        assert.deepEqual(external, []); checks.push({width,images:images.length,video,status:'PASS'}); await context.close();
    }
    // Inspect actual video frames without rescaling; preserve the encoded recording separately.
    const page = await browser.newPage(); await page.goto('file://' + root + '/review.html');
    // file: media has an opaque origin. Decode the same local bytes through an
    // in-document Blob for frame inspection, without disabling browser security.
    const encoded = (await fs.readFile(`${root}/motion-native.webm`)).toString('base64');
    await page.locator('video').evaluate((v, encoded) => {
        const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
        v.src = URL.createObjectURL(new Blob([bytes], {type:'video/webm'})); v.preload = 'auto'; v.load();
    }, encoded);
    await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
    const frames = [];
    for (const seconds of [1,3,5]) {
        const frame = await page.locator('video').evaluate(async (v,seconds) => {
            await new Promise(resolve=>{v.onseeked=resolve;v.currentTime=seconds;});
            const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;
            c.getContext('2d').drawImage(v,0,0);return c.toDataURL();
        },seconds);
        const name=`motion-frame-${seconds}s.png`; await fs.writeFile(`${root}/${name}`,Buffer.from(frame.split(',')[1],'base64'));frames.push(name);
    }
    await fs.writeFile(`${root}/page-check.json`,JSON.stringify({status:'PASS',checks,frames},null,2)+'\n');
    console.log('PASS: 304 native-size images, same-size 640x360 movement video, wide/narrow layout, all links and no external requests.');
} finally { await browser.close(); }

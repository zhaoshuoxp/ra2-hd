// Check delivered atlas buffers and controls in an owned offline Chrome instance.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(process.argv[2]);
const feedback = process.argv.includes('--feedback');
const incremental = process.argv.includes('--incremental');
const receipt = incremental ? JSON.parse(await fs.readFile(path.join(root, 'review-receipt.json'))) : undefined;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
    const errors = [], network = [];
    page.on('pageerror', error => errors.push(error.stack));
    page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    await page.goto('file://' + path.join(root, 'Yuri-Buildings-Final-Review.html'), { timeout: 120000 });
    const ready = () => page.waitForFunction(() => document.body.dataset.ready === 'true', undefined, { timeout: 45000 });
    await ready();
    const keys = await page.locator('#family option').evaluateAll(nodes => nodes.map(n => n.value));
    assert.equal(keys.length, incremental ? receipt.theaterSelections : feedback ? 7 : 33);
    const checks = [];
    for (const key of keys) {
        await page.selectOption('#family', key); await ready();
        const sample = await page.evaluate(() => {
            const entry = window.__review.current();
            return { key: entry.key, canvas: entry.canvas, stateCount: entry.states.length,
                buffers: [2, 4].map(d => { const c = document.getElementById('canvas-' + d);
                    return { density: d, width: c.width, height: c.height, css: [parseFloat(c.style.width), parseFloat(c.style.height)] }; }),
                error: document.getElementById('error').textContent };
        });
        assert.equal(sample.error, '');
        for (const b of sample.buffers) {
            assert.deepEqual([b.width, b.height], sample.canvas.map(n => n * b.density));
            assert.deepEqual(b.css, sample.canvas);
        }
        checks.push(sample);
    }
    const special = [];
    const targeted = feedback ? [['YAPPET', 'SUPER'], ['YAPPET', 'BUILDUP'], ['YAGNTC', 'SUPER'], ['NATBNK', 'bib']]
        : [['YAGRND', 'SPECIAL'], ['NAPSIS', 'BUILDUP'], ['YAPPET', 'SUPER'],
            ['YAWEAP', 'FACTORY_DEPLOYING'], ['YAGGUN', 'turret'], ['YAREFN', 'turret']];
    for (const [family, type] of targeted) {
        const selection = await page.evaluate(({ family, type }) => {
            const entry = window.__review.payload.families.find(e => e.name === family && e.theater === 'TEMPERATE');
            const bib = entry.rest.find(s => s.type === 'bib');
            const index = entry.states.findIndex(s => (type === 'bib' ? s.type === 'member' && s.member === bib.member
                : s.type === type && !s.damaged && (type !== 'SUPER' || s.frames.length > 1)));
            if (index < 0) throw Error('Missing state ' + family + '/' + type);
            return { key: entry.key, index, frames: entry.states[index].frames.length };
        }, { family, type });
        await page.selectOption('#family', selection.key); await ready();
        await page.selectOption('#state', String(selection.index)); await ready();
        await page.selectOption('#view', 'buffer'); await page.selectOption('#owner', 'green'); await ready();
        const before = await page.locator('#canvas-4').evaluate(c => ({ size: [c.width, c.height], css: [parseFloat(c.style.width), parseFloat(c.style.height)], png: c.toDataURL() }));
        assert.deepEqual(before.size, before.css);
        await page.selectOption('#owner', 'blue'); await ready();
        const after = await page.locator('#canvas-4').evaluate(c => ({ size: [c.width, c.height], png: c.toDataURL() }));
        assert.deepEqual(before.size, after.size);
        if (family !== 'YAREFN') assert.notEqual(before.png, after.png, family + ' owner-bearing state');
        await page.locator('#play').click();
        if (selection.frames > 1) await page.waitForFunction(() => Number(document.getElementById('frame').value) > 0, undefined, { timeout: 15000 });
        else await page.waitForTimeout(400);
        await page.locator('#play').click(); await ready();
        const playback = await page.locator('#canvas-4').evaluate(c => [c.width, c.height]);
        assert.deepEqual(playback, before.size);
        console.log('Verified', family, type, selection.frames, 'slots');
        special.push({ family, type, frames: selection.frames, buffer: playback, ownerChanged: before.png !== after.png });
        await page.selectOption('#view', 'logical'); await ready();
        if (['YAGRND', 'YAPPET', 'YAGGUN'].includes(family)) await page.screenshot({ path: path.join(root, family + '-controls.png') });
    }
    await page.selectOption('#family', keys[0]); await page.selectOption('#owner', 'green'); await ready();
    await page.screenshot({ path: path.join(root, 'html-desktop.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(errors.length, 0); assert.equal(network.length, 0);
    const result = { status: 'PASS_OFFLINE_FULL_STATE_REVIEW', theaterSelections: keys.length, checks,
        distinctiveStates: special, errors, externalRequests: network,
        boundary: 'All selected entry normal buffers plus representative state/heading playback and owner controls; native gameplay is separately evidenced.' };
    await fs.writeFile(path.join(root, 'browser-check.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(result.status, keys.length, 'entries;', special.length, 'distinctive states');
} finally { await browser.close(); }

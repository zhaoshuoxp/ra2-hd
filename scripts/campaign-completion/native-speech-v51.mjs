import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Fresh original Training01 with actual source speech during realtime simulation. Observe the visible subtitle and authentic VOX translation, without inserting a speech event or changing rules, source triggers or objectives.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    await page.evaluate(() => {
        window.__observedOriginalSpeech = [];
        new MutationObserver(() => {
            const d = window.__ra2debug, node = document.querySelector('[data-campaign-subtitle]'), q = d.gameScreen?.campaignSpeech;
            if (!node?.textContent || node.hidden || !q?.current) return;
            const id = q.current.id, spec = q.specs.getSpec(id), key = 'VOX:' + spec.sound;
            const value = { id, text: node.textContent, translated: q.strings.has(key) ? q.strings.get(key) : undefined,
                tick: d.game.currentTick, language: document.documentElement.lang };
            if (window.__observedOriginalSpeech.at(-1)?.text !== value.text) window.__observedOriginalSpeech.push(value);
        }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
    });
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('trn01t.map'));
    await waitWorld(page, 'trn01t.map');
    await page.evaluate(() => { const m = window.__ra2debug.gameScreen.gameTurnMgr; m.setPaused(false); m.setCampaignPaused(false); });
    await page.waitForFunction(() => window.__observedOriginalSpeech.some(value => /[\u3400-\u9fff]/.test(value.text)), undefined, { timeout: 20000 });
    report.subtitles = await page.evaluate(() => window.__observedOriginalSpeech);
    assert(report.subtitles.some(value => value.text === value.translated && /[\u3400-\u9fff]/.test(value.text)));
    await page.screenshot({ path: path.join(out, 'native-source-training-chinese-subtitle.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_ORIGINAL_SPEECH_WITH_AUTHENTIC_VISIBLE_CHINESE_SUBTITLE';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));

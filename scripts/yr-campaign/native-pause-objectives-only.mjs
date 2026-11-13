import assert from 'node:assert/strict';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov01umd.map');
let failure;
try {
    await pilot.open();
    const source = await pilot.page.evaluate(() => {
        const d = window.__ra2debug, c = d.game.campaign;
        const briefing = c.definition.ini.getSection('Basic').getString('Briefing');
        return { briefing, traceMessages: c.trace.filter(entry => entry.opcode === 11).length,
            hash: d.game.getHash(), tick: d.game.currentTick };
    });
    await pilot.page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await pilot.page.locator('[data-campaign-objectives]').waitFor();
    const text = await pilot.page.locator('[data-campaign-objectives] > div').innerText();
    assert(text.trim().length > 0);
    const current = await pilot.page.evaluate(() => ({ hash: window.__ra2debug.game.getHash(),
        tick: window.__ra2debug.game.currentTick,
        text: window.__ra2debug.gameScreen.menu.campaignOperations?.briefing?.() }));
    assert.equal(current.hash, source.hash); assert.equal(current.tick, source.tick);
    if (current.text) assert.equal(text.trim(), current.text.trim());
    pilot.report.pauseObjectives = { source, text, simulationUnchanged: true };
    await pilot.page.screenshot({ path: path.join(pilot.out, 'native-pause-objectives-only.png') });
    pilot.report.status = 'PASS_NATIVE_CAMPAIGN_PAUSE_OBJECTIVES_WITHOUT_MESSAGE_HISTORY';
} catch (error) { failure = error; }
await pilot.finish(failure);

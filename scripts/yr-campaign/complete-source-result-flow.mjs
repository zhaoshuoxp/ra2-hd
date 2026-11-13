import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function completeSourceResultFlow(page, out, report) {
    const journal = await page.evaluate(() => {
        const g = window.__ra2debug.game;
        if (!['victory', 'defeat'].includes(g.campaign.result)) throw Error('Original source result is required');
        return { gameId: g.id, timestamp: g.startTimestamp, tick: g.currentTick,
            launch: g.campaign.launch, commands: g.campaign.journal.commands };
    });
    const file = path.join(out, 'source-result-journal.json');
    await fs.writeFile(file, JSON.stringify(journal) + '\n', { flag: 'wx' });
    report.sourceResultJournal = { file, tick: journal.tick, commands: journal.commands.length,
        semanticsVersion: journal.launch.semanticsVersion };
    report.resultDispatch = await page.evaluate(() => {
        const d = window.__ra2debug, manager = d.gameScreen.gameTurnMgr;
        const before = { tick: d.game.currentTick, result: d.game.campaign.result };
        if (!['victory', 'defeat'].includes(before.result)) throw Error('Original source result is required');
        manager.setPaused(false); manager.setCampaignPaused(false); manager.doGameTurn(performance.now());
        return { before, after: { tick: d.game.currentTick, result: d.game.campaign.result } };
    });
    const result = report.resultDispatch.before.result;
    assert.equal(report.resultDispatch.after.result, result);
    await page.waitForSelector(`[data-campaign-result="${result}"][data-score-phase="complete"]`, { timeout: 300000 });
    await page.screenshot({ path: path.join(out, 'native-original-result-score.png') });
    report.naturalResultMediaAndScoreReached = true;
}

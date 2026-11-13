import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, stepWorld, worldState } from '../m3-2/native-session.mjs';
import { replaySourcePrefix } from './replay-source.mjs';

const [outArg, sourceArg, prefix, targetTickArg, unitName, trigger] = process.argv.slice(2);
const out = path.resolve(outArg), directory = path.resolve(sourceArg);
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
const targetTick = Number(targetTickArg); assert(Number.isSafeInteger(targetTick));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Actual original Flash Team action and live renderer response. An exact earlier source prefix reconstructs with presentation suppressed only there. Subsequent original triggers execute normally, without injected flash or altered source. A read-only wrapper counts actual highlight calls and samples native animation values; audio/UI observation must not advance simulation or RNG. This is presentation evidence, not a separate goal or new-art acceptance.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    report.replay = await replaySourcePrefix(page, source, prefix);
    assert(source.appliedCommands.every(command => command.tick < report.replay.tick || command.tick >= targetTick),
        'This presentation observer requires an original interval with no human commands');
    await stepWorld(page, targetTick - report.replay.tick);
    report.source = await page.evaluate(({ unitName, trigger }) => {
        const d = window.__ra2debug, g = d.game, unit = g.localPlayer.getOwnedObjects().find(object => object.name === unitName);
        const renderable = d.renderableManager.getRenderableByGameObject(unit), highlight = renderable.highlight;
        window.__sourceHighlightCalls = 0;
        renderable.highlight = function(...args) { window.__sourceHighlightCalls++; return highlight.apply(this, args); };
        d.gameScreen.playerUi.worldInteraction.minimapHandler.panToTile(unit.tile);
        return { tick: g.currentTick, id: unit.id, flashUntil: unit.campaignFlashUntil,
            actions: g.campaign.trace.filter(action => action.key === trigger),
            hd: !!renderable.shpRenderable?.builder?.getHdPage?.() };
    }, { unitName, trigger });
    assert(report.source.flashUntil > targetTick); assert(report.source.actions.some(action => action.opcode === 104));
    const before = await worldState(page); report.frames = [];
    for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(100);
        report.frames.push(await page.evaluate(id => {
            const d = window.__ra2debug, unit = d.game.world.getAllObjects().find(object => object.id === id);
            const r = d.renderableManager.getRenderableByGameObject(unit);
            return { calls: window.__sourceHighlightCalls, value: r.highlightAnimRunner.getValue(),
                light: [r.extraLight.r, r.extraLight.g, r.extraLight.b] };
        }, report.source.id));
    }
    assert.deepEqual(await worldState(page), before);
    assert(report.frames.some(frame => frame.calls > 0 && frame.value > 0));
    await page.screenshot({ path: path.join(out, 'native-actual-source-team-flash.png') });
    await stepWorld(page, report.source.flashUntil - targetTick + 1); await page.waitForTimeout(500);
    const count = await page.evaluate(() => window.__sourceHighlightCalls); await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__sourceHighlightCalls), count);
    report.expired = { tick: await page.evaluate(() => window.__ra2debug.game.currentTick), furtherHighlightCalls: 0 };
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ACTUAL_SOURCE_TEAM_FLASH_RENDERER_AND_TICK_EXPIRY';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));

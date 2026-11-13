import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { waitWorld, worldState, stepWorld } from '../m3-2/native-session.mjs';
import { closeCampaignMenuPaused } from '../campaign-completion/named-save-restart.mjs';

// Restore only a verified ordinary-input journal; source actors arrive through
// their original team/trigger behavior and keep the original simulation state.
export async function openNpcSource(page, out, report, mission, identity) {
    const checkpointFile = process.argv.find(value => value.startsWith('--checkpoint='))?.slice(13);
    if (checkpointFile) {
        const checkpoint = JSON.parse(await fs.readFile(checkpointFile));
        assert.equal(checkpoint.identity.edition, 'yr'); assert.equal(checkpoint.identity.mission, mission);
        report.sourceCheckpoint = { file: path.resolve(checkpointFile), tick: checkpoint.tick, checksum: checkpoint.checksum };
        await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22)
            .launchDiagnostic(checkpoint, checkpoint.identity.mission), checkpoint);
        const progress = setInterval(async () => {
            const state = await page.evaluate(() => window.__ra2debug?.campaignRestore).catch(() => undefined);
            if (state) await fs.writeFile(path.join(out, 'restore-progress.json'), JSON.stringify(state, null, 2)+'\n');
        }, 5000);
        try {
            await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
                && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 600000 });
        } finally { clearInterval(progress); }
        report.restored = await worldState(page);
        assert.deepEqual({ worldHash: report.restored.hash, rng: report.restored.rng, mission: report.restored.mission,
            world: report.restored.world, pendingCallbacks: report.restored.pendingCallbacks }, checkpoint.expected);
        await closeCampaignMenuPaused(page);
    } else {
        await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22)
            .launchDiagnostic(undefined, mission), mission);
        await waitWorld(page, mission);
    }
    const arrivalTicks = Number(process.argv.find(value => value.startsWith('--arrival-ticks='))?.slice(16) ?? 0);
    assert(Number.isSafeInteger(arrivalTicks) && arrivalTicks >= 0 && arrivalTicks <= 3600);
    if (arrivalTicks) {
        const begin = await page.evaluate(() => window.__ra2debug.game.currentTick);
        report.sourceArrival = { identity, maximumOriginalTicks: arrivalTicks, observations: [] };
        for (;;) {
            const state = await page.evaluate(identity => {
                const g = window.__ra2debug.game;
                const actors = g.world.getAllObjects().filter(actor => actor.name === identity && !actor.isDestroyed);
                return { tick: g.currentTick, actors: actors.map(actor => ({ id: actor.id,
                    spawned: actor.isSpawned, tile: actor.tile && [actor.tile.rx, actor.tile.ry] })) };
            }, identity);
            report.sourceArrival.observations.push(state);
            if (state.actors.some(actor => actor.spawned) || state.tick >= begin+arrivalTicks) break;
            await stepWorld(page, Math.min(15, begin+arrivalTicks-state.tick));
        }
    }
    if (process.argv.includes('--capture-source-arrival')) {
        assert(arrivalTicks > 0);
        const checkpoint = await page.evaluate(identity => {
            const g = window.__ra2debug.game;
            if (g.campaign.inspectionModified || g.campaign.failure || g.campaign.result)
                throw Error('Only an unmodified ordinary source arrival can supply a trusted checkpoint');
            if (!g.world.getAllObjects().some(actor => actor.name === identity && actor.isSpawned && !actor.isDestroyed))
                throw Error('The original source NPC has not arrived');
            return g.campaign.journal.capture(g);
        }, identity);
        const file = path.join(out, 'original-source-arrival-checkpoint.json');
        await fs.writeFile(file, JSON.stringify(checkpoint)+'\n', { flag: 'wx' });
        report.originalArrivalCheckpoint = { file, tick: checkpoint.tick, checksum: checkpoint.checksum };
    }
}

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { waitWorld } from '../m3-2/native-session.mjs';

export async function readFeedbackSource(directory) {
    if ((await fs.stat(directory)).isFile()) {
        const fixture = JSON.parse(await fs.readFile(directory));
        assert.equal(fixture.schema, 'original-campaign-ordinary-command-fixture-v1');
        assert(fixture.identity.launch.sourceSha256 && fixture.appliedCommands.length > 0);
        return fixture;
    }
    const report = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
    return { ...report, appliedCommands: JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json'))) };
}

export async function replayFeedbackOpening(page, source, tick, policy = {}) {
    await page.evaluate(async ({ identity, policy }) => {
        const screen = window.__ra2debug.mainMenuController.screens.get(22), controller = screen.rootController;
        const gameScreen = controller.screens.get(1), start = gameScreen.onGameStart;
        gameScreen.onGameStart = function(...args) {
            gameScreen.onGameStart = start; start.apply(this, args);
            this.gameTurnMgr.setPaused(true); this.gameTurnMgr.setCampaignPaused(true);
        };
        const launch = controller.goToScreen;
        controller.goToScreen = function(type, params) {
            controller.goToScreen = launch;
            return launch.call(this, type, { ...params, gameId: identity.gameId, timestamp: identity.timestamp,
                gameOpts: { ...params.gameOpts, campaign: { ...identity.launch, ...policy }, gameSpeed: 0 } });
        };
        screen.difficulty = identity.launch.difficulty; await screen.launchPrepared(identity.launch.mission);
    }, { identity: source.identity, policy });
    await waitWorld(page, source.identity.launch.mission);
    await page.evaluate(commands => {
        const game = window.__ra2debug.game; game.campaign.restoring = true;
        window.__feedbackSourceCommands = new Map();
        for (const command of commands) {
            const batch = window.__feedbackSourceCommands.get(command.tick) ?? [];
            batch.push(command); window.__feedbackSourceCommands.set(command.tick, batch);
        }
    }, source.appliedCommands);
    const state = await advanceFeedbackSource(page, tick);
    await page.evaluate(() => { const c = window.__ra2debug.game.campaign; c.restoring = false; c.particles.showRestored(); });
    const sample = source.samples.find(s => s.tick === tick);
    if (sample) assert.equal(state.hash, sample.hash, 'Original recorded boundary must reconstruct exactly');
    return { ...state, matchedRecordedBoundary: !!sample, policy,
        method: 'Fresh source initial world, original creation seed and ordinary serialized player commands. Earlier presentation suppressed during accelerated reconstruction; no hidden save, changed source/rules/health/objectives or post-creation RNG edit.' };
}

export async function advanceFeedbackSource(page, tick) {
    let state;
    do {
        state = await page.evaluate(tick => {
            const d = window.__ra2debug, g = d.game;
            for (let i = 0; i < 240 && g.currentTick < tick && !g.campaign.failure && !g.campaign.result; i++) {
                for (const command of window.__feedbackSourceCommands.get(g.currentTick) ?? []) {
                    const action = d.actionFactory.create(command.type); action.unserialize(new Uint8Array(command.data));
                    action.player = g.getPlayer(command.player); g.campaign.journal.record(g, action.player, [action]); action.process();
                }
                g.update();
            }
            return { tick: g.currentTick, hash: g.getHash(), result: g.campaign.result, failure: g.campaign.failure };
        }, tick);
        assert(!state.failure, state.failure);
        assert(!state.result || state.tick === tick, JSON.stringify(state));
    } while (state.tick < tick);
    return state;
}

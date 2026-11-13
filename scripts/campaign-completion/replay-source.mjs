import assert from 'node:assert/strict';
import { waitWorld, worldState } from '../m3-2/native-session.mjs';
import { waitForCampaignFullscreen } from './native-media-wait.mjs';

async function continueSource(page, source, label, exact) {
    const target = source.samples.findLast(sample => sample.label === label);
    const start = await page.evaluate(() => window.__ra2debug.game.currentTick);
    assert(target && start <= target.tick && source.appliedCommands.every(command => command.type !== 4));
    const paused = await page.evaluate(commands => {
        const manager = window.__ra2debug.gameScreen.gameTurnMgr, paused = manager.paused;
        // Live movie callbacks compose the product's campaign gate. Keep the
        // independent observer gate closed between manual simulation batches.
        manager.setPaused(true);
        window.__validationReplay = new Map();
        for (const command of commands) {
            const batch = window.__validationReplay.get(command.tick) ?? [];
            batch.push(command); window.__validationReplay.set(command.tick, batch);
        }
        return paused;
    }, source.appliedCommands.filter(command => command.tick >= start && command.tick < target.tick));
    let state;
    try {
        do {
            state = await page.evaluate(targetTick => {
                const d = window.__ra2debug, g = d.game;
                for (let i = 0; i < 240 && g.currentTick < targetTick && !g.campaign.failure && !g.campaign.result; i++) {
                    if ((g.campaign.launch.semanticsVersion ?? 1) >= 14
                        && g.campaign.captureMedia?.().movies.some(movie => movie.placement === 'fullscreen' || movie.placement === 'transmission-paused')) break;
                    for (const command of window.__validationReplay.get(g.currentTick) ?? []) {
                        const action = d.actionFactory.create(command.type); action.unserialize(new Uint8Array(command.data));
                        action.player = g.getPlayer(command.player); g.campaign.journal.record(g, action.player, [action]); action.process();
                    }
                    g.update();
                }
                return { tick: g.currentTick, hash: g.getHash(), failure: g.campaign.failure, result: g.campaign.result,
                    fullscreenPending: (g.campaign.launch.semanticsVersion ?? 1) >= 14
                        && g.campaign.captureMedia?.().movies.some(movie => movie.placement === 'fullscreen' || movie.placement === 'transmission-paused') };
            }, target.tick);
            assert(!state.failure && (!state.result || state.tick === target.tick && state.result === target.result), JSON.stringify(state));
            if (state.fullscreenPending && state.tick < target.tick) await waitForCampaignFullscreen(page);
        } while (state.tick < target.tick);
        if (exact) assert.equal(state.hash, target.hash);
        return { start, ...state, label, exactEarlierWorldClaimed: exact,
            ...(exact ? {} : { previousWorldHash: target.hash }),
            policy: exact
                ? 'Only the remaining recorded ordinary commands execute after exact saved-world restoration. Original source and presentation stay active.'
                : 'Only the remaining ordinary commands execute in the current interpreter world. Source presentation stays active. Previous interpreter hashes are not claimed; current state and source outcomes require independent inspection.' };
    } finally {
        await page.evaluate(paused => {
            const d = window.__ra2debug;
            if (d.game?.campaign) { d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.gameTurnMgr.setPaused(paused); }
        }, paused);
    }
}

export async function continueRecordedSource(page, source, label) { return continueSource(page, source, label, true); }
export async function continueReexecutedSource(page, source, label) { return continueSource(page, source, label, false); }

// Validation re-executes an ordinary recorded command prefix in a fresh source
// world. This helper is never used by the player-facing direct mission route.
async function executeSourcePrefix(page, source, label, exact) {
    const target = source.samples.findLast(sample => sample.label === label);
    assert(target && source.appliedCommands.every(command => command.type !== 4));
    const mission = source.identity.launch.mission;
    await page.evaluate(async ({ identity, difficulty, mission, exact }) => {
        const screen = window.__ra2debug.mainMenuController.screens.get(22), controller = screen.rootController;
        const gameScreen = controller.screens.get(1), start = gameScreen.onGameStart;
        gameScreen.onGameStart = function (...args) {
            gameScreen.onGameStart = start; start.apply(this, args); this.gameTurnMgr.setCampaignPaused(true);
        };
        const launch = controller.goToScreen;
        controller.goToScreen = function (type, params) {
            controller.goToScreen = launch;
            return launch.call(this, type, { ...params, gameId: identity.gameId, timestamp: identity.timestamp,
                gameOpts: { ...params.gameOpts, campaign: exact ? identity.launch : params.gameOpts.campaign, gameSpeed: 0 } });
        };
        screen.difficulty = difficulty; await screen.launchPrepared(mission);
    }, { identity: source.identity, difficulty: source.difficulty, mission, exact });
    await waitWorld(page, mission);
    const launch = await page.evaluate(() => window.__ra2debug.game.campaign.launch);
    assert(await page.evaluate(first => window.__ra2debug.game.currentTick <= first, source.appliedCommands[0]?.tick ?? target.tick));
    await page.evaluate(commands => {
        const byTick = window.__validationReplay = new Map();
        for (const command of commands) { const batch = byTick.get(command.tick) ?? []; batch.push(command); byTick.set(command.tick, batch); }
        window.__ra2debug.game.campaign.restoring = true;
    }, source.appliedCommands.filter(command => command.tick < target.tick));
    let current;
    do {
        current = await page.evaluate(target => {
            const d = window.__ra2debug, g = d.game;
            for (let i = 0; i < 240 && g.currentTick < target && !g.campaign.failure && !g.campaign.result; i++) {
                for (const command of window.__validationReplay.get(g.currentTick) ?? []) {
                    const action = d.actionFactory.create(command.type); action.unserialize(new Uint8Array(command.data));
                    action.player = g.getPlayer(command.player); g.campaign.journal.record(g, action.player, [action]); action.process();
                }
                g.update();
            }
            return { tick: g.currentTick, failure: g.campaign.failure, result: g.campaign.result };
        }, target.tick);
        assert(!current.failure && (!current.result || current.tick === target.tick && current.result === target.result), JSON.stringify(current));
    } while (current.tick < target.tick);
    await page.evaluate(() => {
        const campaign = window.__ra2debug.game.campaign; campaign.restoring = false; campaign.particles.showRestored();
    });
    const state = await worldState(page);
    if (exact) assert.equal(state.hash, target.hash);
    assert.equal(state.tick, target.tick);
    return { tick: state.tick, launch, ...(exact ? { matchedWorldHash: state.hash }
        : { observedWorldHash: state.hash, previousWorldHash: target.hash, exactEarlierWorldClaimed: false }), label,
        policy: exact
            ? 'Only source creation seeds and recorded ordinary commands are replayed. No hidden save, altered rule/trigger/objective, health edit or post-creation RNG mutation. Presentation is suppressed only during prefix reconstruction.'
            : 'Private interpreter development changed. The same original creation seeds and recorded ordinary commands execute in a fresh current-build world. Its state and outcomes require independent inspection; no previous-build world-hash or save-compatibility equivalence is claimed. No source/rule/trigger/health/objective or post-creation RNG edit.' };
}

export async function replaySourcePrefix(page, source, label) { return executeSourcePrefix(page, source, label, true); }
export async function reexecuteSourcePrefix(page, source, label) { return executeSourcePrefix(page, source, label, false); }

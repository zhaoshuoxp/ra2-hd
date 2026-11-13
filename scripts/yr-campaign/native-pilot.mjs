import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, worldState, stepWorld } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from '../campaign-completion/ordinary-commands.mjs';
import { closeCampaignMenuPaused, namedSaveRestart } from '../campaign-completion/named-save-restart.mjs';
import { watchNativeEvaluation } from './watch-native-evaluation.mjs';
import { waitForCampaignFullscreen } from '../campaign-completion/native-media-wait.mjs';
import { observeMissionMedia } from './observe-mission-media.mjs';
import { completeSourceResultFlow } from './complete-source-result-flow.mjs';

// All assistance enters the ordinary serialized player action queue. Source
// inspection guides navigation; targeting still observes shroud and disguise.
export class NativeCampaignPilot {
    constructor(out, mission) {
        this.out = path.resolve(out); this.mission = mission;
        this.report = { status: 'RUNNING', mission, errors: [], failedResources: [], commands: [], samples: [],
            assistance: 'Original source initialization or exact legitimate checkpoint restoration, source-guided ordinary paid production, legal placement, movement and visible-target attacks. No source, rules, actors, health, tasks, RNG, trigger conditions or results are edited.' };
        this.traceTicks = {};
        this.observeMedia = process.argv.includes('--observe-media');
    }
    get page() { return this.session.page; }
    async open() {
        await fs.mkdir(this.out, { recursive: false });
        const density = Number(process.argv.find(value => value.startsWith('--density='))?.slice(10) ?? 0);
        this.session = await campaignSession(this.out, this.report, { edition: 'yr', density });
        if (this.observeMedia) this.stopMedia = await observeMissionMedia(this.page);
        if (process.argv.includes('--trace-programs')) {
            const { observeProgramLifetime } = await import('../windows-hd/observe-program-lifetime.mjs');
            await observeProgramLifetime(this.page);
        }
        const source = process.argv.find(value => value.startsWith('--checkpoint='))?.slice(13);
        if (source) {
            const checkpoint = JSON.parse(await fs.readFile(path.resolve(source)));
            assert.equal(checkpoint.identity.edition, 'yr'); assert.equal(checkpoint.identity.mission, this.mission);
            this.report.sourceCheckpoint = source;
            await this.page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22)
                .launchDiagnostic(checkpoint, checkpoint.identity.mission), checkpoint);
            const restorePoll = setInterval(async () => {
                const observation = await this.page.evaluate(() => window.__ra2debug?.campaignRestore).catch(() => undefined);
                if (observation) await fs.writeFile(path.join(this.out, 'restore-progress.json'),
                    JSON.stringify(observation, null, 2) + '\n').catch(() => {});
            }, 5000);
            try {
                await this.page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
                    && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 600000 });
            } catch (error) {
                this.report.restoreWaitFailure = await this.page.evaluate(() => {
                    const d = window.__ra2debug, screen = d.mainMenuController?.screens.get(22);
                    return { tick: d.game?.currentTick, mission: d.game?.campaign?.launch?.mission,
                        failure: d.game?.campaign?.failure, result: d.game?.campaign?.result,
                        sourceError: screen?.error, busy: screen?.busy, restoreProgress: d.campaignRestore,
                        menu: !!d.gameScreen?.menu?.getCurrentScreen(),
                        screenKeys: d.gameScreen && Object.keys(d.gameScreen).filter(key => /campaign|restore|load|error|menu/i.test(key)),
                        visibleText: document.body.innerText.slice(-1800) };
                });
                throw error;
            } finally { clearInterval(restorePoll); }
            const restored = await worldState(this.page);
            assert.deepEqual({ worldHash: restored.hash, rng: restored.rng, mission: restored.mission,
                world: restored.world, pendingCallbacks: restored.pendingCallbacks }, checkpoint.expected);
            await closeCampaignMenuPaused(this.page);
        } else {
            const difficulty = process.argv.find(value => value.startsWith('--difficulty='))?.slice(13) ?? 'normal';
            assert(['easy', 'normal', 'hard'].includes(difficulty));
            const replayFile = process.argv.find(value => value.startsWith('--replay-commands='))?.slice(18);
            const original = replayFile && JSON.parse(await fs.readFile(path.resolve(replayFile)));
            const sourceCreation = original && { ...original.identity, gameId: original.gameId, timestamp: original.timestamp };
            if (sourceCreation) this.report.originalCreationIdentity = sourceCreation;
            this.report.entryPresentation = sourceCreation ? 'PREPARED_CURRENT_SOURCE_WITH_RECORDED_CREATION'
                : this.observeMedia ? 'ORIGINAL_OPENING_AND_FRESH_SOURCE' : 'PREPARED_FRESH_SOURCE';
            await this.page.evaluate(({ mission, difficulty, sourceCreation, originalOpening }) => {
                const screen = window.__ra2debug.mainMenuController.screens.get(22); screen.difficulty = difficulty;
                return screen.launchPrepared(mission, sourceCreation, { originalOpening });
            }, { mission: this.mission, difficulty, sourceCreation, originalOpening: this.observeMedia && !sourceCreation });
            await waitWorld(this.page, this.mission);
        }
        await this.page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
        await watchNativeEvaluation(this.session, this.out, this.report);
        this.commands = new OrdinaryCampaignCommands(this.page, this.report);
        this.report.launch = await this.page.evaluate(() => window.__ra2debug.game.campaign.launch);
        const replay = process.argv.find(value => value.startsWith('--replay-commands='))?.slice(18);
        assert(!(source && replay), 'Choose exact checkpoint restoration or fresh ordinary input replay');
        if (replay) await this.replayOrdinaryInputs(replay);
        else if (!source) await this.commands.step(900, { defend: false });
        for (let i = 0; i < 150 && await this.page.evaluate(() => window.__ra2debug.game.campaign.inputLocked); i++)
            await this.commands.step(60, { defend: false });
        return this.observe('original-unlocked-state');
    }
    async replayOrdinaryInputs(file, options = {}) {
        const bytes = await fs.readFile(path.resolve(file)), saved = JSON.parse(bytes);
        assert.equal(saved.identity.edition, 'yr'); assert.equal(saved.identity.mission, this.mission);
        assert.equal(saved.identity.sourceSha256, this.report.launch.sourceSha256);
        assert(!saved.trainer, 'Ordinary input replay excludes trainer history');
        const until = Number(options.until ?? process.argv.find(value => value.startsWith('--replay-until='))?.slice(15) ?? saved.tick);
        assert(Number.isSafeInteger(until) && until > 0 && until <= saved.tick);
        const from = await this.page.evaluate(() => window.__ra2debug.game.currentTick);
        if (options.resume) {
            const prior = this.report.ordinaryInputReplay;
            assert(prior && path.resolve(prior.file) === path.resolve(file));
            assert(this.report.restart?.exactWorldRngVariablesTeamsQueuesTimerAndCallbacks);
            assert.equal(this.report.restart.tick, prior.completedTick);
            assert.equal(from, prior.completedTick + 180);
            assert(!saved.commands.some(command => command.tick >= prior.completedTick && command.tick < from),
                'Choose an input-free named-save verification interval; never skip recorded player actions');
        } else assert.equal(from, 0, 'Ordinary input replay begins at untouched original source initialization');
        const records = saved.commands.filter(command => command.tick >= from && command.tick < until);
        await this.page.evaluate(({ records, until, resume }) => {
            const d = window.__ra2debug, g = d.game;
            if (!resume && (g.currentTick !== 0 || d.actionQueue.getAll().length))
                throw Error('Input replay requires an untouched fresh source world');
            if (records.some(command => command.player !== g.getPlayerNumber(g.localPlayer))) throw Error('Input replay requires ordinary local-player commands');
            window.__originalInputReplay = { records, until, cursor: 0 };
        }, { records, until, resume: !!options.resume });
        let final, lastObservation = from;
        while (await this.page.evaluate(until => window.__ra2debug.game.currentTick < until, until)) {
            await waitForCampaignFullscreen(this.page);
            const result = await this.page.evaluate(() => {
                const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr, replay = window.__originalInputReplay;
                const start = g.currentTick, paused = manager.paused, started = performance.now();
                if (manager.getErrorState?.()) throw Error('Native product error stopped source replay: ' + document.body.innerText.slice(-1200));
                manager.setPaused(false); manager.setCampaignPaused(false);
                try {
                    for (let i = 0; i < 90 && g.currentTick < replay.until && !g.campaign.failure && !g.campaign.result; i++) {
                        if (i && performance.now() - started >= 1000) break;
                        if (g.campaign.captureMedia?.().movies.some(movie => ['fullscreen', 'transmission-paused'].includes(movie.placement))) break;
                        if (replay.records[replay.cursor]?.tick < g.currentTick) throw Error('Ordinary input replay missed its source boundary');
                        while (replay.records[replay.cursor]?.tick === g.currentTick) {
                            const command = replay.records[replay.cursor++], action = d.actionFactory.create(command.type);
                            action.unserialize(new Uint8Array(command.data)); action.player = g.localPlayer;
                            d.actionQueue.push(action);
                        }
                        manager.doGameTurn(performance.now());
                    }
                } finally { manager.setCampaignPaused(true); manager.setPaused(paused); }
                if (manager.getErrorState?.()) throw Error('Native product error stopped source replay: ' + document.body.innerText.slice(-1200));
                return { tick: g.currentTick, advanced: g.currentTick - start, failure: g.campaign.failure, result: g.campaign.result,
                    applied: replay.cursor, expected: replay.records.length };
            });
            final = result;
            assert(!result.failure, result.failure);
            if (result.result && options.allowSourceResult) break;
            assert(!result.result, 'Source result occurred before the requested input-replay boundary');
            if (result.tick - lastObservation >= 1800) {
                await this.observe('historical-source-ordinary-input-replay-' + result.tick);
                lastObservation = result.tick;
            }
            if (result.tick === until) assert.equal(result.applied, result.expected);
        }
        this.report.ordinaryInputReplay = { file, from, until, completedTick: final?.tick ?? from,
            commands: records.length, appliedCommands: final?.applied ?? 0, sourceResult: final?.result,
            sourcePolicy: saved.options.campaign.semanticsVersion, currentPolicy: this.report.launch.semanticsVersion,
            qualification: 'Original source initialization reuses its recorded creation identity, which deterministically seeds the normal constructors. Previously applied ordinary player inputs enter the normal input queue. No saved world, result, actor, health, source rule, trigger or running RNG state is assigned; the prior save remains unchanged. This is historical input replay, not a new public mission initialization test.' };
        (this.report.ordinaryInputReplays ??= []).push(this.report.ordinaryInputReplay);
        await this.checkpoint(options.resume ? 'continued-source-input-replay-checkpoint.json'
            : 'fresh-source-input-replay-checkpoint.json');
    }
    async observe(label) {
        const state = await this.commands.inspect(label), compact = { ...state };
        delete compact.teams; delete compact.sourceAiState;
        for (const key of ['sourceTrace', 'baseTrace', 'sourceAiTrace']) {
            compact[key] = state[key]?.filter(row => row.tick >= (this.traceTicks[key] ?? 0));
            this.traceTicks[key] = state.tick;
        }
        this.report.samples.push(compact);
        await fs.writeFile(path.join(this.out, 'progress.json'), JSON.stringify(this.report, null, 2) + '\n');
        return state;
    }
    async checkpoint(name = 'last-trusted-checkpoint.json') {
        const value = await this.page.evaluate(() => {
            const g = window.__ra2debug.game;
            if (g.campaign.failure || g.campaign.inspectionModified) throw Error('A failed or art-inspection world cannot supply a trusted checkpoint');
            return g.campaign.journal.capture(g);
        });
        await fs.writeFile(path.join(this.out, name), JSON.stringify(value) + '\n');
        return value;
    }
    async restart(name) {
        await this.retainMedia('before-named-save-restart');
        this.session = await namedSaveRestart(this.session, this.out, this.report, name, async (page, ticks) => {
            await page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
            return stepWorld(page, ticks);
        }, async ({ page }) => {
            if (this.observeMedia) this.stopMedia = await observeMissionMedia(page);
        }, { restoreTimeoutMs: 600000 });
        this.commands = new OrdinaryCampaignCommands(this.page, this.report);
        await watchNativeEvaluation(this.session, this.out, this.report);
        return this.observe('restored-meaningful-original-progress');
    }
    async retainMedia(phase) {
        if (!this.stopMedia) return;
        const stop = this.stopMedia; this.stopMedia = undefined;
        (this.report.missionMedia ??= []).push({ phase, ...await stop() });
    }
    async completeResultFlow() {
        const observeEnding = process.argv.includes('--observe-ending');
        let ending;
        if (observeEnding) {
            assert(this.observeMedia, 'Observe the actual source ending through the normal media observer');
            ending = await this.page.evaluate(() => {
                const g = window.__ra2debug.game, campaign = g.campaign;
                const basic = campaign.definition.ini.getSection('Basic');
                return { mission: campaign.launch.mission, difficulty: campaign.launch.difficulty,
                    result: campaign.result, endOfGame: basic.getBool('EndOfGame'), next: campaign.nextMission,
                    movies: ['PostScore', 'PreMapSelect'].map(field => ({ field, name: basic.getString(field) }))
                        .filter(movie => movie.name && movie.name.toLowerCase() !== '<none>') };
            });
            assert.equal(ending.result, 'victory'); assert(ending.endOfGame && !ending.next && ending.movies.length);
        }
        await completeSourceResultFlow(this.page, this.out, this.report);
        if (!observeEnding) return;
        const labels = this.session.labels;
        assert.equal(await this.page.getByRole('button', { name: labels['hd:campaigncontinuemission'], exact: true }).count(), 0);
        await this.page.getByRole('button', { name: labels['hd:campaignreturnselection'], exact: true }).click();
        await this.page.waitForSelector('[data-campaign-ready=true]', { timeout: 300000 });
        const returned = await this.page.evaluate(() => {
            const d = window.__ra2debug, screen = d.mainMenuController.screens.get(22);
            return { activeWorldAbsent: !d.game?.campaign, remainingMedia: document.querySelectorAll('[data-campaign-media]').length,
                difficulty: screen.difficulty, selectedMission: screen.selected, faction: screen.faction };
        });
        assert(returned.activeWorldAbsent); assert.equal(returned.remainingMedia, 0);
        assert.equal(returned.difficulty, ending.difficulty);
        this.report.factionEnding = { source: ending, returned, ordinaryScoreReturnButton: true };
        await this.page.screenshot({ path: path.join(this.out, 'native-faction-ending-return.png') });
        this.report.naturalSourceFactionEndingAndReturnReached = true;
    }
    async finish(error) {
        if (error) { this.report.status = 'FAIL'; this.report.error = error.stack; process.exitCode = 1; }
        if (this.commands) {
            this.report.finalWorld = await this.commands.inspect('final-original-observation').catch(() => undefined);
            if (!this.report.finalWorld?.result) {
                if (!error || error.code === 'ERR_ASSERTION') await this.checkpoint().catch(reason => {
                    this.report.checkpointExcluded = String(reason);
                });
                else this.report.checkpointExcluded = 'An interrupted native evaluation cannot supply an accepted checkpoint.';
            }
            else {
                this.report.finalState = await worldState(this.page).catch(() => undefined);
                const journal = await this.page.evaluate(() => {
                    const g = window.__ra2debug.game;
                    return { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, tick: g.currentTick,
                        commands: g.campaign.journal.commands, result: g.campaign.result };
                });
                await fs.writeFile(path.join(this.out, 'applied-source-journal.json'), JSON.stringify(journal) + '\n');
            }
            await this.page.screenshot({ path: path.join(this.out, 'native-final.png') }).catch(() => {});
        }
        try { await this.retainMedia('final-source-observation'); }
        catch (error) { this.report.status = 'FAIL'; this.report.mediaObserverError = error.stack; process.exitCode = 1; }
        try { await fs.writeFile(path.join(this.out, 'report.json'), JSON.stringify(this.report, null, 2) + '\n'); }
        finally { await this.session?.app.close(); }
        console.log(JSON.stringify({ status: this.report.status, error: this.report.error, out: this.out }));
    }
}

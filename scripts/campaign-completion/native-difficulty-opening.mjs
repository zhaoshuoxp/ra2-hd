import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]), spec = JSON.parse(await fs.readFile(path.resolve(process.argv[3])));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], cases: [], spec,
    scope: 'Actual Easy/Hard faction slider, fresh prepared original source, independently recorded original cash/handicap/AI parameters and intact source trigger flags. This opening parameter check omits pre-mission playback and does not claim full Easy/Hard victories. Public lifecycle and complete mission goals have separate evidence.' };
let app, page;
try {
    for (const difficulty of ['easy', 'hard']) {
        const folder = path.join(out, difficulty); await fs.mkdir(folder);
        ({ app, page } = await campaignSession(folder, report, { density: 0 }));
        const slider = page.locator('[data-campaign-difficulty]'); await slider.focus();
        await slider.press(difficulty === 'easy' ? 'Home' : 'End');
        assert.equal(await slider.inputValue(), difficulty === 'easy' ? '0' : '2');
        await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), spec.mission);
        await waitWorld(page, spec.mission);
        const initialCredits = await page.evaluate(() => window.__ra2debug.game.localPlayer.credits);
        await stepWorld(page, 360);
        const state = await page.evaluate(enemy => { const g = window.__ra2debug.game, c = g.campaign;
            return { launch: c.launch, tick: g.currentTick, failure: c.failure, human: g.localPlayer.handicap,
                enemy: c.houses.get(enemy).handicap, credits: g.localPlayer.credits,
                delays: g.rules.getIni().getSection('General').getNumberArray('TeamDelays'),
                controlled: g.localPlayer.campaignControlledPlayers.map(owner => ({ name: owner.name, neutral: owner.isNeutral,
                    credits: owner.credits, handicap: owner.handicap })),
                openingActors: g.localPlayer.campaignControlledPlayers.flatMap(owner => owner.getOwnedObjects(true))
                    .filter(object => object.isUnit() && object.isSpawned && !object.isDestroyed)
                    .reduce((counts, object) => (counts[object.name] = (counts[object.name] ?? 0) + 1, counts), {}),
                openingRanks: g.localPlayer.campaignControlledPlayers.flatMap(owner => owner.getOwnedObjects(true))
                    .filter(object => object.isUnit() && object.isSpawned && !object.isDestroyed)
                    .reduce((ranks, object) => ((ranks[object.name] ??= []).push(object.veteranLevel), ranks), {}),
                aiTriggers: c.definition.aiTriggers.size, ignoreGlobal: c.definition.ini.getSection('Basic').getBool('IgnoreGlobalAITriggers'),
                flags: [...c.definition.triggers.values()].map(trigger => ({ id: trigger.id, flags: trigger.difficulties })) };
        }, spec.enemyHouse);
        state.initialCredits = initialCredits;
        report.lastOpening = state;
        const expected = spec.cases[difficulty], values = handicap => [handicap.armor, handicap.rof, handicap.buildTime];
        assert.equal(state.launch.mission, spec.mission); assert.equal(state.launch.difficulty, difficulty);
        assert.equal(state.launch.sourceSha256, spec.sourceSha256); assert.equal(state.launch.semanticsVersion, spec.semanticsVersion);
        assert.equal(state.launch.startingCreditsVersion, 1); assert(!state.failure);
        assert.equal(state.initialCredits, expected.credits); assert.deepEqual(values(state.human), expected.human);
        assert.deepEqual(values(state.enemy), expected.enemy); assert.equal(state.enemy.teamDelay, expected.aiDelay);
        assert.deepEqual(state.delays, spec.teamDelays); assert.equal(state.controlled.length, spec.controlledHouses);
        if (expected.controlledCredits) assert.deepEqual(Object.fromEntries(state.controlled
            .map(owner => [owner.name, owner.credits])), expected.controlledCredits);
        assert(state.controlled.every(owner => owner.neutral === (spec.controlledNeutralHouses ?? []).includes(owner.name)
            && JSON.stringify(values(owner.handicap)) === JSON.stringify(expected.human)));
        assert.equal(state.aiTriggers, spec.aiTriggers); assert.equal(state.ignoreGlobal, spec.ignoreGlobal);
        assert.equal(state.flags.length, spec.triggers);
        for (const [name, count] of Object.entries(expected.openingActors ?? {})) assert.equal(state.openingActors[name] ?? 0, count);
        for (const [name, ranks] of Object.entries(expected.openingRanks ?? {})) {
            assert.deepEqual((state.openingRanks[name] ?? []).sort(), ranks);
        }
        report.cases.push(state); await page.screenshot({ path: path.join(folder, 'native-original-difficulty-opening.png') });
        await app.close(); app = undefined;
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_EASY_HARD_SOURCE_PARAMETERS_AND_OPENING';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, mission: spec.mission, error: report.error, out }));

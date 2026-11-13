import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], cases: [],
    scope: 'Native first-mission difficulty cash initialization through the real faction slider and prepared source launcher. This parameter check deliberately omits pre-mission playback; public lifecycle has separate evidence. Old saves without the new money pin are verified separately by strict legacy reconstruction.' };
let app, page;
try {
    for (const [difficulty, expected] of [['easy', 7000], ['hard', 4000]]) {
        const directory = path.join(out, difficulty); await fs.mkdir(directory);
        ({ app, page } = await campaignSession(directory, report, { density: 0 }));
        const slider = page.locator('[data-campaign-difficulty]');
        await slider.focus(); await slider.press(difficulty === 'easy' ? 'Home' : 'End');
        await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov01t.map'));
        await waitWorld(page, 'sov01t.map');
        const state = await page.evaluate(() => { const g = window.__ra2debug.game;
            return { launch: g.campaign.launch, tick: g.currentTick, credits: g.localPlayer.credits,
                sourceCredits: g.campaign.definition.houses.get(g.localPlayer.name).credits,
                commands: g.campaign.journal.commands.length, failure: g.campaign.failure };
        });
        assert.equal(state.launch.difficulty, difficulty); assert.equal(state.launch.semanticsVersion, 5);
        assert.equal(state.launch.startingCreditsVersion, 1); assert.equal(state.credits, expected);
        assert.equal(state.launch.startingVeterancyVersion, 1);
        assert.equal(state.sourceCredits, 5500); assert.equal(state.commands, 0); assert(!state.failure);
        report.cases.push(state); await page.screenshot({ path: path.join(directory, 'native-original-starting-cash.png') });
        await app.close(); app = undefined;
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_FIRST_MISSION_STARTING_MONEY_AND_FROZEN_TASK_INTERPRETER';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));

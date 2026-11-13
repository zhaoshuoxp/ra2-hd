import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], cases: [],
    scope: 'Native original scenario Theme selection and actual local audio decoding for Soviet 03/04 openings. This is audio compatibility validation, not Soviet 04 objective or playable acceptance.' };
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    for (const [mission, theme] of [['sov03u.map', 'InDeep'], ['sov04s.map', 'Burn']]) {
        await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), mission);
        await waitWorld(page, mission);
        await page.waitForFunction(theme => {
            const music = window.__ra2debug.music, state = music?.getPlaybackState();
            return music?.getCurrentPlaylistItem()?.sound === theme && state?.sound === theme && state.time > .2 && state.playing;
        }, theme, { timeout: 30000 });
        const state = await page.evaluate(() => {
            const d = window.__ra2debug, music = d.music, state = music.getPlaybackState();
            return { mission: d.game.campaign.launch.mission, sourceTheme: d.game.campaign.definition.ini.getSection('Basic').getString('Theme'),
                selected: music.getCurrentPlaylistItem(), time: state.time, duration: state.duration,
                actualAudioPlaying: state.playing, actualDecodedSound: state.sound, failure: d.game.campaign.failure,
                normalPlaylistRetained: music.getPlaylist().length, shuffle: music.getShuffleMode(), repeat: music.getRepeatMode() };
        });
        assert.equal(state.sourceTheme, theme); assert.equal(state.selected.sound, theme); assert.equal(state.actualDecodedSound, theme);
        assert(state.actualAudioPlaying && state.duration > 30);
        assert(!state.failure); report.cases.push(state);
        await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
        await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
        await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
        await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]');
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SCENARIO_THEMES_AND_LOCAL_AUDIO_PLAYBACK';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));

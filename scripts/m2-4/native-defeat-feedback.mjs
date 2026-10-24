import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const s = await startSession(receipt, output, process.argv.includes('--ra2') ? 'ra2' : 'yr');
let failure;
try {
    await s.page.evaluate(async () => {
        const d = window.__ra2debug, ui = d.gameScreen.playerUi, eva = ui.eva, audio = d.audioSystem;
        clearInterval(window.__allied.timer);
        const bots = d.game.getCombatants().filter(p => p.isAi);
        if (bots.length < 4) throw Error('Four AI players are required to keep the match active');
        await audio.audioContext.resume();
        const spec = eva.evaSpecs.getSpec('EVA_PlayerDefeated'), wav = eva.sound.getWavFile(spec.sound);
        const f = window.__defeat = { calls: [], messages: [], played: [], decoded: [], targetSound: spec.sound,
            oldMessageCount: ui.messageList.messages.length, nodes: [], chunks: [] };
        f.game = d.game;
        ui.messageList.onNewMessage.subscribe(message => f.messages.push({ ...message }));
        const play = eva.play.bind(eva), playWav = audio.playWavFile.bind(audio), playBuffer = audio.playAudioBuffer.bind(audio);
        eva.play = (...args) => { f.calls.push(args); return play(...args); };
        audio.playWavFile = (file, channel, ...args) => {
            f.wavRequest = file === wav;
            const handle = playWav(file, channel, ...args);
            f.wavRequest = false;
            if (file === wav) f.played.push({ channel, handle });
            return handle;
        };
        audio.playAudioBuffer = (handle, buffer, channel, ...args) => {
            const node = playBuffer(handle, buffer, channel, ...args);
            if (f.wavRequest || f.played.some(item => item.handle === handle)) {
                const data = buffer.getChannelData(0);
                let peak = 0; for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
                f.decoded.push({ channel, samples: data.length, peak, duration: buffer.duration });
            }
            return node;
        };
        const destination = audio.audioContext.createMediaStreamDestination();
        audio.getChannel(4).connect(destination);
        f.destination = destination;
        f.recorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm;codecs=opus' });
        f.recorder.ondataavailable = event => { if (event.data.size) f.chunks.push(event.data); };
        f.recorder.start();
        eva.play('EVA_NewConstructionOptions', true);
    });
    await s.page.waitForFunction(() => window.__ra2debug.gameScreen.playerUi.eva.currentEvaPlaying?.isPlaying());
    s.report.eliminations = await s.page.evaluate(() => {
        const d = window.__ra2debug, game = d.game, bots = game.getCombatants().filter(p => p.isAi);
        const selected = bots.slice(0, 3);
        selected.forEach((player, index) => {
            if (index < 2) {
                const resign = d.actionFactory.create(3); resign.player = player; resign.process();
            } else for (const object of player.getOwnedObjects()) if (!object.isDestroyed) game.destroyObject(object, undefined, true);
        });
        game.updateDefeatedPlayers(game.getCombatants());
        game.updateDefeatedPlayers(game.getCombatants());
        return selected.map(p => ({ name: p.name, resigned: p.resigned, defeated: p.defeated, color: p.color.asHexString() }));
    });
    await s.page.waitForFunction(() => window.__defeat.played.length === 3 &&
        window.__defeat.played.every(row => !row.handle.isPlaying()), undefined, { timeout: 20000 });
    await s.page.screenshot({ path: path.join(s.out, 'defeated-messages.png') });
    s.report.firstThreeMessages = await s.page.evaluate(() => window.__defeat.messages.slice());
    s.report.finalElimination = await s.page.evaluate(() => {
        const d = window.__ra2debug, game = d.game, player = game.getCombatants().find(p => p.isAi);
        const resign = d.actionFactory.create(3); resign.player = player; resign.process();
        game.checkGameEndConditions();
        return { name: player.name, resigned: player.resigned, defeated: player.defeated, color: player.color.asHexString() };
    });
    await s.page.waitForTimeout(750);
    await s.page.screenshot({ path: path.join(s.out, 'final-elimination-result.png') });
    await s.page.waitForFunction(() => window.__defeat.played.length === 4 &&
        window.__defeat.played.every(row => !row.handle.isPlaying()), undefined, { timeout: 20000 });
    const result = await s.page.evaluate(async () => {
        const d = window.__ra2debug, f = window.__defeat, audio = d.audioSystem;
        const done = new Promise(resolve => { f.recorder.onstop = resolve; });
        f.recorder.stop(); await done;
        const bytes = new Uint8Array(await new Blob(f.chunks, { type: 'audio/webm' }).arrayBuffer());
        audio.getChannel(4).disconnect(f.destination);
        return { targetSound: f.targetSound, calls: f.calls, decoded: f.decoded,
            messages: f.messages,
            audioState: audio.audioContext.state, status: f.game.status,
            audio: Array.from(bytes), glError: d.renderer.renderer.getContext().getError() };
    });
    await fs.writeFile(path.join(s.out, 'defeat-voices.webm'), Buffer.from(result.audio));
    delete result.audio;
    s.report.feedback = result;
    assert.equal(result.status, 2, 'The final elimination must finish the match');
    assert.equal(result.audioState, 'running');
    assert.equal(result.glError, 0);
    assert.equal(result.calls.filter(row => row[0] === 'EVA_PlayerDefeated' && row[1] === true).length, 4);
    assert.equal(result.calls.filter(row => row[0] === 'EVA_YouAreVictorious').length, 1);
    assert.equal(result.decoded.length, 4);
    assert(result.decoded.every(row => row.samples > 1000 && row.peak > .01 && row.channel === 4));
    assert.equal(result.messages.length, 4);
    assert(result.messages.every(row => !/AI_\d|@@AI|GUI:AI/.test(row.text)), 'AI names must use localized lobby labels');
    assert.deepEqual(result.messages.map(row => row.color).sort(), [...s.report.eliminations, s.report.finalElimination].map(row => row.color).sort());
    assert.equal(new Set(result.messages.map(row => row.text)).size, 4);
    assert(s.report.eliminations.every(row => row.defeated));
    s.report.status = 'PASS_NATIVE_FOUR_ELIMINATIONS_INCLUDING_FINAL_RESULT_AND_DECODED_QUEUED_VOICES';
    await fs.writeFile(path.join(s.out, 'feedback.json'), JSON.stringify(s.report, null, 2) + '\n');
    console.log(JSON.stringify({ status: s.report.status, voices: result.decoded.length, messages: result.messages.length }));
} catch (error) { failure = error; }
await s.close(failure);
if (failure) throw failure;

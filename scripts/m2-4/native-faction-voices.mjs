import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

export async function auditFactionVoices(page, edition, country, unitName, sourceFile) {
    const source = JSON.parse(await fs.readFile(sourceFile, 'utf8')).editions.find(item => item.edition === edition);
    const faction = country === 9 ? 'yuri' : country === 8 ? 'soviet' : 'allied';
    const expected = source.factions.find(item => item.faction === faction);
    const units = source.units.filter(item => [unitName, country === 9 ? 'PCV' : country === 8 ? 'SMCV' : 'AMCV'].includes(item.unit));
    const result = await page.evaluate(async ({ expected, units }) => {
        const d = window.__ra2debug, eva = d.eva, sound = d.gameScreen.sound, audio = d.audioSystem;
        const mismatches = expected.entries.filter(entry => eva.evaSpecs.getSpec(entry.event)?.sound !== entry.sound);
        const hash = async file => [...new Uint8Array(await crypto.subtle.digest('SHA-256', file.getData()))]
            .map(byte => byte.toString(16).padStart(2, '0')).join('');
        await audio.audioContext.resume();
        const records = [], original = audio.playWavFile, requests = [];
        audio.playWavFile = function (file, channel, ...rest) {
            const handle = original.call(this, file, channel, ...rest);
            requests.push({ file, channel, handle }); return handle;
        };
        try {
            for (const sample of expected.samples) {
                eva.currentEvaPlaying?.stop(); eva.evaWaitingList.length = 0; eva.lastEvaEventBySpec.clear();
                const start = requests.length;
                eva.play(sample.event, true); eva.handleFrame(performance.now());
                const request = requests[start];
                if (!request) throw Error('No playback for ' + sample.event);
                await new Promise(resolve => setTimeout(resolve, 120));
                records.push({ type: 'eva', event: sample.event, sound: sample.sound, channel: request.channel,
                    sha256: await hash(request.file), decodedBytes: request.file.getData().length,
                    webAudioBuffer: !!audio.audioBufferCache.get(request.file),
                    sourceNode: !!request.handle.sourceNode, contextState: audio.audioContext.state });
                request.handle.stop();
            }
            for (const expectedUnit of units) {
                const unit = d.localPlayer.getOwnedObjects().find(item => item.name === expectedUnit.unit);
                if (!unit) continue;
                for (const [key, feedback] of [['VoiceSelect', undefined], ['VoiceMove', 1], ['VoiceAttack', 2]]) {
                    const voice = expectedUnit.voices.find(item => item.key === key);
                    if (!voice) continue;
                    const actual = unit.rules[key[0].toLowerCase() + key.slice(1)];
                    if (actual !== voice.group) throw Error('Wrong unit voice group: ' + expectedUnit.unit + '/' + key);
                    const start = requests.length;
                    d.gameScreen.playerUi.soundHandler.lastFeedbackTime = 0;
                    if (feedback === undefined) d.worldInteraction.unitSelectionHandler.selectSingleUnit(unit);
                    else d.gameScreen.playerUi.soundHandler.handleOrderPushed(unit, feedback === 2 ? 1 : 0, feedback);
                    const request = requests[start];
                    if (!request) throw Error('No unit playback: ' + unit.name + '/' + key);
                    await new Promise(resolve => setTimeout(resolve, 120));
                    const sha256 = await hash(request.file), spec = sound.getSoundSpec(actual);
                    records.push({ type: 'unit', unit: unit.name, key, group: actual, channel: request.channel, sha256,
                        expectedSamples: voice.samples, routedSounds: spec.sounds,
                        webAudioBuffer: !!audio.audioBufferCache.get(request.file), sourceNode: !!request.handle.sourceNode,
                        contextState: audio.audioContext.state,
                        trigger: feedback === undefined ? 'Actual selection update event' : 'Controlled numeric command feedback handler' });
                    request.handle.stop();
                }
            }
        } finally { audio.playWavFile = original; }
        return { faction: expected.faction, side: eva.evaSpecs.sideType, entryCount: expected.entries.length, mismatches, records };
    }, { expected, units });
    assert.deepEqual(result.mismatches, []);
    assert.equal(result.side, expected.side);
    assert(result.records.some(item => item.type === 'unit'));
    for (const record of result.records) {
        assert.equal(record.contextState, 'running'); assert(record.webAudioBuffer && record.sourceNode);
        if (record.type === 'eva') {
            const sample = expected.samples.find(item => item.event === record.event);
            assert.equal(record.sha256, sample.decodedSha256); assert.equal(record.channel, 4);
        } else {
            assert(record.expectedSamples.some(sample => sample.decodedSha256 === record.sha256));
            assert.equal(record.channel, 3);
        }
    }
    return { status: 'PASS_RETAIL_FACTION_ROUTING_PCM_AND_NATIVE_WEB_AUDIO_PLAYBACK', edition, ...result };
}

// Capture every phase of one ordinary native linked building loop without overrides.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function validateLinkedBuildingCycle(session, member, frameCount, options) {
    const { page, report, out } = session;
    assert(Number.isInteger(frameCount) && frameCount > 1);
    const { loopStart, loopEnd, originalRenderer = false, objectId, state = 'normal',
        allowNativePoweredIdle = false } = options;
    assert(['normal', 'damaged'].includes(state));
    assert(Number.isInteger(loopStart) && Number.isInteger(loopEnd)
        && loopStart >= 0 && loopStart <= loopEnd && loopEnd < frameCount);
    const expectedPhases = Array.from({ length: loopEnd - loopStart + 1 }, (_, index) => loopStart + index);
    const result = await page.evaluate(async ({ member, frameCount, expectedPhases, objectId, allowNativePoweredIdle }) => {
        const d = window.__ra2debug;
        let target;
        for (const object of d.game.getWorld().getAllObjects()) {
            if (objectId !== undefined && object.id !== objectId) continue;
            const r = d.renderableManager.getRenderableByGameObject(object);
            for (const list of r?.animObjects?.values() ?? []) for (const anim of list) {
                const source = [...r.aggregatedImageData.imageIndexes]
                    .find(([, offset]) => offset === anim.builder.frameOffset)?.[0];
                if (!target && source?.filename === member) target = { object, r, anim };
            }
        }
        if (!target) throw Error('Missing original linked animation: ' + member);
        const originalLoopPhases = expectedPhases;
        const nativePower = { neutral: target.object.owner.isNeutral,
            poweredOn: target.object.poweredTrait?.isPoweredOn(), poweredRule: target.object.rules.powered };
        const nativeIdle = allowNativePoweredIdle && nativePower.neutral
            && nativePower.poweredRule && nativePower.poweredOn === false;
        if (nativeIdle) expectedPhases = [target.anim.builder.getFrame()];
        d.worldInteraction.minimapHandler.panToTile(target.object.tile);
        await new Promise(resolve => requestAnimationFrame(resolve));
        const source = d.renderer.renderer.domElement, viewport = d.worldScene.viewport;
        const projected = target.r.getPosition().clone().project(d.worldScene.camera);
        const ratio = source.width / d.renderer.width;
        const x = (viewport.x + (projected.x + 1) * viewport.width / 2) * ratio;
        const y = (viewport.y + (1 - projected.y) * viewport.height / 2) * ratio;
        const width = 720, height = 640;
        const left = Math.max(0, Math.min(source.width - width, Math.round(x - width / 2)));
        const top = Math.max(0, Math.min(source.height - height, Math.round(y - height * .7)));
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d');
        const draw = () => context.drawImage(source, left, top, width, height, 0, 0, width, height);
        const stream = canvas.captureStream(30), chunks = [];
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 8000000 });
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        draw(); recorder.start(250);
        const startTick = d.game.currentTick, captures = new Map(), transitions = [];
        const started = performance.now(), first = target.anim.builder.getFrame();
        let previous;
        while (performance.now() - started < 15000) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            d.renderer.render();
            draw();
            const phase = target.anim.builder.getFrame();
            if (!Number.isInteger(phase) || phase < 0 || phase >= frameCount)
                throw Error('Linked animation phase outside original source range');
            if (phase !== previous) {
                transitions.push({ phase, tick: d.game.currentTick }); previous = phase;
            }
            if (!captures.has(phase)) {
                captures.set(phase, { phase, tick: d.game.currentTick,
                    png: canvas.toDataURL().split(',')[1], source: [left, top, width, height],
                    buffer: [source.width, source.height], hd: target.anim.builder.hdOverride?.identity });
            }
            if (nativeIdle && d.game.currentTick > startTick + 8 && phase === first) break;
            if (!nativeIdle && expectedPhases.every(phase => captures.has(phase)) && phase === first
                && transitions.length > expectedPhases.length) break;
        }
        const endTick = d.game.currentTick, lastPhase = target.anim.builder.getFrame();
        await new Promise(resolve => { recorder.onstop = resolve; recorder.stop(); });
        stream.getTracks().forEach(track => track.stop());
        const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
        let binary = '';
        for (let index = 0; index < bytes.length; index += 32768)
            binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
        return { name: target.object.name, id: target.object.id, member, startTick,
            endTick, firstPhase: first, lastPhase,
            captures: [...captures.values()], transitions, nativeIdle, nativePower, originalLoopPhases,
            observedExpectedPhases: expectedPhases, video: btoa(binary),
            videoCapture: { width, height, fps: 30, source: [left, top, width, height],
                sourceBuffer: [source.width, source.height], rescaled: false, timing: 'UNCHANGED_NATIVE_CLOCK' } };
    }, { member, frameCount, expectedPhases, objectId, allowNativePoweredIdle });
    for (const capture of result.captures) {
        const suffix = objectId === undefined ? '' : `-${state}-fixture-${objectId}`;
        capture.file = `${member}${suffix}-phase-${capture.phase}-native-cycle.png`;
        await fs.writeFile(path.join(out, capture.file), Buffer.from(capture.png, 'base64'));
        delete capture.png; capture.rescaled = false;
    }
    result.state = state;
    result.fixture = objectId !== undefined;
    const suffix = objectId === undefined ? '' : `-${state}-fixture-${objectId}`;
    result.videoFile = `${member}${suffix}-native-cycle.webm`;
    await fs.writeFile(path.join(out, result.videoFile), Buffer.from(result.video, 'base64'));
    delete result.video;
    result.disclosure = `${result.fixture ? 'Legal native state fixture' : 'Existing original placement'}; normal native clock and rendering. No frame, rate, rule, geometry or camera-scale override.`;
    result.sourceFrameCount = frameCount; result.expectedPhases = result.observedExpectedPhases;
    result.unusedSourcePhases = Array.from({ length: frameCount }, (_, index) => index)
        .filter(phase => !result.expectedPhases.includes(phase));
    result.status = 'INCOMPLETE_NATIVE_LOOP_OBSERVATION';
    (report.linkedBuildingCycles ??= []).push(result);
    assert(result.endTick > result.startTick && result.lastPhase === result.firstPhase);
    assert.deepEqual(result.captures.map(row => row.phase).sort((a, b) => a - b),
        result.expectedPhases);
    assert(result.captures.every(row => originalRenderer ? !row.hd : row.hd?.startsWith('environment-aggregate/')));
    if (result.nativeIdle) {
        assert(result.nativePower.neutral && result.nativePower.poweredRule && result.nativePower.poweredOn === false);
        assert(result.transitions.length === 1 && result.expectedPhases.length === 1);
        result.disclosure += ' Original neutral powered building remains unpowered and idle; active loops require separately disclosed powered fixtures.';
    }
    result.status = result.nativeIdle ? 'PASS_ORIGINAL_NEUTRAL_UNPOWERED_IDLE'
        : 'PASS_ALL_ORIGINAL_PHASES_AND_NATIVE_LOOP_RETURN';
}

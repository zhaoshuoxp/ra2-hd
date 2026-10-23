// Record a crop of the live native framebuffer without changing animation timing.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function recordOilMotion(session, name, duration = 5000) {
    const { page, output = session.out, report } = session;
    const capture = await page.evaluate(() => {
        const d = window.__ra2debug, object = window.__allied.actor;
        const renderable = d.renderableManager.getRenderableByGameObject(object);
        const source = d.renderer.renderer.domElement, viewport = d.worldScene.viewport;
        const projected = renderable.getPosition().clone().project(d.worldScene.camera);
        const ratio = source.width/d.renderer.width;
        const x = (viewport.x+(projected.x+1)*viewport.width/2)*ratio;
        const y = (viewport.y+(1-projected.y)*viewport.height/2)*ratio;
        const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 640;
        const left = Math.max(0, Math.min(source.width-canvas.width, Math.round(x-canvas.width/2)));
        const top = Math.max(0, Math.min(source.height-canvas.height, Math.round(y-canvas.height*.6)));
        const context = canvas.getContext('2d');
        const draw = () => context.drawImage(source, left, top, canvas.width, canvas.height,
            0, 0, canvas.width, canvas.height);
        draw();
        const stream = canvas.captureStream(15);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 8000000 });
        const capture = window.__oilCapture = { chunks: [], frames: [], recorder, stream, object };
        recorder.ondataavailable = event => { if (event.data.size) capture.chunks.push(event.data); };
        capture.timer = setInterval(() => {
            draw();
            capture.frames.push({ tick: d.game.currentTick,
                health: object.healthTrait.health, owner: object.owner.color,
                frames: [...renderable.animObjects.values()].flat().map(part => part.builder.getFrame()) });
        }, 1000/15);
        recorder.start(1000);
        return { width: canvas.width, height: canvas.height, source: [left, top, canvas.width, canvas.height],
            sourceBuffer: [source.width, source.height], fps: 15, timing: 'UNCHANGED_NATIVE_GAME_TICKS',
            actor: { id: object.id, name: object.name, health: object.healthTrait.health,
                maxHitPoints: object.healthTrait.maxHitPoints, owner: object.owner.color } };
    });
    await page.waitForTimeout(duration);
    const result = await page.evaluate(async () => {
        const capture = window.__oilCapture;
        clearInterval(capture.timer);
        await new Promise(resolve => { capture.recorder.onstop = resolve; capture.recorder.stop(); });
        capture.stream.getTracks().forEach(track => track.stop());
        const bytes = new Uint8Array(await new Blob(capture.chunks, { type: 'video/webm' }).arrayBuffer());
        let binary = '';
        for (let index = 0; index < bytes.length; index += 32768)
            binary += String.fromCharCode(...bytes.subarray(index, index+32768));
        return { bytes: btoa(binary), frames: capture.frames };
    });
    const file = path.join(output, name+'.webm');
    await fs.writeFile(file, Buffer.from(result.bytes, 'base64'));
    assert(result.frames.length > 30 && result.frames.at(-1).tick > result.frames[0].tick);
    assert(result.frames.every(frame => frame.health === capture.actor.health
        && JSON.stringify(frame.owner) === JSON.stringify(capture.actor.owner)), 'Ownership or health changed during the labeled clip');
    assert(new Set(result.frames.map(frame => frame.frames.join(','))).size > 2, 'Native oil motion did not advance');
    const activeFrames = [...new Set(result.frames.map(frame => frame.frames[0]))].sort((a, b) => a-b);
    if (/player-normal|enemy-normal/.test(name)) assert.deepEqual(activeFrames, Array.from({ length: 32 }, (_, i) => i));
    if (/damaged/.test(name)) assert.deepEqual(activeFrames, Array.from({ length: 31 }, (_, i) => i+33));
    if (name === 'oil-normal-motion') assert.deepEqual(activeFrames, [0], 'Original neutral pump remains idle');
    (report.oilClips ??= []).push({ file, ...capture, activeFrames, frames: result.frames });
}

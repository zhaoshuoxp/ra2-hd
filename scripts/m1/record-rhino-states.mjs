import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function recordRhinoStates(page, output) {
    const result = await page.evaluate(async () => {
        const d = window.__ra2debug, s = window.__states, source = d.renderer.renderer.domElement;
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 300;
        const ctx = canvas.getContext('2d'), chunks = [], trace = [], effects = [];
        const recorder = new MediaRecorder(canvas.captureStream(15), { mimeType: 'video/webm;codecs=vp9' });
        recorder.ondataavailable = e => chunks.push(e.data);
        const nativeAnim = d.renderableManager.createTransientAnim;
        d.renderableManager.createTransientAnim = function (name, ...args) { effects.push({ name, stage: s.stage }); return nativeAnim.call(this, name, ...args); };
        const oldR = s.r, oldU = s.unit, pack = oldR.rhinoHd.resources;
        const spawn = tile => {
            const u = d.game.createUnitForPlayer(d.game.rules.getObject('HTNK', 7), d.localPlayer);
            d.game.spawnObject(u, tile);
            d.worldScene.update(s.time, 0);
            s.unit = u;
            s.r = d.renderableManager.getRenderableByGameObject(u);
            u.direction = 0;
            u.turretTrait.facing = 90;
            s.r.update(s.time, 0);
            d.worldInteraction.minimapHandler.panToTile(tile);
        };
        const stages = [
            ['Rocking / native pivot', () => { s.move(s.flat); s.r.startRocking(90, 0.9, s.time); }, 650],
            ['Warp freeze / native sparkles', () => { s.unit.warpedOutTrait.setActive(true, true, d.game); }, 1400],
            ['Iron Curtain / native light', () => { s.unit.warpedOutTrait.expire(d.game); s.unit.invulnerableTrait.setActiveFor(600, d.game); }, 1400],
            ['Restored artwork', () => { s.unit.invulnerableTrait.timer.reset(); }, 700],
            ['Native explosion / disposal', () => { s.unit.deathType = 1; d.game.destroyObject(s.unit); }, 1300],
            ['Temporal removal / native FX', () => { spawn(s.flat); s.unit.deathType = 4; d.game.destroyObject(s.unit); }, 1300],
            ['Sinking / water clipping', () => {
                    const tiles = d.game.map.tiles.getAll(), water = tiles.find(t => t.landType === 7 && !d.game.map.tileOccupation.getBridgeOnTile(t) && Math.hypot(t.rx - s.low.rx, t.ry - s.low.ry) < 10);
                    if (!water)
                        throw Error('No water sink fixture');
                    spawn(s.flat);
                    s.move(water);
                    if (s.unit.zone !== 2)
                        throw Error('Native spawn did not select Water zone');
                    s.sinkTile = { rx: water.rx, ry: water.ry, landType: water.landType, zone: s.unit.zone };
                    s.unit.deathType = 5;
                    d.game.destroyObject(s.unit);
                }, 3700],
        ];
        recorder.start();
        for (const [label, setup, duration] of stages) {
            s.stage = label;
            setup();
            const start = performance.now(), time = s.time;
            while (performance.now() - start < duration) {
                s.time = time + performance.now() - start;
                ctx.fillStyle = '#1c1e22';
                ctx.fillRect(0, 0, 800, 300);
                ctx.fillStyle = 'white';
                ctx.font = '18px sans-serif';
                for (const [i, enabled] of [false, true].entries()) {
                    const row = s.capture(enabled, false), x = Math.round(row.center[0]) - 200, y = Math.round(row.center[1]) - 160;
                    ctx.drawImage(source, x, y, 400, 268, i * 400, 32, 400, 268);
                    ctx.fillText(`${i ? 'HD' : 'Original'}: ${label}`, i * 400 + 8, 23);
                    if (enabled)
                        trace.push({ stage: label, t: s.time, destroyed: s.unit.isDestroyed, active: row.active, disposed: s.r.rhinoHd.disposed,
                            visible: s.r.mainObj.visible, y: s.r.mainObj.position.y, clipping: row.clipping, opacity: row.opacity,
                            pose: row.pose, light: row.light, gl: row.glError });
                }
                await new Promise(resolve => setTimeout(resolve, 65));
            }
            s.time = time + duration;
        }
        const sink = { tile: s.sinkTile, disposed: s.r.rhinoHd.disposed, mainVisible: s.r.mainObj.visible, y: s.r.mainObj.position.y };
        d.renderableManager.createTransientAnim = nativeAnim;
        const data = await new Promise(resolve => { recorder.onstop = () => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); }; recorder.stop(); });
        return { data, trace, effects, sink, originalDisposed: oldR.rhinoHd.disposed, refs: [...pack.parts.values()].map(p => p.refs) };
    });
    await fs.writeFile(`${output}/states.webm`, Buffer.from(result.data.split(',')[1], 'base64'));
    delete result.data;
    await fs.writeFile(`${output}/animation.json`, JSON.stringify(result, null, 2));
    assert(result.trace.every(r => r.gl === 0));
    assert(result.originalDisposed);
    assert(result.effects.some(e => e.stage.startsWith('Native explosion')));
    assert(result.effects.some(e => e.stage.startsWith('Temporal removal')));
    assert(result.sink.disposed, 'Native sinking must finish and release Rhino layers');
    return { frames: result.trace.length, sink: result.sink, effects: result.effects };
}

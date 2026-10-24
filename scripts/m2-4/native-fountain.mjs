import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const original = process.argv.includes('--original'), density = process.argv.includes('--2x') ? 2 : 4;
const s = await startSession(receipt, output, process.argv.includes('--ra2') ? 'ra2' : 'yr', false, async ({ page }) => {
    await page.evaluate(({ original, density }) => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = !original; graphics.hdDensity.value = density;
    }, { original, density });
});
let failure;
try {
    s.report.fountain = await s.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        clearInterval(window.__allied.timer);
        const placed = g.getWorld().getAllObjects().filter(o => o.name === 'CAWASH18');
        const unit = placed[0] ?? window.__allied.building('CAWASH18', undefined, g.getAllPlayers().find(p => p.isNeutral));
        window.__fountain = unit;
        d.worldInteraction.minimapHandler.panToTile(unit.tile);
        return { existing: placed.length, tile: [unit.tile.rx, unit.tile.ry], density: d.environmentHd?.density };
    });
    await s.page.waitForTimeout(300);
    s.report.frames = [];
    for (let frame = 0; frame < 10; frame++) {
        const result = await s.page.evaluate(({ frame, hideBase }) => {
            const d = window.__ra2debug;
            d.gameScreen.gameAnimationLoop.stop();
            const r = d.renderableManager.getRenderableByGameObject(window.__fountain);
            const active = r.animObjects.get(2)[0], animation = r.animations.get(active);
            animation.frameNo = frame; animation.state = 4;
            d.renderer.update(performance.now(), 0);
            if (hideBase) r.mainObj.get3DObject().visible = false;
            d.renderer.render();
            const c = d.renderer.getCanvas(), v = d.worldScene.viewport;
            const p = r.getPosition().clone().project(d.worldScene.camera), ratio = c.width / d.renderer.width;
            const x = (v.x + (p.x + 1) * v.width / 2) * ratio;
            const y = (v.y + (1 - p.y) * v.height / 2) * ratio;
            const detail = document.createElement('canvas'); detail.width = 360; detail.height = 320;
            const source = [Math.round(x - 180), Math.round(y - 170), 360, 320];
            detail.getContext('2d').drawImage(c, ...source, 0, 0, 360, 320);
            return { png: detail.toDataURL('image/png').split(',')[1], frame: active.builder.getFrame(),
                source, baseVisible: r.mainObj.get3DObject().visible, activeVisible: active.get3DObject().visible,
                activeHd: !!active.builder.hdOverride, mainHd: !!r.mainObj.builder.hdOverride,
                offsets: [r.mainObj.builder.offset, active.builder.offset],
                sizes: [r.mainObj.builder.shpSize, active.builder.shpSize],
                glError: d.renderer.renderer.getContext().getError() };
        }, { frame, hideBase: process.argv.includes('--hide-base') });
        assert.equal(result.glError, 0);
        assert.equal(result.frame, frame);
        if (!original) assert(result.activeHd && result.mainHd);
        if (process.argv.includes('--expect-repair')) assert.equal(result.baseVisible, original,
            'HD water is the complete fountain; Original retains its native layer arrangement');
        const file = `frame-${frame}.png`;
        await fs.writeFile(path.join(s.out, file), Buffer.from(result.png, 'base64'));
        delete result.png;
        s.report.frames.push({ ...result, file });
    }
    s.report.status = 'PASS_NATIVE_FOUNTAIN_FRAME_CAPTURE';
    await fs.writeFile(path.join(s.out, 'fountain.json'), JSON.stringify(s.report, null, 2) + '\n');
    console.log(JSON.stringify({ status: s.report.status, ...s.report.fountain, original, density }));
} catch (error) { failure = error; }
await s.close(failure);
if (failure) throw failure;

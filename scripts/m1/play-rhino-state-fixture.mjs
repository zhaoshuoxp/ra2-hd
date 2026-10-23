import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
// Diagnostic controls change transient fixture state only; no renderer is injected.
export async function playRhinoStateFixture(page, output) {
    await page.evaluate(() => {
        const d = window.__ra2debug, s = window.__states;
        const bar = document.createElement('div');
        bar.style.cssText = 'position:fixed;left:12px;top:12px;z-index:10000;background:#202328;color:white;padding:12px;font:16px sans-serif;max-width:940px;border:1px solid #aaa';
        const title = document.createElement('div');
        title.textContent = 'Rhino state review — real engine, controlled fixture, reference height 900';
        bar.append(title);
        const reset = () => { s.unit.owner = s.owner ?? d.localPlayer; s.unit.cloakableTrait?.uncloak(d.game); s.unit.invulnerableTrait.timer.reset(); s.unit.warpedOutTrait.expire(d.game); };
        const button = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'margin:6px 5px 0 0;padding:7px;font:16px sans-serif'; b.onclick = fn; bar.append(b); };
        s.enabled = true;
        button('Original', () => s.enabled = false);
        button('HD', () => s.enabled = true);
        button('Flat / restore', () => { reset(); s.move(s.flat); });
        s.ramps.forEach(t => button(`Ramp ${t.rampType}`, () => { reset(); s.move(t); }));
        button('Rock', () => s.r.startRocking(90, 0.9, s.time));
        button('High bridge', () => { reset(); s.move(s.high, d.game.map.tileOccupation.getBridgeOnTile(s.high)); });
        button('Under bridge', () => { reset(); s.move(s.high); });
        button('Low bridge', () => { reset(); s.move(s.low, d.game.map.tileOccupation.getBridgeOnTile(s.low)); });
        button('Elevated', () => { reset(); s.move(s.flat); s.unit.position.tileElevation = 3; s.r.setPosition(s.unit.position.worldPosition); });
        button('Warp', () => { reset(); s.move(s.flat); s.unit.warpedOutTrait.setActive(true, true, d.game); });
        button('Iron Curtain', () => { reset(); s.move(s.flat); s.unit.invulnerableTrait.setActiveFor(600, d.game); });
        button('Own cloak', () => { reset(); s.move(s.flat); s.unit.cloakableTrait.isActive = true; });
        button('Enemy cloak', () => { reset(); s.move(s.flat); s.unit.owner = d.game.getCombatants().find(p => p !== d.localPlayer && !d.game.alliances.haveSharedIntel(d.localPlayer, p)); s.unit.cloakableTrait.isActive = true; });
        document.body.append(bar);
        reset();
        s.move(s.flat);
        const clock = performance.now(), base = s.time;
        const draw = () => { s.time = base + performance.now() - clock; s.capture(s.enabled, false); requestAnimationFrame(draw); };
        draw();
    });
    if (process.env.M13G_CONTROLS_CHECK === '1') {
        const rows = [];
        for (const label of ['Original', 'HD', 'Ramp 1', 'Ramp 2', 'Ramp 3', 'Ramp 4', 'Rock', 'High bridge', 'Under bridge', 'Low bridge', 'Elevated', 'Warp', 'Iron Curtain', 'Own cloak', 'Enemy cloak', 'Flat / restore']) {
            await page.getByRole('button', { name: label, exact: true }).click();
            await page.waitForTimeout(100);
            const row = await page.evaluate(() => { const s = window.__states; return { active: s.r.rhinoHd.active, visible: s.r.get3DObject().visible, ramp: s.unit.tile.rampType, onBridge: s.unit.onBridge, opacity: s.r.rhinoHd.originals[0].opacity, gl: window.__ra2debug.renderer.renderer.getContext().getError() }; });
            assert.equal(row.active, label !== 'Original');
            assert.equal(row.visible, label !== 'Enemy cloak');
            assert.equal(row.gl, 0);
            rows.push({ label, ...row });
        }
        await fs.writeFile(`${output}/controls.json`, JSON.stringify({ status: 'PASS', rows }, null, 2));
        await page.close();
        return;
    }
    console.log('State review ready. Use Original / HD and state buttons. Close the browser to finish.');
    await new Promise(resolve => page.once('close', resolve));
}

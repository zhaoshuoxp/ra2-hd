// Exercise shared concrete bridge art at native standing, broken and repaired states.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function validateBridgeContacts(session) {
    const { page, out, report, stage } = session;
    report.bridges = [];
    const huts = await page.evaluate(() => window.__ra2debug.game.getWorld().getAllObjects()
        .filter(o => o.cabHutTrait?.getBridgePieces()?.some(p => /^BRIDGE\d|^LOBRDB/.test(p.obj.name)))
        .map(o => ({ id: o.id, kind: o.cabHutTrait.getBridgePieces()[0].obj.isHighBridge() ? 'high' : 'low' })));
    for (const kind of ['high', 'low']) {
        const hut = huts.find(h => h.kind === kind);
        if (!hut) continue;
        const result = { kind, hut: hut.id, stages: [] };
        await page.evaluate(id => {
            const d = window.__ra2debug;
            window.__contactHut = d.game.getWorld().getAllObjects().find(o => o.id === id);
            const pieces = window.__contactHut.cabHutTrait.getBridgePieces();
            window.__contactPiece = pieces[Math.floor(pieces.length/2)].obj;
            window.__allied.actor = window.__contactPiece;
            window.__allied.detailSize = [1280, 960];
            d.worldInteraction.minimapHandler.panToTile(window.__contactPiece.tile);
            window.__contactBinding = () => window.__contactHut.cabHutTrait.getBridgePieces().map(p => {
                const o = p.obj, r = d.renderableManager.getRenderableByGameObject(o);
                const sprite = r?.mainRenderable ?? r?.mainObj ?? r?.shpRenderable;
                return { name: o.name, health: o.healthTrait.health,
                    spawned: o.isSpawned, destroyed: o.isDestroyed,
                    hd: sprite?.builder?.hdOverride?.identity,
                    invisible: o.isBridgePlaceholder?.() && (!r || r.isInvisible),
                    frame: sprite?.builder?.getFrame() };
            });
        }, hut.id);
        for (const state of ['standing', 'damaged', 'demolished', 'repaired']) {
            if (state === 'damaged') await page.evaluate(() => {
                const d = window.__ra2debug, o = window.__contactPiece;
                o.healthTrait.inflictDamage(Math.floor(o.healthTrait.maxHitPoints*.6), o, d.game);
            });
            if (state === 'demolished') await page.evaluate(() => window.__contactHut.cabHutTrait
                .demolishBridge(window.__ra2debug.game, { player: window.__ra2debug.localPlayer }));
            if (state === 'repaired') {
                await page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied;
                    f.contactEngineer = f.spawn('ENGINEER', 3, window.__contactHut.tile);
                    d.actionsApi.orderUnits([f.contactEngineer.id], 15, window.__contactHut.id);
                });
                await page.waitForFunction(() => !window.__contactHut.cabHutTrait.canRepairBridge(), undefined, { timeout: 45000 });
            }
            await page.waitForTimeout(200);
            const bindings = await page.evaluate(() => window.__contactBinding());
            assert(bindings.every(p => p.hd || p.invisible || !p.spawned),
                'Spawned concrete bridge lost complete HD: ' + JSON.stringify(bindings));
            await stage(`${kind}-bridge-${state}`);
            const png = await page.evaluate(() => {
                const d = window.__ra2debug;
                d.renderer.render(); return d.renderer.renderer.domElement.toDataURL().split(',')[1];
            });
            await fs.writeFile(path.join(out, `${kind}-bridge-${state}-framebuffer.png`), Buffer.from(png, 'base64'));
            result.stages.push({ state, bindings });
            if (state === 'standing' || state === 'demolished') {
                await page.evaluate(() => {
                    const d = window.__ra2debug;
                    window.__allied.actor = window.__contactHut;
                    d.worldInteraction.minimapHandler.panToTile(window.__contactHut.tile);
                });
                await page.waitForTimeout(200);
                await stage(`${kind}-bridge-${state === 'standing' ? 'approach' : 'pier-water'}`);
                await page.evaluate(() => {
                    const d = window.__ra2debug;
                    window.__allied.actor = window.__contactPiece;
                    d.worldInteraction.minimapHandler.panToTile(window.__contactPiece.tile);
                });
                await page.waitForTimeout(200);
            }
        }
        report.bridges.push(result);
    }
    assert(report.bridges.length, 'No native concrete repair hut encountered');
}

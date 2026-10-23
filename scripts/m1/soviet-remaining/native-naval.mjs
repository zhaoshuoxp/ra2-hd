import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function exercise(page, output) {
    const report = { status: 'RUNNING', fixture: 'Native initial MCV moves to coastal land before deployment; native power-plant expansion and legal naval placement', placements: [] };
    const save = () => fs.writeFile(path.join(output, 'naval.json'), JSON.stringify(report, null, 2));
    report.coastalMove = await page.evaluate(() => {
        const d = window.__ra2debug; d.localPlayer.credits += 20000;
        const mcv = d.localPlayer.getOwnedObjects().find(u => u.name === 'SMCV');
        const art = d.game.art.getObject('NACNST', 2);
        const candidates = [], at = (x, y) => d.game.map.tiles.getByMapCoords(x, y);
        const clear = (x, y, size, water) => {
            for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
                const tile = at(x + i, y + j);
                if (!tile || !d.game.map.isWithinBounds(tile) || d.game.map.getGroundObjectsOnTile(tile).some(u => !u.isSmudge())) return false;
                const land = d.game.rules.getLandRules(tile.landType);
                if (water ? land.getSpeedModifier(4) <= 0 : !land.buildable || tile.rampType !== 0) return false;
            }
            return true;
        };
        for (let x = mcv.tile.rx - 25; x <= mcv.tile.rx + 25; x++) for (let y = mcv.tile.ry - 25; y <= mcv.tile.ry + 25; y++) {
            if (!clear(x, y, 4, true)) continue;
            for (let dx = -5; dx <= 5; dx++) for (let dy = -5; dy <= 5; dy++) {
                if (clear(x + dx, y + dy, art.foundation.width, false)) candidates.push({
                    rx: x + dx + art.foundationCenter.x, ry: y + dy + art.foundationCenter.y, water: [x, y] });
            }
        }
        candidates.sort((a, b) => Math.hypot(a.rx - mcv.tile.rx, a.ry - mcv.tile.ry) - Math.hypot(b.rx - mcv.tile.rx, b.ry - mcv.tile.ry));
        if (!candidates.length) throw Error('No coastal deployment terrain found');
        const target = candidates[0]; window.__navalMcv = mcv;
        d.actionsApi.orderUnits([mcv.id], 0, target.rx, target.ry);
        return { from: [mcv.tile.rx, mcv.tile.ry], target };
    });
    await save();
    await page.waitForFunction(t => window.__navalMcv.tile.rx === t.rx && window.__navalMcv.tile.ry === t.ry, report.coastalMove.target, { timeout: 60000 });
    await page.waitForTimeout(600);
    report.deployable = await page.evaluate(() => {
        const d = window.__ra2debug, u = window.__navalMcv;
        return d.game.getConstructionWorker(d.localPlayer).canPlaceAt('NACNST', u.tile, { ignoreObjects: [u] });
    });
    assert(report.deployable, 'Native MCV deployment rejected at coastal target');
    await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__navalMcv.id], 10));
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === 'NACNST'));
    for (let attempt = 0; attempt < 8; attempt++) {
        const proposal = await page.evaluate(() => {
            const d = window.__ra2debug, yard = d.localPlayer.getOwnedObjects().find(u => u.name === 'NACNST');
            const worker = d.game.getConstructionWorker(d.localPlayer), tiles = [];
            for (let x = -35; x <= 35; x++) for (let y = -35; y <= 35; y++) tiles.push({ rx: yard.tile.rx + x, ry: yard.tile.ry + y });
            tiles.sort((a, b) => Math.hypot(a.rx - yard.tile.rx, a.ry - yard.tile.ry) - Math.hypot(b.rx - yard.tile.rx, b.ry - yard.tile.ry));
            const missing = ['NAPOWR', 'NAREFN'].find(name => !d.localPlayer.getOwnedObjects().some(u => u.name === name));
            if (missing) {
                const tile = tiles.find(t => worker.canPlaceAt(missing, t, { normalizedTile: true }));
                if (!tile) throw Error(`No legal coastal prerequisite foundation: ${missing}`);
                return { name: missing, tile };
            }
            const naval = tiles.find(t => worker.canPlaceAt('NAYARD', t, { normalizedTile: true }));
            if (naval && d.localPlayer.production.isAvailableForProduction(d.game.rules.getBuilding('NAYARD'))) return { name: 'NAYARD', tile: naval };
            const water = tiles.find(t => worker.canPlaceAt('NAYARD', t, { normalizedTile: true, ignoreAdjacent: true }));
            if (!water) throw Error('No visible water foundation; exploration fixture must be extended');
            const land = tiles.filter(t => worker.canPlaceAt('NAPOWR', t, { normalizedTile: true }));
            land.sort((a, b) => Math.hypot(a.rx - water.rx, a.ry - water.ry) - Math.hypot(b.rx - water.rx, b.ry - water.ry));
            if (!land.length) throw Error('No legal power expansion toward water');
            return { name: 'NAPOWR', tile: land[0], waterTarget: water };
        });
        await page.evaluate(p => window.__ra2debug.actionsApi.queueForProduction(0, 2, p.name, 1), proposal);
        await page.waitForFunction(() => window.__ra2debug.localPlayer.production.getQueue(0).status === 3, undefined, { timeout: 90000 });
        await page.evaluate(p => window.__ra2debug.actionsApi.placeBuilding(p.name, p.tile.rx, p.tile.ry), proposal);
        await page.waitForFunction(p => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === p.name && u.tile.rx === p.tile.rx && u.tile.ry === p.tile.ry), proposal);
        await page.waitForTimeout(1600);
        report.placements.push(proposal); await save(); console.log('Coastal placement', proposal);
        if (proposal.name === 'NAYARD') break;
    }
    assert(report.placements.some(p => p.name === 'NAYARD'), 'No legal naval placement after eight expansions');
    await page.evaluate(() => {
        const d = window.__ra2debug, yard = d.localPlayer.getOwnedObjects().find(u => u.name === 'NAYARD');
        d.worldInteraction.minimapHandler.panToTile(yard.tile);
        window.__navalTrace = [];
        window.__navalAnimationEvents = [];
        const renderable = d.renderableManager.getRenderableByGameObject(yard), nativeSetAnimation = renderable.setAnimation;
        renderable.setAnimation = function(type, time) {
            window.__navalAnimationEvents.push({ tick: d.game.currentTick, type, time });
            return nativeSetAnimation.call(this, type, time);
        };
        window.__navalTimer = setInterval(() => {
            const r = d.renderableManager.getRenderableByGameObject(yard);
            window.__navalTrace.push({ tick: d.game.currentTick, anim: r.currentAnimType,
                factoryType: yard.factoryTrait.type, factoryStatus: yard.factoryTrait.status, powered: r.powered,
                hd: !!r.mainObj.builder.hdOverride,
                visible: [...r.animObjects].flatMap(([type, ms]) => ms.filter(m => m.get3DObject().visible).map(m => ({ type, frame: m.builder.getFrame() }))) });
        }, 80);
        d.actionsApi.queueForProduction(5, 7, 'SUB', 2);
    });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().filter(u => u.name === 'SUB').length >= 2, undefined, { timeout: 90000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(output, 'native-shipyard-production.png') });
    report.trace = await page.evaluate(() => { clearInterval(window.__navalTimer); return window.__navalTrace; });
    report.animationEvents = await page.evaluate(() => window.__navalAnimationEvents);
    await save();
    assert(report.trace.every(t => t.hd)); assert(report.animationEvents.some(t => t.type === 1), 'Native shipyard production animation not observed');
    report.status = 'PASS_NATIVE_LEGAL_SHIPYARD_AND_SUBMARINE_PRODUCTION'; await save(); return report;
}

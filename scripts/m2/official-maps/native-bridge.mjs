// Verify selected bridge families through unchanged native bridge mechanics.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function validateNativeBridge(session, bridgeKind) {
    assert(!bridgeKind || ['low-concrete', 'low-wood', 'high-concrete', 'high-wood'].includes(bridgeKind));
    const { page, report, out, startClip, stopClip } = session;
    const result = report.newNativeBridge = {};
    const label = bridgeKind ?? 'wood';
    if (bridgeKind) result.kind = bridgeKind;
    const capture = async label => {
        await page.evaluate(() => {
            const d = window.__ra2debug;
            if (!window.__m24BridgeCaptureTile) {
                const pieces = window.__m23BridgeHut.cabHutTrait.getBridgePieces();
                window.__m24BridgeCaptureTile = pieces[Math.floor(pieces.length / 2)].obj.tile;
            }
            // Demolition can remove every piece; retain its original map tile.
            d.worldInteraction.minimapHandler.panToTile(window.__m24BridgeCaptureTile);
        });
        // The native camera applies pan requests on its next update.
        await page.waitForTimeout(150);
        const png = await page.evaluate(() => {
            const d = window.__ra2debug;
            d.renderer.render(); return d.renderer.renderer.domElement.toDataURL().split(',')[1];
        });
        await fs.writeFile(path.join(out, `${label}-framebuffer.png`), Buffer.from(png, 'base64'));
    };
    result.standing = await page.evaluate(bridgeKind => {
        const d = window.__ra2debug;
        window.__m24BridgeCaptureTile = undefined;
        const patterns = { 'low-wood': /^LOBRDG\d+$/, 'low-concrete': /^LOBRDB\d+$/,
            'high-wood': /^BRIDGEB[12]$/, 'high-concrete': /^BRIDGE[12]$/ };
        const pattern = bridgeKind ? patterns[bridgeKind] : /^BRIDGE?B/;
        const hut = d.game.getWorld().getAllObjects().find(object => object.cabHutTrait?.getBridgePieces()
            ?.some(piece => pattern.test(piece.obj.name)) && (!bridgeKind ||
                object.cabHutTrait.getBridgePieces().some(piece => piece.obj.healthTrait?.health > 80)));
        if (!hut) return { status: bridgeKind ? 'NO_NATIVE_REQUESTED_BRIDGE_REPAIR_HUT' : 'NO_NATIVE_HIGH_BRIDGE_REPAIR_HUT',
            requestedKind: bridgeKind, policy: 'Do not add a bridge or repair hut to manufacture a gameplay pass.' };
        window.__m23BridgeHut = hut;
        const pieces = hut.cabHutTrait.getBridgePieces();
        window.__m23BridgePiece = bridgeKind
            ? pieces.filter(piece => piece.obj.healthTrait?.health > 80)[
                Math.floor(pieces.filter(piece => piece.obj.healthTrait?.health > 80).length / 2)].obj
            : pieces[Math.floor(pieces.length / 2)].obj;
        return { hut: window.__m23Binding(hut), pieces: pieces.map(piece => ({ ...window.__m23Binding(piece.obj),
            invisible: piece.obj.isBridgePlaceholder?.() && d.renderableManager.getRenderableByGameObject(piece.obj)?.isInvisible })) };
    }, bridgeKind);
    if (!result.standing.hut) { result.status = result.standing.status; return; }
    assert(result.standing.pieces.every(piece => piece.hd || piece.invisible));
    if (bridgeKind && await page.evaluate(() => window.__m23BridgeHut.cabHutTrait.canRepairBridge())) {
        result.originalInitial = result.standing;
        await capture(`${label}-bridge-original-initial`);
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, hut = window.__m23BridgeHut;
            f.initialBridgeEngineer = f.spawn('ENGINEER', 3, hut.tile);
            d.actionsApi.orderUnits([f.initialBridgeEngineer.id], 15, hut.id);
        });
        await page.waitForFunction(() => !window.__m23BridgeHut.cabHutTrait.canRepairBridge(), undefined, { timeout: 45000 });
        result.initialRepair = await page.evaluate(() => ({ engineerConsumed: !window.__allied.initialBridgeEngineer.isSpawned,
            pieces: window.__m23BridgeHut.cabHutTrait.getBridgePieces().map(piece => window.__m23Binding(piece.obj)) }));
        assert(result.initialRepair.engineerConsumed);
        result.standing = await page.evaluate(() => {
            const d = window.__ra2debug, pieces = window.__m23BridgeHut.cabHutTrait.getBridgePieces();
            const healthy = pieces.filter(piece => piece.obj.healthTrait?.health > 80);
            window.__m23BridgePiece = healthy[Math.floor(healthy.length / 2)].obj;
            return { hut: window.__m23Binding(window.__m23BridgeHut), pieces: pieces.map(piece => ({
                ...window.__m23Binding(piece.obj), invisible: piece.obj.isBridgePlaceholder?.() &&
                    d.renderableManager.getRenderableByGameObject(piece.obj)?.isInvisible })) };
        });
        assert(result.standing.pieces.every(piece => piece.hd || piece.invisible));
    }
    await startClip(); await capture(`${label}-bridge-standing`);
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied, pieces = window.__m23BridgeHut.cabHutTrait.getBridgePieces();
        f.bridgeVehicle = f.spawn('MTNK', 7, pieces[0].obj.tile); f.bridgeDestination = pieces.at(-1).obj.tile;
        window.__m23BridgeTrace = [];
        window.__m23BridgeTimer = setInterval(() => window.__m23BridgeTrace.push({ tick: d.game.currentTick,
            tile: [f.bridgeVehicle.tile.rx, f.bridgeVehicle.tile.ry], onBridge: f.bridgeVehicle.onBridge,
            bridge: d.game.map.tileOccupation.getBridgeOnTile(f.bridgeVehicle.tile)?.name,
            hd: f.sample(f.bridgeVehicle).vxlHd }), 50);
        d.actionsApi.orderUnits([f.bridgeVehicle.id], 0, f.bridgeDestination.rx, f.bridgeDestination.ry);
    });
    await page.waitForFunction(() => window.__allied.bridgeVehicle.tile === window.__allied.bridgeDestination
        && !window.__allied.bridgeVehicle.isMoving, undefined, { timeout: 45000 });
    result.passage = await page.evaluate(() => {
        const f = window.__allied; clearInterval(window.__m23BridgeTimer);
        window.__ra2debug.game.unspawnObject(f.bridgeVehicle); return window.__m23BridgeTrace;
    });
    if (bridgeKind?.startsWith('low-')) {
        assert(new Set(result.passage.filter(sample => sample.bridge && sample.hd)
            .map(sample => sample.tile.join(','))).size > 1, 'Native low bridge occupation must advance across distinct tiles');
    } else assert(result.passage.some(sample => sample.onBridge && sample.hd));
    await capture(`${label}-bridge-native-passage`);
    await page.evaluate(() => {
        const d = window.__ra2debug, piece = window.__m23BridgePiece;
        piece.healthTrait.inflictDamage(Math.floor(piece.healthTrait.maxHitPoints * .8), piece, d.game);
    });
    await page.waitForTimeout(500);
    result.damaged = await page.evaluate(() => window.__m23Binding(window.__m23BridgePiece));
    assert(result.damaged.hd && result.damaged.health < 50); await capture(`${label}-bridge-damaged`);
    await page.evaluate(() => window.__m23BridgeHut.cabHutTrait.demolishBridge(window.__ra2debug.game,
        { player: window.__ra2debug.localPlayer }));
    await page.waitForTimeout(700);
    result.demolished = await page.evaluate(() => ({ repairable: window.__m23BridgeHut.cabHutTrait.canRepairBridge(),
        pieces: window.__m23BridgeHut.cabHutTrait.getBridgePieces().map(piece => window.__m23Binding(piece.obj)) }));
    assert(result.demolished.repairable); await capture(`${label}-bridge-demolished`);
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied, hut = window.__m23BridgeHut;
        f.bridgeEngineer = f.spawn('ENGINEER', 3, hut.tile); d.actionsApi.orderUnits([f.bridgeEngineer.id], 15, hut.id);
    });
    await page.waitForFunction(() => !window.__m23BridgeHut.cabHutTrait.canRepairBridge(), undefined, { timeout: 45000 });
    result.repaired = await page.evaluate(() => ({ engineerConsumed: !window.__allied.bridgeEngineer.isSpawned,
        pieces: window.__m23BridgeHut.cabHutTrait.getBridgePieces().map(piece => window.__m23Binding(piece.obj)) }));
    assert(result.repaired.engineerConsumed && result.repaired.pieces.every(piece => piece.hd));
    await capture(`${label}-bridge-repaired`); await stopClip(`${label}-bridge-native-states`);
    result.status = `PASS_NATIVE_${label.toUpperCase().replaceAll('-', '_')}_BRIDGE_PASSAGE_DAMAGE_DEMOLITION_REPAIR`;
}

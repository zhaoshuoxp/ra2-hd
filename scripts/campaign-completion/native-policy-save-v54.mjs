import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';
import { readFeedbackSource, replayFeedbackOpening } from './feedback-source-replay-v53.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';
const out = path.resolve(process.argv[2]), rally = process.argv.includes('--rally');
await fs.mkdir(out, { recursive: false });
const report = {
    status: 'RUNNING', errors: [], failedResources: [], commands: [],
    scope: rally ? 'Original Allied01 ordinary-command opening, actual factory bridge rally and paid GI arrival, named save and full app restart.'
        : 'Fresh original Allied03 support/targeting policies, normal named save, full app restart and exact 180-turn continuation. No trainer, source/rule/health/objective edit or diagnostic reveal.'
};
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 2 }));
    if (rally) {
        const source = await readFeedbackSource(path.join(import.meta.dirname, 'fixtures/all01-source-commands-v15.json'));
        report.opening = await replayFeedbackOpening(page, source, 9937, { bridgeRallyVersion: 1 });
        report.rally = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            const factory = g.localPlayer.getOwnedObjects().find(u => u.name === 'GAPILE' && u.isSpawned && !u.isDestroyed);
            if (!factory)
                throw Error('Original paid barracks is missing');
            const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const tiles = g.world.getAllObjects().filter(u => u.isOverlay() && u.isBridge() && u.isSpawned && !u.isDestroyed)
                .map(u => g.map.tiles.getByMapCoords(u.tile.rx + Number(!u.isXBridge()), u.tile.ry + Number(u.isXBridge())))
                .filter(t => t.onBridgeLandType !== undefined && !shroud.isShrouded(t, 4))
                .sort((a, b) => Math.hypot(a.rx - factory.tile.rx, a.ry - factory.tile.ry) - Math.hypot(b.rx - factory.tile.rx, b.ry - factory.tile.ry));
            if (!tiles.length)
                throw Error('Original repaired bridge has no visible deck');
            const target = tiles[0];
            window.__rallyFactoryId = factory.id;
            const before = g.localPlayer.getOwnedObjects().filter(u => u.name === 'E1').map(u => u.id);
            const handler = d.worldInteraction.defaultActionHandler;
            const bridge = g.map.tileOccupation.getBridgeOnTile(target);
            handler.update({ tile: target, bridgeTile: target, gameObject: bridge }, [factory], false, {}, false);
            const pointer = {
                type: handler.getPointerType(false), speed: factory.rules.speedType,
                valid: handler.mostSignificantAction?.isValid(), allowed: handler.mostSignificantAction?.isAllowed()
            };
            d.actionsApi.orderUnits([factory.id], 0, target.rx, target.ry);
            return { factoryId: factory.id, target: [target.rx, target.ry], before, pointer };
        });
        await stepWorld(page, 1);
        const marker = await page.evaluate(() => {
            const factory = window.__ra2debug.game.world.getAllObjects().find(u => u.id === window.__rallyFactoryId);
            const point = factory.rallyTrait.getRallyPoint();
            return [point.rx, point.ry];
        });
        assert.deepEqual(marker, report.rally.target);
        report.rally.marker = marker;
        assert.equal(report.rally.pointer.type, 31, 'Bridge rally must expose the ordinary valid Move pointer');
        await new OrdinaryCampaignCommands(page, report).queue('E1', 1);
        for (let tick = 0; tick < 2400 && !report.rally.arrival; tick += 90) {
            await stepWorld(page, 90);
            report.rally.arrival = await page.evaluate(({ before, target }) => window.__ra2debug.game.localPlayer.getOwnedObjects()
                .filter(u => u.name === 'E1' && u.isSpawned && !u.isDestroyed && !before.includes(u.id)
                && u.onBridge && Math.hypot(u.tile.rx - target[0], u.tile.ry - target[1]) < 2)
                .map(u => ({ id: u.id, tile: [u.tile.rx, u.tile.ry], onBridge: u.onBridge }))[0], report.rally);
        }
        assert(report.rally.arrival, 'Paid GI never arrived on the original bridge deck');
        await page.evaluate(tile => { const d = window.__ra2debug; d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(...tile)); }, report.rally.target);
        await page.screenshot({ path: path.join(out, 'native-paid-bridge-rally-arrival.png') });
    }
    else {
        await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('all03u.map'));
        await waitWorld(page, 'all03u.map');
        await stepWorld(page, 1200);
    }
    report.launch = await page.evaluate(() => window.__ra2debug.game.campaign.launch);
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report, 'V54 Native Policy', stepWorld, async ({ page }, checkpoint) => {
        assert.equal(checkpoint.options.campaign.bridgeRallyVersion, 1);
        if (!rally) {
            assert.equal(checkpoint.options.campaign.teamRecruitmentVersion, 1);
            for (const key of ['demolitionSafetyVersion', 'neutralStructureTargetingVersion', 'retaliationVersion', 'parasiteCadenceVersion'])
                assert.equal(checkpoint.options.campaign[key], 1);
            assert.equal(checkpoint.options.campaign.civilianTargetingVersion, 2);
        }
        report.restoredLaunch = await page.evaluate(() => window.__ra2debug.game.campaign.launch);
        assert.deepEqual(report.restoredLaunch, report.launch);
    }));
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedResources, []);
    report.status = rally ? 'PASS_REAL_PAID_BRIDGE_RALLY_AND_FULL_PROCESS_SAVE_CONTINUATION'
        : 'PASS_NEW_ORIGINAL_SUPPORT_POLICIES_FULL_PROCESS_SAVE_CONTINUATION';
}
catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => { });
}
finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close().catch(() => { });
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));

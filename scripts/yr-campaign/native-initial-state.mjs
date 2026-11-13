import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], process.argv[3]);
let failure;
try {
    await pilot.open();
    pilot.report.initialLandmarks = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        return g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
            && unit.isBuilding()).map(unit => ({ id: unit.id, name: unit.name, owner: unit.owner.name,
            tile: [unit.tile.rx, unit.tile.ry], capturable: unit.rules.capturable }));
    });
    await pilot.checkpoint('original-unlocked-checkpoint.json');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_INITIAL_STATE_NOT_FULL_OBJECTIVE_ACCEPTANCE';
} catch (error) { failure = error; }
await pilot.finish(failure);

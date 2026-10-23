// Validate accepted artwork independently of the existing non-neutral map-owner filter.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { validateNativeNeutralVehicles } from '../m2/official-maps/native-neutral-vehicles.mjs';

const [stage, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
assert(process.argv.includes('--map=rushhr.map') && process.argv.includes('--edition=yr'));
const source = JSON.parse(await fs.readFile('.artifacts/m2-4/newurban-native-v1/source.json'));
const inventory = JSON.parse(await fs.readFile(source.inventoryFile));
const map = inventory.maps.find(row => row.mapId === 'yr:rushhr.map');
const session = await startSession(stage, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true;
        graphics.hdDensity.value = density;
    }, density);
});
let failure;
try {
    const { page, report } = session;
    const observed = await page.evaluate(() => {
        const game = window.__ra2debug.game;
        return { sourceSha256: game.officialSkirmishSourceSha256,
            sourceObjects: game.map.getInitialMapObjects().technos.filter(o => o.name === 'CIVP')
                .map(o => ({ name: o.name, owner: o.owner, rx: o.rx, ry: o.ry, health: o.health })),
            actual: game.getWorld().getAllObjects().filter(o => o.name === 'CIVP').map(o => ({
                name: o.name, owner: o.owner.name, spawned: o.isSpawned, destroyed: o.isDestroyed })) };
    });
    assert.equal(observed.sourceSha256, map.source.sha256);
    assert.deepEqual(observed.sourceObjects.map(o => [o.owner, o.rx, o.ry, o.health]),
        [['Americans', 81, 145, 256], ['Americans', 79, 148, 256], ['Americans', 78, 152, 256]]);
    assert.deepEqual(observed.actual, []);
    const loaderFile = 'src/game/Game.ts', bytes = await fs.readFile(loaderFile);
    assert(bytes.toString().includes('if (!(owner as any).isNeutral) {\n                continue;'));
    report.sourcePlacementDiagnostic = { status: 'CONFIRMED_EXISTING_NON_NEUTRAL_MAP_OWNER_FILTER',
        mapId: map.mapId, ...observed, loaderFile,
        loaderSha256: createHash('sha256').update(bytes).digest('hex'),
        placementStatus: 'UNRESOLVED_ORIGINAL_OBJECT_LOADING_GAP_NOT_A_MODE_OR_HD_RESOURCE_FAILURE',
        policy: 'Keep all source objects and house labels unchanged. The following legal native action fixtures prove only HD bindings, bearings and actions; they do not establish original map placement recovery.' };
    const declarations = JSON.parse(await fs.readFile('desktop/environment-newurban-hd-contract.json')).vxl;
    await validateNativeNeutralVehicles(session, ['CIVP'], declarations, density, { fixtureOnly: ['CIVP'] });
    report.windows = 'NOT_RUN';
    report.m24Complete = false;
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;

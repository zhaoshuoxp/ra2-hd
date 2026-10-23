// Observe the exact original Desert mobile-home states before authoring different slots.
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { installNativeObjectBindings } from '../m2/official-maps/native-object-bindings.mjs';
import { validateNativeStates } from '../m2/official-maps/native-states.mjs';

const [receipt, output] = process.argv.slice(2);
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
});
let failure;
try {
    assert.equal(session.report.selectedMap, 'sedonapass.map');
    await installNativeObjectBindings(session.page);
    await validateNativeStates(session, ['CAHSE06'], { CAHSE06: 4 }, false,
        { originalRenderer: true, originalPalette: 'native' });
    const [row] = session.report.newNativeStates.buildings;
    assert.equal(row.normal.name, 'CAHSE06');
    assert.equal(row.occupied.frame, 2);
    assert.equal(row.destroyed.rubble.frame, 3);
    assert(!row.normal.hd && !row.occupied.hd && !row.destroyed.rubble.hd);
    session.report.disclosure = 'Untouched Original renderer, original Desert source and palette, legal duplicate foundation, native garrison/evacuation/damage/destruction. Observe actual source colors before authoring the different occupied/rubble states. No new HD or palette adaptation is applied.';
    session.report.preflightStatus = 'PASS_ORIGINAL_DESERT_HOUSE_STATES_OBSERVED_NO_RESOURCE_CHANGE';
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;

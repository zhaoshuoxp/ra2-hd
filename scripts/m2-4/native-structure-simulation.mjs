// Measure native tick progression separately from the completed visual capture matrix.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [stage, output] = process.argv.slice(2);
assert(stage && output);
const originalArgs = [...process.argv];
await fs.mkdir(output);
for (const [theater, map] of [['NEWURBAN', 'fight.map'], ['DESERT', 'dryheat.map']]) {
    process.argv = [...originalArgs, '--map=' + map, '--bot-slot=1'];
    const session = await startSession(stage, path.join(output, theater.toLowerCase()), 'yr', false,
        async ({ page }) => page.evaluate(() => {
            window.__ra2debug.generalOptions.graphics.hdEnabled.value = true;
            window.__ra2debug.generalOptions.graphics.hdDensity.value = 4;
        }));
    let failure;
    try {
        const before = await session.page.evaluate(() => window.__ra2debug.game.currentTick);
        await session.page.waitForFunction(before => window.__ra2debug.game.currentTick >= before + 12,
            before, { timeout: 15000 });
        const after = await session.page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
            status: window.__ra2debug.game.status, environmentDensity: window.__ra2debug.environmentHd.density,
            terrainDensity: window.__ra2debug.terrainHd.density,
            glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
        assert(after.tick >= before + 12 && after.status === 1 && after.environmentDensity === 4
            && after.terrainDensity === 4 && after.glError === 0);
        session.report.nativeSimulation = { status: 'PASS_NATIVE_TICK_PROGRESSION', theater, map,
            before, after, boundary: 'Native simulation advancement with original map and existing inspection fixtures.' };
        console.log(JSON.stringify({ theater, before, after: after.tick }));
    } catch (error) { failure = error; }
    await session.close(failure);
    if (failure) throw failure;
}
process.argv = originalArgs;

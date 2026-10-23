// Verify the approved original palette through unchanged native building state transitions.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { validateNativeStates } from '../m2/official-maps/native-states.mjs';

const [receipt, output] = process.argv.slice(2);
const edition = process.argv.includes('--edition=yr') ? 'yr' : 'ra2';
const urban = process.argv.includes('--urban');
const names = ['CACITY01', 'CACITY02', 'CACITY03', 'CACITY04'];
const palette = await fs.readFile(urban
    ? '.artifacts/m2-4/urban-city-flags-native-batch57-v1/native/79e668c9bd08bc5eed811df19de2af418cf8b434b97abf1fe2d65809321507e0.pal'
    : '.artifacts/m2-4/original-palette-audit-v1/libsno.pal');
assert.equal(createHash('sha256').update(palette).digest('hex'),
    '79e668c9bd08bc5eed811df19de2af418cf8b434b97abf1fe2d65809321507e0');
process.argv.push(urban ? '--map=official-c3f4f1c670fe69ba74e35aee.map'
    : '--map=official-a4f07f9b927148f871136237.map', '--bot-slot=1');
const session = await startSession(receipt, output, edition, true, async ({ page }) => {
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
});
let failure;
try {
    const { page, report } = session;
    report.runtimeIdentity = JSON.parse(await fs.readFile(receipt));
    report.scope = 'Only the four source-pinned original library-palette buildings. Controlled legal duplicate foundations and native orders/damage; original placements, rules, geometry, ownership regions and states are unchanged.';
    await page.evaluate(palette => {
        window.__m23FixtureSites = [];
        window.__m23Binding = object => {
            const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(object);
            const b = r?.mainObj?.builder;
            const matches = r?.palette?.colors.filter((c, i) => (i < 16 || i > 31)
                && c.r === palette[i * 3] * 4 && c.g === palette[i * 3 + 1] * 4
                && c.b === palette[i * 3 + 2] * 4).length;
            return { id: object.id, name: object.name, type: object.type,
                tile: [object.tile.rx, object.tile.ry, object.tile.z], health: object.healthTrait?.health,
                owner: object.owner?.color, occupants: object.garrisonTrait?.units.length,
                frame: b?.getFrame(), hd: b?.hdOverride?.identity,
                mainMember: r?.mainShpFile?.filename, paletteType: r?.objectArt?.paletteType,
                customPaletteName: r?.objectArt?.customPaletteName, fixedPaletteMatches: matches,
                placeholder: !!r?.placeholderObj };
        };
    }, [...palette]);
    report.adaptation = await page.evaluate(() => window.__ra2debug.game.officialVisualAdaptations);
    assert.equal(report.adaptation.status, 'APPLIED_SOURCE_PINNED_ORIGINAL_LIBRARY_PALETTE');
    assert.equal(report.adaptation.members.length, 4);
    report.originalPlacements = await page.evaluate(names => window.__ra2debug.game.getWorld().getAllObjects()
        .filter(o => o.isBuilding() && names.includes(o.name)).map(window.__m23Binding), names);
    assert.deepEqual([...new Set(report.originalPlacements.map(o => o.name))].sort(), names);
    assert(report.originalPlacements.every(o => !o.placeholder && !o.hd && o.paletteType === 5
        && o.customPaletteName === 'lib' && o.fixedPaletteMatches === 240));
    if (!process.argv.includes('--bindings-only'))
        await validateNativeStates(session, names, Object.fromEntries(names.map(name => [name, 3])), false,
            { originalRenderer: true });
    report.originalFallback = await page.evaluate(() => {
        const d = window.__ra2debug;
        return { terrainCharge: d.terrainHd.worldChargeBytes, environmentCharge: d.environmentHd.worldChargeBytes,
            glError: d.renderer.renderer.getContext().getError(), tick: d.game.currentTick, status: d.game.status };
    });
    assert.equal(report.originalFallback.terrainCharge, 0);
    assert.equal(report.originalFallback.environmentCharge, 0);
    assert.equal(report.originalFallback.glError, 0);
    assert.equal(report.originalFallback.status, 1);
    assert.equal(report.errors.length, 0);
    await page.screenshot({ path: path.join(output, 'original-library-palettes.png') });
    report.paletteStatus = 'PASS_SOURCE_PINNED_ORIGINAL_LIBRARY_PALETTE';
} catch (error) { failure = error; session.report.failure = error.stack; }
await session.close(failure);
if (failure) throw failure;

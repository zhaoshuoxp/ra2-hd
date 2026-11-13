import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, stepWorld, waitWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [],
    qualification: 'Original Soviet 03 diagnostic opening and resource inspection; no mission availability or objective acceptance' };
let app, page;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, 'sov03u.map'));
    await waitWorld(page, 'sov03u.map');
    report.initial = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        return { launch: g.campaign.launch, source: g.campaign.definition.filename, issues: g.campaign.issues, tick: g.currentTick,
            houses: [...g.campaign.houses].map(([name, player]) => ({ name, country: player.country.name, countryId: player.country.id,
                credits: player.credits, handicap: player.handicap, units: player.getOwnedObjects(true).map(unit => unit.name) })),
            nodes: g.campaign.baseBuilder.nodes, actors: d.worldHdController?.getDebugStatus?.(),
            environment: d.environmentHdController?.getDebugStatus?.() };
    });
    assert.equal(report.initial.launch.semanticsVersion, 5); assert.deepEqual(report.initial.issues, []);
    await stepWorld(page, 120);
    await page.screenshot({ path: path.join(out, 'original-opening.png') });
    report.after = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        return { tick: g.currentTick, failure: g.campaign.failure, triggerTrace: g.campaign.trace, teams: g.campaign.teams.snapshot(),
            base: g.campaign.baseBuilder.snapshot(), buildTrace: g.campaign.baseBuilder.trace, media: g.campaign.captureMedia?.(),
            objects: g.world.getAllObjects().filter(object => object.isTechno()).map(object => ({ id: object.id, name: object.name,
                owner: object.owner.name, tile: [object.tile.rx, object.tile.ry], tag: object.tag, health: object.healthTrait?.health })) };
    });
    assert(!report.after.failure, report.after.failure);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET03_DIAGNOSTIC_OPENING_NOT_OBJECTIVE_ACCEPTANCE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));

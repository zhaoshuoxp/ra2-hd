// Small RA2 control case; do not replay accepted faction matrices.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../allied-units/desktop-session.mjs';
import catalog from '../../../desktop/yuri-building-coverage.json' with { type: 'json' };

const session = await startSession(process.argv[2], process.argv[3], 'ra2');
const { page, report, stage, close } = session;
let failure;
try {
    await page.evaluate(() => {
        const f = window.__allied;
        f.buildings = [f.building('GAPOWR'), f.building('NAPSIS')];
        f.units = [f.spawn('E1', 3), f.spawn('MTNK', 7)];
        f.buildings.forEach(u => f.actors[u.id] = u);
    });
    await page.waitForFunction(() => {
        const d = window.__ra2debug, f = window.__allied;
        return f.buildings.every(u => d.renderableManager.getRenderableByGameObject(u)?.mainObj?.builder?.hdOverride) &&
            f.units.every(u => f.sample(u).shpHd || f.sample(u).vxlHd);
    }, undefined, { timeout: 60000 });
    report.bindings = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        return { buildings: f.buildings.map(u => {
            const b = d.renderableManager.getRenderableByGameObject(u).mainObj.builder;
            return { name: u.name, identity: b.hdOverride.identity, size: b.getSize() };
        }), units: f.units.map(f.sample), demanded: Object.keys(d.sovietUnitsHd.families) };
    });
    assert.deepEqual(report.bindings.buildings.find(b => b.name === 'NAPSIS').size, { width: 264, height: 208 });
    for (const name of ['YAGRND', 'YAPOWR', 'YAYARD', 'YAPPET']) assert(!report.bindings.demanded.includes(name));
    const newManifests = [];
    for (const entry of Object.values(catalog)) {
        const family = JSON.parse(await fs.readFile(path.join(report.resources, entry.familyPath), 'utf8'));
        newManifests.push(...family.members.map(b => b.sha256));
    }
    assert(report.bindings.buildings.every(b => newManifests.every(hash => !b.identity.includes(hash))));
    report.boundary = 'One RA2 startup/control scene with two accepted buildings and two accepted units; old NAPSIS 264x208 source retained, Yuri-only demand identities excluded. No faction-wide repeat.';
    await stage('ra2-accepted-controls-and-source-isolation');
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;

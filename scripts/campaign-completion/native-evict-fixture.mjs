import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const fixture = await fs.readFile(new URL('./fixtures/evict111.map', import.meta.url), 'utf8');
const sha256 = createHash('sha256').update(fixture).digest('hex');
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [], fixtureSha256: sha256,
    scope: 'Standalone versioned Urban compatibility fixture, not an original mission or goal. A separate fixture map replaces the bootstrap map before world creation. Original rules, player garrison entry, ordinary tank combat, NoFactories17 and Evict111 execute in a fresh native world. No original source map is edited and no event, health, ownership or result is injected into an original world. Progress recording is disabled.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    await page.evaluate(({ fixture, sha256 }) => {
        const screen = window.__ra2debug.mainMenuController.screens.get(22);
        const loader = screen.rootController.screens.get(1).gameLoader, create = loader.createGame;
        const notice = document.createElement('div'); notice.dataset.specializedFixture = 'evict111';
        notice.textContent = 'SPECIALIZED EVICT111 COMPATIBILITY SCENE — NOT AN ORIGINAL MISSION';
        Object.assign(notice.style, { position: 'fixed', top: '0', left: '0', right: '0', zIndex: '100000',
            background: '#092a3b', color: '#fff', padding: '10px', font: 'bold 18px sans-serif', textAlign: 'center' });
        document.body.append(notice);
        loader.createGame = async function (...args) {
            loader.createGame = create;
            const map = new args[3].constructor(); map.campaignFilename = 'trn99u.map'; map.fromString(fixture);
            const opts = args[2]; opts.mapName = 'trn99u.map'; opts.mapTitle = 'Specialized occupied Evict111 scene';
            opts.campaign = { ...opts.campaign, mission: 'trn99u.map', sourceSha256: sha256,
                provenanceDigest: 'standalone-fixture-' + sha256, diagnostic: true };
            args[3] = map;
            const result = await create.apply(this, args); result.game.campaign.inspectionModified = true;
            return result;
        };
        return screen.launchPrepared('all06u.map');
    }, { fixture, sha256 });
    await waitWorld(page, 'trn99u.map');
    const commands = new OrdinaryCampaignCommands(page, report);
    const identity = await page.evaluate(() => {
        const g = window.__ra2debug.game;
        const describe = name => g.world.getAllObjects().filter(o => o.name === name).map(o => o.id);
        return { launch: g.campaign.launch, text: g.campaign.definition.source, building: describe('CANEWY01')[0],
            factory: describe('NAHAND')[0], gi: describe('E1') };
    });
    // The map parser drops comments and appends empty derived sections.
    assert(identity.text.includes('Name=Specialized occupied Evict111 compatibility scene'));
    assert(identity.text.includes('EV=1,111,0,0,0,0,0,0,A'));
    assert.equal(identity.launch.sourceSha256, sha256);
    report.identity = identity;
    await commands.order(identity.gi, 8, identity.building);
    for (let i = 0; i < 40; i++) {
        await commands.step(15, { defend: false, repair: false });
        if (await page.evaluate(id => window.__ra2debug.game.getObjectById(id).garrisonTrait.getOccupants().length === 2,
            identity.building)) break;
    }
    report.occupied = await page.evaluate(id => {
        const g = window.__ra2debug.game, b = g.getObjectById(id);
        return { tick: g.currentTick, owner: b.owner.name, occupants: b.garrisonTrait.getOccupants().map(u => u.id),
            fired: g.campaign.machine.states.get('EV').fired };
    }, identity.building);
    assert.deepEqual(report.occupied.occupants.sort(), identity.gi.sort()); assert.equal(report.occupied.fired, 0);
    await page.evaluate(id => { const d = window.__ra2debug; d.worldInteraction.minimapHandler.panToTile(d.game.getObjectById(id).tile); }, identity.building);
    await page.screenshot({ path: path.join(out, 'specialized-occupied-before-factory-loss.png') });
    await commands.order(['MTNK'], 2, identity.factory);
    for (let i = 0; i < 100; i++) {
        await commands.step(15, { defend: false, repair: false });
        if (await page.evaluate(() => window.__ra2debug.game.campaign.machine.states.get('EV').fired > 0)) break;
    }
    report.evicted = await page.evaluate(({ building, factory, gi }) => {
        const g = window.__ra2debug.game, b = g.getObjectById(building), all = g.world.getAllObjects();
        return { tick: g.currentTick, owner: b.owner.name, occupants: b.garrisonTrait.getOccupants().map(u => u.id),
            factorySurvives: all.some(u => u.id === factory && !u.isDestroyed),
            gi: gi.map(id => { const u = all.find(u => u.id === id); return { id, spawned: u?.isSpawned, destroyed: u?.isDestroyed,
                tile: u && [u.tile.rx, u.tile.ry] }; }), actions: g.campaign.trace, result: g.campaign.result };
    }, identity);
    assert.equal(report.evicted.factorySurvives, false); assert.deepEqual(report.evicted.occupants, []);
    assert(report.evicted.gi.every(u => u.spawned && !u.destroyed)); assert(!report.evicted.result);
    assert(report.evicted.actions.some(a => a.key === 'EV' && a.opcode === 111));
    await page.screenshot({ path: path.join(out, 'specialized-original-rule-occupied-evict111.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_STANDALONE_OCCUPIED_EVICT111_AFTER_ORDINARY_FACTORY_DESTRUCTION';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';
const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
const fixture = await fs.readFile(new URL('./fixtures/neutral-demolition-v54.map', import.meta.url), 'utf8'), sha256 = createHash('sha256').update(fixture).digest('hex');
const report = {
    status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [], fixtureSha256: sha256, scope: 'Explicit standalone versioned compatibility map, not an original mission. Original rules and real ordinary combat test occupied neutral-building acquisition, explicit attack, damage retaliation and both commandos demolishing factories. No original map, health, rule, result or post-creation RNG is changed. Progress recording is disabled.'
};
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    await page.evaluate(({ fixture, sha256 }) => {
        const screen = window.__ra2debug.mainMenuController.screens.get(22), loader = screen.rootController.screens.get(1).gameLoader, create = loader.createGame;
        const notice = document.createElement('div');
        notice.textContent = 'SPECIALIZED COMBAT COMPATIBILITY SCENE — NOT AN ORIGINAL MISSION';
        Object.assign(notice.style, {
            position: 'fixed', top: '0', left: '0', right: '0', zIndex: '100000', background: '#092a3b', color: '#fff', padding: '8px', font: 'bold 18px sans-serif', textAlign: 'center'
        });
        document.body.append(notice);
        loader.createGame = async function (...args) { loader.createGame = create; const map = new args[3].constructor(); map.campaignFilename = 'trn99u.map'; map.fromString(fixture); args[2].mapName = 'trn99u.map'; args[2].mapTitle = 'Specialized combat compatibility scene'; args[2].campaign = { ...args[2].campaign, mission: 'trn99u.map', sourceSha256: sha256, provenanceDigest: 'standalone-fixture-' + sha256, diagnostic: true }; args[3] = map; const result = await create.apply(this, args); result.game.campaign.inspectionModified = true; return result; };
        return screen.launchPrepared('all06u.map');
    }, { fixture, sha256 });
    await waitWorld(page, 'trn99u.map');
    const commands = new OrdinaryCampaignCommands(page, report);
    report.setup = await page.evaluate(() => { const g = window.__ra2debug.game; window.__neutralDamage = []; const kinds = ['MTNK', 'CAOILD', 'CAOUTP', 'TANY', 'GHOST']; const units = g.world.getAllObjects().filter(u => kinds.includes(u.name)); for (const u of units) {
        const damage = u.healthTrait.inflictDamage;
        u.healthTrait.inflictDamage = function (amount, source, world) { window.__neutralDamage.push({
            tick: g.currentTick, id: u.id, name: u.name, amount, attacker: source?.obj?.name, attackerId: source?.obj?.id, weapon: source?.weapon?.name ?? source?.weapon?.rules?.name
        }); return damage.call(this, amount, source, world); };
    } return {
        launch: g.campaign.launch, units: units.map(u => ({ id: u.id, name: u.name, hp: u.healthTrait.getHitPoints(), owner: u.owner.name })), targets: g.world.getAllObjects().filter(u => ['NAHAND', 'NAWEAP'].includes(u.name)).map(u => ({ id: u.id, name: u.name }))
    }; });
    for (const [unit, target] of [['TANY', 'NAHAND'], ['GHOST', 'NAWEAP']])
        await commands.order([unit], 2, report.setup.targets.find(u => u.name === target).id);
    for (let n = 0; n < 80; n++) {
        await stepWorld(page, 15);
        const s = await page.evaluate(() => { const g = window.__ra2debug.game, escape = t => t.demolitionRetreat || t.children?.some(escape); return {
            tick: g.currentTick, units: g.world.getAllObjects().filter(u => ['TANY', 'GHOST', 'MTNK', 'CAOILD', 'CAOUTP', 'NAHAND', 'NAWEAP'].includes(u.name)).map(u => ({ id: u.id, name: u.name, hp: u.healthTrait.getHitPoints(), tile: [u.tile.rx, u.tile.ry], escaping: u.unitOrderTrait.getTasks().some(escape) })), damage: window.__neutralDamage
        }; });
        report.samples.push(s);
        if (s.tick >= 300 && !s.units.some(u => ['NAHAND', 'NAWEAP'].includes(u.name)))
            break;
    }
    report.quiet = report.samples.at(-1);
    assert(!report.quiet.units.some(u => ['NAHAND', 'NAWEAP'].includes(u.name)));
    for (const name of ['TANY', 'GHOST']) {
        assert(report.samples.some(s => s.units.some(u => u.name === name && u.escaping)));
        assert.equal(report.quiet.units.find(u => u.name === name).hp, report.setup.units.find(u => u.name === name).hp);
    }
    assert(!report.quiet.damage.some(h => h.name === 'CAOILD' && h.amount > 0), 'An occupied oil derrick was proactively attacked');
    const oil = report.setup.units.find(u => u.name === 'CAOILD');
    await commands.order(['MTNK'], 2, oil.id);
    await stepWorld(page, 120);
    await commands.order(['MTNK'], 11);
    await stepWorld(page, 1);
    report.explicit = await page.evaluate(() => window.__neutralDamage);
    assert(report.explicit.some(h => h.name === 'CAOILD' && h.attacker === 'MTNK' && h.amount > 0));
    await commands.order(['MTNK'], 0, undefined, [59, 59]);
    await stepWorld(page, 600);
    report.retaliation = await page.evaluate(() => window.__neutralDamage);
    const first = report.retaliation.find(h => h.name === 'MTNK' && h.attacker === 'CAOUTP' && h.amount > 0);
    assert(first, 'Enemy occupied outpost did not attack the arriving tank');
    assert(report.retaliation.some(h => h.name === 'CAOUTP' && h.attacker === 'MTNK' && h.amount > 0 && h.tick >= first.tick), 'Tank did not retaliate against the occupied outpost');
    await page.evaluate(() => { const d = window.__ra2debug; d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(58, 58)); });
    await page.screenshot({ path: path.join(out, 'specialized-neutral-explicit-attack-and-retaliation.png') });
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_STANDALONE_COMMANDO_DEMOLITION_OCCUPIED_NEUTRAL_PROTECTION_EXPLICIT_ATTACK_AND_RETALIATION';
}
catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => { });
}
finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));

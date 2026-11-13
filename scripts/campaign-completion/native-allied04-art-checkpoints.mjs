import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { replaySourcePrefix } from './replay-source.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

const out = path.resolve(process.argv[2]), directory = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
assert.equal(source.identity.launch.mission, 'all04u.map');
const report = { status: 'RUNNING', errors: [], failedResources: [], samples: [], commands: [],
    scope: 'Real original source states for HD binding checks. The damaged amplifier is reached by strict replay of ordinary recorded attacks. The optional monkey reinforcement must follow normal infantry garrison entry into the original tagged McBurger Kong. No source/world/health/ownership/trigger edits or injected actors. Extra checkpoint files use the real serializer programmatically and are not manual Save UI claims or hidden launch states.' };
let app, page;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function checkpoint(filename) {
    const data = await page.evaluate(() => { const g = window.__ra2debug.game; return g.campaign.journal.capture(g); });
    await fs.writeFile(path.join(out, filename), JSON.stringify(data));
    return { filename, tick: data.tick, hash: data.expected.worldHash, checksum: data.checksum };
}
try {
    const damaged = path.join(out, 'damaged'); await fs.mkdir(damaged);
    ({ app, page } = await campaignSession(damaged, report, { density: 0 }));
    const damageLabel = source.samples.some(sample => sample.label === 'before-real-amplifier-destruction')
        ? 'before-real-amplifier-destruction' : 'fresh-original-world';
    report.damagedReplay = await replaySourcePrefix(page, source, damageLabel);
    report.amplifier = await page.evaluate(() => { const g = window.__ra2debug.game, o = g.world.getAllObjects().find(o => o.name === 'NAPSYA');
        return { id: o.id, health: o.healthTrait.health, owner: o.owner.name, tick: g.currentTick }; });
    assert(report.amplifier.health > 0 && report.amplifier.health < 25);
    report.damagedCheckpoint = await checkpoint('original-damaged-amplifier-checkpoint.json'); await save();
    await app.close(); app = undefined;

    const bonus = path.join(out, 'bonus'); await fs.mkdir(bonus);
    ({ app, page } = await campaignSession(bonus, report, { density: 0 }));
    report.bonusReplay = await replaySourcePrefix(page, source, 'advance-through-original-city');
    report.identity = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, options: g.gameOpts }; });
    const commands = new OrdinaryCampaignCommands(page, report);
    report.samples.push(await commands.inspect('before-original-optional-garrison'));
    report.target = await page.evaluate(() => { const g = window.__ra2debug.game;
        const o = g.world.getAllObjects().find(o => o.name === 'CAMSC10' && o.tag?.id === '03FFBF4C');
        return { id: o.id, name: o.name, tile: [o.tile.rx, o.tile.ry], tag: o.tag.id, health: o.healthTrait.health }; });
    await commands.order(['MTNK', 'E1'], 4, undefined, [64, 67]);
    await commands.step(1800, { defend: false });
    await commands.order(['E1'], 8, report.target.id);
    let created = false;
    for (let i = 0; i < 20; i++) {
        await commands.step(150, { defend: false });
        created = await page.evaluate(() => window.__ra2debug.game.world.getAllObjects()
            .some(o => o.name === 'JOSH' && o.isSpawned && !o.isDestroyed));
        if (created) break;
    }
    report.samples.push(await commands.inspect('after-original-optional-garrison'));
    report.bonus = await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
        const monkeys = g.world.getAllObjects().filter(o => o.name === 'JOSH' && o.isSpawned && !o.isDestroyed);
        return { tick: g.currentTick, hash: g.getHash(), result: c.result, failure: c.failure,
            trigger: c.machine.states.get('03FFD78C'), actions: c.trace.filter(a => a.key === '03FFD78C'),
            monkeys: monkeys.map(o => ({ id: o.id, tile: [o.tile.rx, o.tile.ry], owner: o.owner.name, health: o.healthTrait.health })) }; });
    assert(created && report.bonus.trigger.fired > 0); assert(!report.bonus.result && !report.bonus.failure);
    assert(report.bonus.actions.some(action => action.opcode === 80));
    report.bonusCheckpoint = await checkpoint('original-optional-monkey-checkpoint.json');
    await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands)));
    await page.screenshot({ path: path.join(out, 'native-original-optional-reinforcement.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_DAMAGED_AMPLIFIER_AND_OPTIONAL_GARRISON_MONKEY_CHECKPOINTS';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));

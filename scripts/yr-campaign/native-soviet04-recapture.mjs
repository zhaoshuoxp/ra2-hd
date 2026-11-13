import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { worldState } from '../m3-2/native-session.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov04dmd.map');
let failure;
try {
    let state = await pilot.open();
    assert(pilot.report.launch.semanticsVersion >= 38);
    const file = process.argv.find(value => value.startsWith('--replay-commands='))?.slice(18);
    assert(file, 'Provide the original ordinary input history before the second capture');
    const original = JSON.parse(await fs.readFile(file)), replayed = await worldState(pilot.page);
    assert.equal(replayed.tick, original.tick);
    for (const key of ['world', 'rng'])
        assert(JSON.stringify(replayed[key]) === JSON.stringify(original.expected[key]),
            'Historical ordinary input replay changed the original ' + key);
    pilot.report.historicalWorldAndRng = { tick: replayed.tick, sourcePolicy: original.options.campaign.semanticsVersion,
        currentPolicy: pilot.report.launch.semanticsVersion, exact: true, qualification: 'Mission tag state intentionally follows the new policy.' };
    pilot.commands.groundDefenders = ['HTNK', 'E2']; pilot.commands.airDefenders = [];
    const inspect = () => pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, campaign = g.campaign;
        const hero = g.getAllPlayers().flatMap(owner => owner.getOwnedObjects(true))
            .find(unit => unit.name === 'RMNV' && !unit.isDestroyed);
        return { hero: hero && { id: hero.id, owner: hero.owner.name, health: hero.healthTrait.health,
            controller: hero.mindControllableTrait?.getController()?.id,
            originalOwner: hero.mindControllableTrait?.getOriginalOwner()?.name,
            tile: [hero.tile.rx, hero.tile.ry] }, local1: campaign.machine.variables.get('1'),
            capture: campaign.machine.states.get('0915E18C'),
            renewals: campaign.sourceQuirks.filter(row => row.kind === 'fresh-source-single-actor-capture-tag-renewed') };
    });
    pilot.report.beforeRecapture = await inspect();
    assert.equal(pilot.report.beforeRecapture.hero.owner, 'Germans');
    assert(pilot.report.beforeRecapture.renewals.length > 0, 'The new source Romanov team did not renew its consumed capture tag');
    for (let i = 0; i < 240; i++) {
        await pilot.commands.step(45); state = await pilot.observe('original-second-psychic-capture-' + i);
        const capture = await inspect();
        if (capture.hero?.owner !== 'British') continue;
        assert.equal(capture.hero.originalOwner, 'Germans'); assert.equal(capture.hero.health, 100);
        assert(Number.isInteger(capture.hero.controller)); assert(capture.capture.fired > 0); assert(capture.local1);
        pilot.report.secondCapture = { tick: state.tick, ...capture }; break;
    }
    assert(pilot.report.secondCapture, 'Original second capture did not complete its British script transfer');
    await pilot.restart('Original YR Soviet04 repeated capture with a renewed source team tag');
    pilot.report.afterRestart = await inspect();
    assert.equal(pilot.report.afterRestart.hero.owner, 'British');
    assert.equal(pilot.report.afterRestart.hero.controller, pilot.report.secondCapture.hero.controller);
    pilot.report.status = 'PASS_NATIVE_YR38_SOURCE_TEAM_CAPTURE_TAG_RENEWAL_SECOND_CAPTURE_AND_EXACT_RESTART';
} catch (error) { failure = error; }
await pilot.finish(failure);

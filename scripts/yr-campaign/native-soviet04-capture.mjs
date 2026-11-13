import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov04dmd.map');
let failure;
try {
    let state = await pilot.open();
    pilot.commands.groundDefenders = ['HTNK', 'E2', 'DRON'];
    for (let i = 0; i < 120; i++) {
        await pilot.commands.step(45); state = await pilot.observe('original-psychic-capture-' + i);
        const hero = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game;
            const unit = g.getAllPlayers().flatMap(owner => owner.getOwnedObjects(true))
                .find(unit => unit.name === 'RMNV' && !unit.isDestroyed);
            return unit && { id: unit.id, owner: unit.owner.name, tile: [unit.tile.rx, unit.tile.ry],
                controller: unit.mindControllableTrait?.getController()?.id,
                originalOwner: unit.mindControllableTrait?.getOriginalOwner()?.name,
                health: unit.healthTrait.health };
        });
        (pilot.report.originalCaptureObservations ??= []).push({ tick: state.tick, hero });
        if (hero?.owner === 'British') {
            pilot.report.captureTrigger = await pilot.page.evaluate(() => {
                const campaign = window.__ra2debug.game.campaign;
                return { state: campaign.machine.states.get('0915E18C'), local1: campaign.machine.variables.get('1') };
            });
            assert(pilot.report.captureTrigger.state.fired > 0);
            pilot.report.capturedBritish = hero;
            if (process.argv.includes('--require-link')) {
                assert(Number.isInteger(hero.controller), 'Scripted house transfer lost the original capture node');
                assert.equal(hero.originalOwner, 'Germans');
            }
            pilot.report.status = hero.controller === undefined
                ? 'PASS_NATIVE_YR36_ORIGINAL_CAPTURE_NOTIFICATIONS; SCRIPTED_TRANSFER_CONTROL_LINK_REGRESSION_CONFIRMED'
                : 'PASS_NATIVE_ORIGINAL_CAPTURE_AND_SCRIPTED_TRANSFER_PRESERVES_CONTROL_LINK';
            break;
        }
    }
    assert(pilot.report.capturedBritish, 'Original Romanov capture sequence did not reach its British scripted house');
} catch (error) { failure = error; }
await pilot.finish(failure);

import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all07smd.map');
let failure;
try {
    let state = await pilot.open();
    const yard = state.own.find(unit => unit.name === 'NACNST')
        ?? state.houses.flatMap(house => house.objects).find(unit => unit.name === 'NACNST' && unit.id === 2737);
    const engineer = state.own.find(unit => unit.name === 'ENGINEER');
    assert(yard && engineer, 'The original damaged yard and initial repair engineer are required');
    if (yard.health < 100) await pilot.commands.order([engineer.id], 15, yard.id);
    const power = state.houses.flatMap(house => house.objects).find(unit => unit.name === 'NAPOWR' && unit.id === 2738);
    const powerEngineer = state.own.find(unit => unit.name === 'ENGINEER' && unit.id !== engineer.id) ?? engineer;
    assert(power, 'The original damaged Soviet power plant is required');
    await pilot.commands.order([powerEngineer.id], 15, power.id);
    if (process.argv.includes('--sell-critical-yard')) {
        await pilot.commands.step(900, { defend: false, repair: false });
        await pilot.page.evaluate(id => window.__ra2debug.actionsApi.sellObject(id), yard.id);
        pilot.report.commands.push({ kind: 'ordinary-critical-yard-sale', id: yard.id,
            scope: 'Normal player sale exercises the original zero-yard failure condition before the radar phase disables that condition.' });
    }
    for (let i = 0; i < 900; i++) {
        try { await pilot.commands.step(90, { defend: false, repair: false }); }
        catch (error) {
            if (!error.message.startsWith('Original source defeat at tick')) throw error;
        }
        if (i % 10 === 0) state = await pilot.observe('original-critical-yard-enemy-attack-' + i);
        if (await pilot.page.evaluate(() => !!window.__ra2debug.game.campaign.result)) break;
    }
    state = await pilot.observe('original-critical-yard-source-defeat');
    assert.equal(state.result, 'defeat');
    assert(!state.own.some(unit => unit.id === yard.id), 'The original critical yard must actually be lost');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED07_REPAIRED_CRITICAL_YARD_LOSS_AND_SOURCE_DEFEAT';
} catch (error) { failure = error; }
await pilot.finish(failure);

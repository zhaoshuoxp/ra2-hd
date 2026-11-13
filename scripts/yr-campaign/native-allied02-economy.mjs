import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all02umd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands; commands.groundDefenders = ['E1', 'GGI', 'MTNK', 'SREF', 'FV'];
    await commands.build('GAREFN', [169, 117]); state = await pilot.observe('ordinary-hollywood-protected-miner-refinery');
    await commands.build('GAPOWR', [176, 139]); state = await pilot.observe('ordinary-hollywood-mining-power');
    await commands.build('ATESLA', [166, 119]); state = await pilot.observe('ordinary-hollywood-mining-defense');
    await pilot.checkpoint('original-protected-ore-approach-checkpoint.json');
    for (let i = 0; i < 700; i++) {
        await commands.step(90); if (i % 5 === 0) state = await pilot.observe('ordinary-hollywood-protected-ore-income-' + i);
        assert(state.own.some(unit => unit.name === 'GACNST'), 'Original combat destroyed the paid construction base');
        const miner = await pilot.page.evaluate(() => window.__ra2debug.game.localPlayer.getOwnedObjects(true)
            .some(unit => unit.name === 'CMIN' && !unit.isDestroyed));
        assert(miner, 'The ordinary refinery miner was lost');
        if (state.credits >= 22000) break;
    }
    state = await pilot.observe('original-hollywood-restored-mining-economy'); assert(state.credits >= 22000);
    await pilot.restart('Original YR Allied02 protected ore income and surviving fortified base');
    await pilot.checkpoint('original-hollywood-restored-economy-checkpoint.json');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED02_PAID_REFINERY_MINER_DEFENSE_EARNED_CREDITS_AND_EXACT_RESTART';
} catch (error) { failure = error; }
await pilot.finish(failure);

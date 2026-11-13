import assert from 'node:assert/strict';
import { advanceSupportedPrisms } from './supported-prism-column.mjs';

export async function completeAllied04Victory(pilot) {
    let state = await pilot.observe('original-egypt-final-stage-entry');
    let commands = pilot.commands;
    commands.groundDefenders = ['MTNK', 'TNKD', 'SREF', 'GGI', 'E1'];
    commands.airDefenders = ['JUMPJET', 'FV', 'GGI'];
    const escapedAtOpen = await pilot.page.evaluate(() => [...window.__ra2debug.game.campaign.teams.instances.values()]
        .some(team => team.type === '0B0637DC' && team.phase === 'finished'));
    if (!escapedAtOpen) await commands.step(1200, { defend: false });
    state = await pilot.observe('original-einstein-boarding-deletion-and-radar-briefing');
    pilot.report.escape = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        const escape = [...g.campaign.teams.instances.values()].filter(team => team.type === '0B0637DC');
        return { flags: Object.fromEntries(g.campaign.machine.variables),
            teams: escape.map(team => ({ phase: team.phase,
                members: team.members.map(unit => ({ name: unit.name, spawned: unit.isSpawned, disposed: unit.isDisposed,
                    owned: unit.owner.getOwnedObjects(true).includes(unit), passengers: unit.transportTrait?.units.map(unit => unit.id) })) })),
            weapons: g.localPlayer.superWeaponsTrait.getAll().map(weapon => ({ name: weapon.name,
                type: weapon.rules.type, status: weapon.status, chargeTicks: weapon.chargeTicks })) };
    });
    assert(pilot.report.escape.flags['3'] && pilot.report.escape.flags['12']);
    assert(pilot.report.escape.teams.length && pilot.report.escape.teams.every(team => team.phase === 'finished'
        && team.members.every(unit => unit.disposed && !unit.spawned && !unit.owned && !unit.passengers?.length)));
    if (!escapedAtOpen) await pilot.restart('Original YR Allied04 Einstein boards, escapes, source-deletes the rescue team and reveals the final base');
    commands = pilot.commands;
    await pilot.checkpoint('original-einstein-escape-and-dominator-checkpoint.json');
    if (state.own.some(unit => unit.name === 'GACNST')) await commands.build('GAPOWR', [85, 171]);
    if (state.own.some(unit => unit.name === 'GAWEAP')) {
        const needed = Math.max(0, 20 - state.own.filter(unit => unit.name === 'SREF').length);
        if (needed) await commands.queue('SREF', needed);
        const flyers = Math.max(0, 12 - state.own.filter(unit => unit.name === 'JUMPJET').length);
        if (flyers) await commands.queue('JUMPJET', flyers);
        await commands.order(['GAWEAP', 'GAPILE'], 0, undefined, [83, 155]);
        for (let i = 0; i < 850; i++) {
            await commands.step(90);
            if (i % 10 === 0) state = await pilot.observe('ordinary-egypt-final-assault-replenishment-' + i);
            if (!state.queues.some(queue => queue.items.some(item => ['SREF', 'JUMPJET'].includes(item.name)))) break;
        }
    }
    if (escapedAtOpen) {
        await pilot.restart('Original YR Allied04 rescued Einstein, retained Dominator, fortified base and replenished paid army');
        commands = pilot.commands;
    }
    const army = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, own = g.localPlayer.getOwnedObjects().filter(unit => unit.isSpawned && !unit.isDestroyed);
        return { prisms: own.filter(unit => unit.name === 'SREF').map(unit => unit.id),
            air: own.filter(unit => unit.name === 'JUMPJET').map(unit => unit.id) };
    });
    assert(army.prisms.length >= 3); pilot.report.army = army;
    for (let stage = 0; stage < 180 && !state.result; stage++) {
        const plan = await pilot.page.evaluate(ids => {
            const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const units = g.localPlayer.getOwnedObjects().filter(unit => ids.includes(unit.id) && unit.isSpawned && !unit.isDestroyed);
            if (!units.length) throw Error('The ordinary Egypt prism column was lost');
            const center = units.reduce((sum, unit) => [sum[0] + unit.tile.rx / units.length, sum[1] + unit.tile.ry / units.length], [0, 0]);
            const enemies = g.campaign.resolveHouse(9).getOwnedObjects().filter(unit => unit.isSpawned && !unit.isDestroyed
                && !unit.rules.invisibleInGame && unit.rules.legalTarget !== false && !unit.rules.insignificant);
            const target = enemies.sort((a, b) => Number(b.isBuilding()) - Number(a.isBuilding())
                || Math.hypot(a.tile.rx - center[0], a.tile.ry - center[1]) - Math.hypot(b.tile.rx - center[0], b.tile.ry - center[1]))[0];
            const weapon = g.localPlayer.superWeaponsTrait.getAll().find(weapon => weapon.rules.type === 7 && weapon.status === 2);
            const base = enemies.find(unit => unit.name === 'YACNST') ?? enemies.find(unit => unit.isBuilding());
            return { goal: target && { id: target.id, name: target.name, tile: [target.tile.rx, target.tile.ry] },
                dominator: weapon && base && !shroud.isShrouded(base.tile, base.tileElevation) && [base.tile.rx, base.tile.ry] };
        }, army.prisms);
        if (plan.dominator) {
            await pilot.page.evaluate(tile => window.__ra2debug.actionsApi.activateSuperWeapon(7,
                { rx: tile[0], ry: tile[1] }), plan.dominator);
            pilot.report.commands.push({ kind: 'activate-superweapon', type: 7, tile: plan.dominator });
        }
        if (!plan.goal) break;
        await advanceSupportedPrisms(pilot, plan.goal, army, 'ordinary-egypt-final-base-' + stage + '-' + plan.goal.name);
        state = await pilot.observe('original-egypt-final-goal-cleared-' + stage + '-' + plan.goal.name);
        if (!state.result) await pilot.checkpoint('last-egypt-final-base-progress-checkpoint.json');
    }
    for (let i = 0; i < 100 && !state.result; i++) {
        await commands.step(60, { defend: false }); state = await pilot.observe('original-egypt-victory-delay-' + i);
    }
    assert.equal(state.result, 'victory');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED04_PRISON_POWER_EINSTEIN_ESCAPE_DOMINATOR_FINAL_BASE_AND_SOURCE_VICTORY';
}

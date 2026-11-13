import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov07tmd.map');
let failure;
try {
    let state = await pilot.open(), commands = pilot.commands;
    commands.groundDefenders = ['HTNK', 'TTNK', 'SHK', 'DRON', 'APOC']; commands.airDefenders = ['HTK', 'FLAKT'];
    if (process.argv.includes('--observe-genetic-warning')) {
        commands.groundDefenders.push('E2', 'DOG', 'HTK');
        commands.groundPriority = ['YURI', 'YURIPR', 'MIND', 'INIT', 'SHK', 'GGI'];
    }
    const supportedWarning = process.argv.includes('--supported-warning-defense');
    const earlyBunker = process.argv.includes('--early-bunker-warning-defense');
    const protectOre = process.argv.includes('--protect-ore-warning-defense');
    const maintained = new WeakSet();
    const supportBase = () => {
        if (!supportedWarning) return;
        commands.autoForceShield = process.argv.includes('--shield-warning-defense');
        commands.defenseRadius = earlyBunker ? 18 : 12;
        commands.groundDefenderGroups = [
            { names: ['DRON'], targetTypes: ['vehicle'], priority: ['APOC', 'MTNK', 'HTNK'], closest: true },
            { names: ['HTNK', 'TTNK', 'SHK', 'APOC'], priority: ['YURI', 'YURIPR', 'MIND', 'BRUTE', 'INIT'], closest: true },
            { names: ['E2', 'DOG'], targetTypes: ['infantry'], priority: ['YURI', 'YURIPR', 'INIT', 'BRUTE'], closest: true },
            { names: ['HTK'], targetTypes: ['infantry'], priority: ['INIT', 'BRUTE'], closest: true, onlyWithoutAirTargets: true },
        ];
        if (earlyBunker) commands.groundDefenderGroups[1].names = ['HTNK', 'TTNK', 'APOC'];
        if (protectOre) {
            commands.groundDefenderGroups[0].priority = undefined;
            commands.groundDefenderGroups[1].names = ['TTNK', 'APOC'];
        }
        commands.repairTargets = state.own.filter(unit => ['NACNST', 'NAPOWR', 'NANRCT'].includes(unit.name))
            .map(unit => unit.id);
        if (earlyBunker && !maintained.has(commands) && (!process.argv.includes('--air-warning-defense')
            || state.own.filter(unit => unit.name === 'NAFLAK' && unit.spawned).length >= 4)) {
            maintained.add(commands);
            const advance = commands.step.bind(commands);
            commands.step = async (ticks, options) => {
                const refill = await pilot.page.evaluate(() => {
                    const g = window.__ra2debug.game, rule = g.rules.getObject('DRON', 7), p = g.localPlayer.production;
                    return !g.campaign.inputLocked && g.localPlayer.credits >= 3000 && p.isAvailableForProduction(rule)
                        && g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'DRON' && unit.isSpawned && !unit.isDestroyed).length < 3
                        && !p.getQueueForObject(rule).getAll().some(item => item.rules === rule);
                });
                if (refill) await commands.queue('DRON', 3);
                return advance(ticks, options);
            };
        }
    };
    supportBase();
    const has = name => state.own.some(unit => unit.name === name && unit.spawned);
    if (process.argv.includes('--mobile-air-warning-defense')) {
        if (!has('NAHAND')) {
            await commands.build('NAHAND', [146, 146]);
            state = await pilot.observe('ordinary-paid-barracks-before-mobile-air-defense');
        }
        const count = state.own.filter(unit => unit.name === 'FLAKT' && unit.spawned).length;
        if (count < 12) await commands.queue('FLAKT', 12-count);
        const deadline = state.tick + 5400;
        const positions = [[145, 148], [150, 146], [149, 150]];
        while (state.tick < deadline) {
            const troops = state.own.filter(unit => unit.name === 'FLAKT' && unit.spawned);
            for (let group = 0; group < 3; group++) {
                const ids = troops.filter((_, index) => index % 3 === group).map(unit => unit.id);
                if (ids.length) await commands.order(ids, 0, undefined, positions[group]);
            }
            if (troops.length >= 12) break;
            await commands.step(180);
            state = await pilot.observe('ordinary-paid-mobile-air-defense-production');
        }
        assert(state.own.filter(unit => unit.name === 'FLAKT' && unit.spawned).length >= 12,
            'The paid mobile anti-aircraft squad did not complete');
        await pilot.checkpoint('original-paid-mobile-air-defense-checkpoint.json');
    }
    const continueWarning = process.argv.includes('--continue-genetic-warning');
    assert(!continueWarning || process.argv.includes('--observe-genetic-warning')
        && has('NACNST') && (has('NAIRON') || has('NAMISL')),
    'Warning continuation requires the original paid superweapon and a surviving source base');
    if (!continueWarning) {
        if (!has('NACNST')) {
            const cell = await pilot.page.evaluate(() => {
                const g = window.__ra2debug.game, unit = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'SMCV');
                const worker = g.getConstructionWorker(unit.owner);
                const tile = g.map.tiles.getAll().filter(tile => g.map.mapBounds.isWithinPlayerBounds(tile)
                    && Math.hypot(tile.rx - unit.tile.rx, tile.ry - unit.tile.ry) < 12
                    && worker.canPlaceAt(unit.rules.deploysInto, tile, { ignoreObjects: [unit], ignoreAdjacent: true }))
                    .sort((a, b) => Math.hypot(a.rx - 149, a.ry - 148) - Math.hypot(b.rx - 149, b.ry - 148))[0];
                if (!tile) throw Error('No legal original Soviet07 ordinary deployment cell');
                return [tile.rx, tile.ry];
            });
            await commands.order(['SMCV'], 0, undefined, cell); await commands.step(240);
            await commands.order(['SMCV'], 9); await commands.step(180); state = await pilot.observe('original-transylvania-base-deployment');
            assert(has('NACNST'), 'Original Soviet07 MCV did not deploy');
            await pilot.checkpoint('original-deployed-mcv-checkpoint.json');
        }
        if (earlyBunker && !has('NABNKR')) {
            await commands.build('NABNKR', [146, 144]);
            state = await pilot.observe('ordinary-early-paid-bunker');
            const bunker = state.own.find(unit => unit.name === 'NABNKR' && unit.spawned);
            assert(bunker);
            const infantry = state.own.filter(unit => unit.name === 'E2' && unit.spawned).slice(0, 5).map(unit => unit.id);
            assert(infantry.length >= 3, 'The original starting bunker squad is unavailable');
            await commands.order(infantry, 8, bunker.id);
            await commands.step(300, { defend: false });
            state = await pilot.observe('ordinary-early-bunker-original-infantry-garrison');
            pilot.report.earlyBunker = await pilot.page.evaluate(id => {
                const g = window.__ra2debug.game, unit = g.world.getObjectById(id);
                return { id, tick: g.currentTick, health: unit.healthTrait.health,
                    occupants: unit.garrisonTrait.getOccupants().map(unit => unit.id) };
            }, bunker.id);
            assert(pilot.report.earlyBunker.occupants.length >= 3);
            await pilot.checkpoint('original-early-occupied-bunker-checkpoint.json');
        }
        await commands.order(protectOre ? ['TTNK', 'SHK'] : ['HTNK', 'TTNK', 'SHK'], 4, undefined, [145, 139]);
        if (protectOre) await commands.order(['HTNK'], 4, undefined, [151, 133]);
        for (const [name, tile] of [['NAPOWR', [152, 148]], ['NAREFN', [152, 141]], ['NAHAND', [146, 146]],
            ['NAWEAP', [145, 141]], ['NARADR', [151, 151]]]) {
            if (!has(name)) { await commands.build(name, tile); state = await pilot.observe('ordinary-transylvania-base-' + name); }
            if (name === 'NAHAND' && supportedWarning && !earlyBunker
                && state.own.filter(unit => unit.name === 'SENGINEER').length < 3) {
                await commands.queue('SENGINEER', 3);
                state = await pilot.observe('ordinary-paid-yard-repair-engineers-queued');
                supportBase();
            }
            if (name === 'NAHAND' && process.argv.includes('--observe-genetic-warning')
                && pilot.report.launch.difficulty === 'hard' && !supportedWarning) {
                if (state.own.filter(unit => unit.name === 'DOG').length < 4) await commands.queue('DOG', 4);
                while (state.own.filter(unit => unit.name === 'NAPOWR' && unit.spawned).length < 2) {
                    await commands.build('NAPOWR', [156, 145]);
                    state = await pilot.observe('ordinary-paid-hard-defense-power');
                }
                if (!has('NARADR')) {
                    await commands.build('NARADR', [151, 151]);
                    state = await pilot.observe('ordinary-paid-hard-defense-radar');
                }
                if (state.own.filter(unit => unit.name === 'SHK').length < 6) await commands.queue('SHK', 6);
                while (state.own.filter(unit => unit.name === 'TESLA' && unit.spawned).length < 2) {
                    await commands.build('TESLA', [146, 137]);
                    state = await pilot.observe('ordinary-paid-hard-defense-tesla');
                }
            }
            if (name === 'NAWEAP' && !has('DRON')) await commands.queue('DRON', 3);
            await pilot.checkpoint('last-base-checkpoint.json');
        }
        while (supportedWarning && !has('NANRCT')
            && state.own.filter(unit => unit.name === 'NAPOWR' && unit.spawned).length < 3) {
            await commands.build('NAPOWR', [156, 145]);
            state = await pilot.observe('ordinary-paid-supported-reserve-power-before-tower');
            supportBase();
        }
        if (state.own.filter(unit => unit.name === 'NAPOWR').length < 2) {
            await commands.build('NAPOWR', [156, 145]); state = await pilot.observe('ordinary-transylvania-second-power');
        }
        if (!has('TESLA')) {
            await commands.build('TESLA', protectOre ? [152, 137] : [146, 137]);
            state = await pilot.observe('ordinary-transylvania-tower');
        }
        if (earlyBunker) {
            const tower = state.own.find(unit => unit.name === 'TESLA' && unit.spawned);
            const chargers = state.own.filter(unit => unit.name === 'SHK' && unit.spawned).map(unit => unit.id);
            if (tower && chargers.length) {
                await commands.order(chargers, 3, tower.id);
                await commands.step(300);
                state = await pilot.observe('ordinary-starting-troopers-charge-owned-tesla');
                pilot.report.chargedTesla = await pilot.page.evaluate(id => {
                    const g = window.__ra2debug.game, unit = g.world.getObjectById(id);
                    return { id, tick: g.currentTick, chargers: unit.overpoweredTrait.getChargeCount(),
                        overpowered: unit.overpoweredTrait.isOverpowered(), powered: unit.poweredTrait.isPoweredOn() };
                }, tower.id);
            }
        }
        if (state.own.filter(unit => unit.name === 'NAREFN').length < 2) {
            await commands.build('NAREFN', [158, 142]); state = await pilot.observe('ordinary-transylvania-second-refinery');
        }
        while (process.argv.includes('--observe-genetic-warning') && !has('NANRCT')
            && state.own.filter(unit => unit.name === 'NAPOWR' && unit.spawned).length < 3) {
            await commands.build('NAPOWR', [155, 142]);
            state = await pilot.observe('ordinary-paid-warning-branch-reserve-power');
        }
        if (!has('NATECH')) { await commands.build('NATECH', [146, 151]); state = await pilot.observe('ordinary-transylvania-technology'); }
        if (process.argv.includes('--air-warning-defense')) {
            if (!has('NANRCT')) {
                await commands.build('NANRCT', [153, 151]);
                state = await pilot.observe('ordinary-paid-reactor-before-anti-aircraft-defense');
            }
            const positions = [[144, 146], [151, 144], [150, 150], [146, 150]];
            while (state.own.filter(unit => unit.name === 'NAFLAK' && unit.spawned).length < 4) {
                const count = state.own.filter(unit => unit.name === 'NAFLAK' && unit.spawned).length;
                await commands.build('NAFLAK', positions[count]);
                state = await pilot.observe('ordinary-paid-base-anti-aircraft-defense');
            }
        }
        await pilot.restart('Original YR Soviet07 paid base before liberating the two controlled factions');
        commands = pilot.commands; state = await pilot.observe('original-restored-transylvania-base');
        supportBase();
        await pilot.checkpoint('original-transylvania-base-checkpoint.json');
    }
    if (process.argv.includes('--observe-genetic-warning')) {
        const difficulty = pilot.report.launch.difficulty;
        assert(['normal', 'hard'].includes(difficulty), 'The original Genetic Mutator warning excludes Easy');
        if (!has('NANRCT')) {
            await commands.build('NANRCT', [153, 151]);
            state = await pilot.observe('ordinary-paid-warning-branch-reactor');
        }
        if (!has('NAIRON') && !has('NAMISL')) {
            await commands.build('NAIRON', [154, 153]);
            state = await pilot.observe('ordinary-paid-warning-branch-iron-curtain');
        }
        pilot.report.superweaponWarningPrerequisite = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, machine = g.campaign.machine;
            return { tick: g.currentTick, minionsBuild: machine.variables.get('0'),
                triggers: machine.snapshot().triggers.filter(([id]) =>
                    ['0D06981C', '0D06925C', '0DB011BC', '0DB01E6C', '07F1BF3C', '095CB76C'].includes(id)) };
        });
        assert(pilot.report.superweaponWarningPrerequisite.minionsBuild,
            'The original paid Iron Curtain or nuclear-silo trigger did not enable enemy superweapons');
        await pilot.checkpoint('original-player-superweapon-prerequisite-checkpoint.json');
        const device = () => state.houses.find(house => house.name === 'BadGuy1 House')?.objects
            .find(unit => unit.name === 'YAGNTC' && unit.spawned);
        const deadline = state.tick + ((difficulty === 'normal' ? 445 : 300) + 205) * 15 + 900;
        for (let i = 0; !device() && state.tick < deadline; i++) {
            await commands.step(90);
            state = await pilot.observe('ordinary-source-genetic-warning-defense-' + i);
            if (!state.own.some(unit => unit.name === 'NACNST' && unit.spawned) && !pilot.report.warningYardLoss) {
                pilot.report.warningYardLoss = { tick: state.tick, survivingForces: state.own.length,
                    result: state.result ?? null, failure: state.failure ?? null,
                    qualification: 'Observe source-active surviving forces; yard survival is a separate base-defense outcome.' };
            }
            if (i % 10 === 0) await pilot.checkpoint('last-genetic-warning-defense-checkpoint.json');
        }
        assert(device(), 'Original BadGuy1 Genetic Mutator did not appear within the source branch window');
        const trace = [...pilot.report.samples.flatMap(sample => sample.sourceTrace ?? []), ...state.sourceTrace];
        const actions = trace.filter(row => row.key === '095CB76C');
        for (const opcode of [125, 100, 11, 21]) assert(actions.some(row => row.opcode === opcode),
            'Original genetic-device creation, transmission, warning or EVA action is absent: ' + opcode);
        pilot.report.geneticWarning = { difficulty, sourceTrigger: '095CB76C', actions,
            device: device(), firstObservedTick: state.tick, originalDifficultyFilterRetained: true };
        await pilot.page.waitForFunction(() => document.querySelectorAll('[data-campaign-media]').length === 0,
            undefined, { timeout: 180000 });
        await pilot.restart('Original YR Soviet07 ' + difficulty + ' genetic-device warning and paid base');
        await pilot.checkpoint('original-genetic-warning-checkpoint.json');
        pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET07_SOURCE_GENETIC_DEVICE_WARNING_AND_EXACT_RESTART_GOALS_PENDING';
    } else pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET07_DEPLOYMENT_PAID_BASE_AND_EXACT_RESTART_GOALS_PENDING';
} catch (error) { failure = error; }
await pilot.finish(failure);

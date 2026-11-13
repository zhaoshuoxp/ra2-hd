import assert from 'node:assert/strict';
import { waitForCampaignFullscreen } from './native-media-wait.mjs';

// Native test assistance uses only the same serialized actions as player input.
// Inspection may read source/state; assisted targeting respects both shroud
// and disguises that the player has not detected.
export class OrdinaryCampaignCommands {
    constructor(page, report) {
        this.page = page; this.report = report;
        this.buildPollTicks = 90; this.buildSettleTicks = 120;
    }
    async order(names, type, target, tile) {
        const ids = await this.page.evaluate(({ names, type, target, tile }) => {
            const d = window.__ra2debug, g = d.game;
            if (g.campaign?.inputLocked) throw Error('Original source input is locked');
            if (target === undefined && tile && [0, 4].includes(type)) {
                const destination = g.map.tiles.getByMapCoords(...tile);
                const withinView = destination && (g.campaign?.launch.edition === 'yr' && g.campaign.launch.semanticsVersion >= 29
                    ? g.map.mapBounds.isWithinPlayerBounds(destination) : g.map.isWithinBounds(destination));
                if (!withinView) throw Error('Ordinary movement requires a playable map cell');
            }
            if (target !== undefined && [2, 3, 7, 8].includes(type)) {
                const object = g.world.getAllObjects().find(object => object.id === target);
                if (object && !g.areFriendly(object, { owner: g.localPlayer })) {
                    const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                    const visible = g.map.tileOccupation.calculateTilesForGameObject(object.tile, object)
                        .some(tile => !shroud.isShrouded(tile, object.tileElevation));
                    if (!visible || object.cloakableTrait?.isCloaked()
                        || object.disguiseTrait?.isDisguised() && !g.localPlayer.sharedDetectDisguiseTrait?.has(object)) {
                        throw Error('Ordinary assistance cannot target an unseen actor: ' + target);
                    }
                }
            }
            const units = (g.localPlayer.campaignControlledPlayers ?? [g.localPlayer]).flatMap(owner => owner.getOwnedObjects())
                .filter(unit => (unit.isUnit() || unit.isBuilding() && ([2, 3].includes(type) || type === 0 && unit.rallyTrait)) && unit.isSpawned && !unit.isDestroyed
                && (names.includes(unit.name) || names.includes(unit.id)));
            if (units.length) d.actionsApi.orderUnits(units.map(unit => unit.id), type,
                ...(target === undefined ? tile ?? (type === 10 ? [] : [units[0].id]) : [target]));
            return units.map(unit => unit.id);
        }, { names, type, target, tile });
        if (ids.length) this.report.commands.push({ kind: 'order', ids, type, target, tile });
        return ids;
    }
    async queue(name, count) {
        const result = await this.page.evaluate(({ name, count }) => {
            const d = window.__ra2debug, g = d.game, type = [2, 3, 7, 1].find(type => g.rules.hasObject(name, type));
            if (g.campaign?.inputLocked) throw Error('Original source input is locked');
            const rules = g.rules.getObject(name, type), production = g.localPlayer.production;
            if (!production.isAvailableForProduction(rules)) return { available: false, name, techLevel: rules.techLevel,
                maxTechLevel: production.maxTechLevel, prerequisites: rules.prerequisite,
                hasFactory: production.hasFactoryFor(rules), meetsPrerequisites: production.meetsPrerequisites(rules) };
            d.actionsApi.queueForProduction(production.getQueueForObject(rules).type, type, name, count);
            return { available: true };
        }, { name, count });
        assert(result.available, JSON.stringify(result)); this.report.commands.push({ kind: 'produce', name, count });
    }
    async cancel(name, count) {
        const before = await this.page.evaluate(({ name, count }) => {
            const d = window.__ra2debug, g = d.game;
            const type = [2, 3, 7, 1].find(type => g.rules.hasObject(name, type));
            if (type === undefined) throw Error('Unknown ordinary production identity: ' + name);
            if (g.campaign?.inputLocked) throw Error('Original source input is locked');
            const rules = g.rules.getObject(name, type), queue = g.localPlayer.production.getQueueForObject(rules);
            const quantity = queue.getAll().filter(item => item.rules === rules).reduce((sum, item) => sum + item.quantity, 0);
            d.actionsApi.unqueueFromProduction(queue.type, type, name, count);
            return { type, queue: queue.type, quantity };
        }, { name, count });
        this.report.commands.push({ kind: 'cancel-production', name, count, ...before }); return before;
    }
    async step(ticks, { defend = true, repair = true, groundDefenders = this.groundDefenders,
        airDefenders = this.airDefenders, groundPriority = this.groundPriority, repairTargets = this.repairTargets,
        groundDefenderGroups = this.groundDefenderGroups, defenseRadius = this.defenseRadius ?? 18,
        autoForceShield = this.autoForceShield, autoDominatorCounterstrike = this.autoDominatorCounterstrike } = {}) {
        let result;
        const expanded = await this.page.evaluate(() => (window.__ra2debug.game.campaign.launch.semanticsVersion ?? 1) >= 14);
        for (let done = 0; done < ticks;) {
            if (expanded) await waitForCampaignFullscreen(this.page);
            result = await this.page.evaluate(({ count, defend, repair, groundDefenders, airDefenders, groundPriority, repairTargets,
                groundDefenderGroups, defenseRadius,
                autoForceShield, autoDominatorCounterstrike }) => {
                const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
                const start = g.currentTick, paused = manager.paused, expanded = (g.campaign.launch.semanticsVersion ?? 1) >= 14;
                if (g.campaign?.captureMedia?.().movies.some(movie => movie.placement === 'fullscreen' || movie.placement === 'transmission-paused')) {
                    throw Error('Original fullscreen media must complete before manual simulation advancement');
                }
                const own = (g.localPlayer.campaignControlledPlayers ?? [g.localPlayer]).flatMap(owner => owner.getOwnedObjects())
                    .filter(unit => unit.isSpawned && !unit.isDestroyed);
                const ordinarySuperWeapons = [];
                if ((autoForceShield || autoDominatorCounterstrike) && !g.campaign?.inputLocked) {
                    const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                    const weapons = g.localPlayer.superWeaponsTrait.getAll();
                    if (autoForceShield) {
                        const effect = g.traits.getAll().flatMap(trait => Array.isArray(trait.effects) ? trait.effects : [])
                            .find(effect => effect.type === 7 && effect.owner !== g.localPlayer
                                && !g.alliances.areAllied(g.localPlayer, effect.owner) && effect.status !== 2
                                && !shroud.isShrouded(effect.tile, 0)
                                && own.some(unit => unit.isBuilding()
                                    && Math.hypot(unit.tile.rx - effect.tile.rx, unit.tile.ry - effect.tile.ry) < 8));
                        if (effect && weapons.some(weapon => weapon.rules.type === 10 && weapon.status === 2)) {
                            d.actionsApi.activateSuperWeapon(10, { rx: effect.tile.rx, ry: effect.tile.ry });
                            ordinarySuperWeapons.push({ type: 10, tick: g.currentTick, target: [effect.tile.rx, effect.tile.ry],
                                assistance: 'Ordinary shield response to an actually visible original Dominator warning.' });
                        }
                    }
                    if (autoDominatorCounterstrike && weapons.some(weapon => weapon.rules.type === 0 && weapon.status === 2)) {
                        const target = g.world.getAllObjects().find(unit => unit.name === 'YAPPET' && unit.isSpawned && !unit.isDestroyed
                            && unit.owner !== g.localPlayer && !g.alliances.areAllied(g.localPlayer, unit.owner)
                            && !shroud.isShrouded(unit.tile, unit.tileElevation));
                        if (target) {
                            d.actionsApi.activateSuperWeapon(0, { rx: target.tile.rx, ry: target.tile.ry });
                            ordinarySuperWeapons.push({ type: 0, tick: g.currentTick, id: target.id, target: [target.tile.rx, target.tile.ry],
                                assistance: 'Ordinary charged paid nuclear strike at the revealed original Dominator.' });
                        }
                    }
                }
                if (repair && !g.campaign?.inputLocked) {
                    for (const id of repairTargets ?? []) {
                        const target = g.world.hasObjectId(id) && g.world.getObjectById(id);
                        const engineer = own.find(unit => unit.isInfantry() && unit.rules.engineer);
                        if (target && engineer && target.rules.repairable && target.healthTrait.health < 80)
                            d.actionsApi.orderUnits([engineer.id], 15, id);
                    }
                    for (const building of own.filter(unit => unit.isBuilding() && unit.healthTrait.health < 80 && unit.rules.clickRepairable)) {
                        const repair = building.traits.getAll().find(trait => 'healLeftover' in trait && typeof trait.isDisabled === 'function');
                        if (repair?.isDisabled()) d.actionsApi.toggleRepairWrench(building.id);
                    }
                }
                if (defend && !g.campaign?.inputLocked) {
                    const anchors = own.filter(unit => unit.isBuilding() && ['NACNST', 'GACNST', 'NAPSYB', 'NAYARD', 'GAYARD'].includes(unit.name));
                    const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                    const enemies = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
                        && !unit.owner.isNeutral && unit.owner !== g.localPlayer && !g.alliances.areAllied(g.localPlayer, unit.owner)
                        && !shroud.isShrouded(unit.tile, unit.tileElevation)
                        && !unit.cloakableTrait?.isCloaked()
                        && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit))
                        && anchors.some(anchor => Math.hypot(anchor.tile.rx - unit.tile.rx, anchor.tile.ry - unit.tile.ry) < defenseRadius));
                    for (const kind of ['air', 'ground', 'naval']) {
                        const names = kind === 'air' ? airDefenders ?? ['HTK', 'FLAKT', 'FV'] : kind === 'naval' ? ['SUB', 'HYD', 'DEST', 'DLPH']
                            : groundDefenders ?? ['HTNK', 'MTNK', 'E2', 'E1', 'SHK', 'V3', 'DRON', ...enemies.some(unit => unit.zone === 1) ? [] : ['HTK', 'FV']];
                        const groups = kind === 'ground' && groundDefenderGroups ? groundDefenderGroups
                            : [{ names, priority: kind === 'ground' ? groundPriority : undefined }];
                        for (const group of groups) {
                            if (group.onlyWithoutAirTargets && enemies.some(unit => unit.zone === 1)) continue;
                            const target = enemies.filter(unit => (kind === 'air' ? unit.zone === 1
                                : kind === 'naval' ? !!unit.rules.naval : !unit.rules.naval && unit.zone !== 1)
                                && (!group.targetTypes || group.targetTypes.some(type =>
                                    type === 'infantry' && unit.isInfantry() || type === 'vehicle' && unit.isVehicle()
                                    || type === 'building' && unit.isBuilding())))
                                .sort((a, b) => {
                                    const priority = unit => group.priority?.includes(unit.name)
                                        ? group.priority.indexOf(unit.name) : Number.MAX_SAFE_INTEGER;
                                    const distance = unit => Math.min(...anchors.map(anchor =>
                                        Math.hypot(anchor.tile.rx-unit.tile.rx, anchor.tile.ry-unit.tile.ry)));
                                    return priority(a)-priority(b) || (group.closest ? distance(a)-distance(b) : 0) || a.id-b.id;
                                })[0];
                            if (!target) continue;
                            const army = own.filter(unit => (group.names.includes(unit.name) || group.names.includes(unit.id))
                                && Math.hypot(unit.tile.rx-target.tile.rx, unit.tile.ry-target.tile.ry) < 28);
                            if (army.length) d.actionsApi.orderUnits(army.map(unit => unit.id), 2, target.id);
                        }
                    }
                }
                manager.setPaused(false); manager.setCampaignPaused(false);
                try {
                    for (let i = 0; i < count && !g.campaign.result && !g.campaign.failure; i++) {
                        if (expanded && g.campaign.captureMedia?.().movies.some(movie => movie.placement === 'fullscreen' || movie.placement === 'transmission-paused')) break;
                        manager.doGameTurn(performance.now());
                    }
                }
                finally { manager.setCampaignPaused(true); manager.setPaused(paused); }
                return { tick: g.currentTick, result: g.campaign.result, failure: g.campaign.failure, advanced: g.currentTick - start,
                    ordinarySuperWeapons };
            }, { count: Math.min(autoForceShield ? 15 : repairTargets?.length ? 30 : 90, ticks - done), defend, repair,
                groundDefenders, airDefenders, groundPriority, repairTargets, groundDefenderGroups, defenseRadius,
                autoForceShield, autoDominatorCounterstrike });
            if (result.ordinarySuperWeapons.length) this.report.commands.push(...result.ordinarySuperWeapons.map(value => ({ kind: 'superweapon', ...value })));
            assert(!result.failure, result.failure); assert.notEqual(result.result, 'defeat', 'Original source defeat at tick ' + result.tick);
            if (result.result) break;
            assert(!expanded || result.advanced > 0, 'Manual source advancement made no progress');
            done += expanded ? result.advanced : 90;
        }
        return result;
    }
    async build(name, near) {
        await this.queue(name, 1);
        return this.finishBuild(name, near);
    }
    async finishBuild(name, near) {
        for (let i = 0; i < Math.ceil(10800 / this.buildPollTicks); i++) {
            await this.step(this.buildPollTicks);
            assert(await this.page.evaluate(() => [...window.__ra2debug.game.localPlayer.buildings]
                .some(unit => !unit.isDestroyed && unit.rules.constructionYard)), 'Original combat destroyed the ordinary construction yard');
            assert(await this.page.evaluate(name => {
                const g = window.__ra2debug.game, rules = g.rules.getBuilding(name);
                return g.localPlayer.production.getQueueForObject(rules).getAll().some(item => item.rules === rules);
            }, name), 'Original combat canceled ordinary building production: ' + name);
            const tile = await this.page.evaluate(({ name, near }) => {
                const d = window.__ra2debug, g = d.game, rule = g.rules.getBuilding(name), queue = g.localPlayer.production.getQueueForObject(rule);
                if (g.campaign?.inputLocked) return;
                if (queue.status !== 3 || queue.getFirst()?.rules !== rule) return;
                const worker = g.getConstructionWorker(g.localPlayer), candidates = [];
                const anchor = near ? [...g.localPlayer.buildings].sort((a, b) => Math.hypot(a.tile.rx - near[0], a.tile.ry - near[1])
                    - Math.hypot(b.tile.rx - near[0], b.tile.ry - near[1]))[0] : [...g.localPlayer.buildings].find(unit => unit.rules.constructionYard);
                if (!anchor) throw Error('Ordinary construction requires a surviving yard');
                for (let y = anchor.tile.ry - 18; y <= anchor.tile.ry + 18; y++) for (let x = anchor.tile.rx - 18; x <= anchor.tile.rx + 18; x++) {
                    const tile = g.map.tiles.getByMapCoords(x, y);
                    if (tile && worker.canPlaceAt(name, tile, { normalizedTile: true })) candidates.push([x, y]);
                }
                const goal = near ?? [anchor.tile.rx, anchor.tile.ry];
                candidates.sort((a, b) => Math.hypot(a[0] - goal[0], a[1] - goal[1]) - Math.hypot(b[0] - goal[0], b[1] - goal[1])
                    || a[1] - b[1] || a[0] - b[0]);
                if (!candidates.length) throw Error('No legal ordinary placement: ' + name);
                d.actionsApi.placeBuilding(name, ...candidates[0]); return candidates[0];
            }, { name, near });
            if (tile) { this.report.commands.push({ kind: 'place', name, tile }); await this.step(this.buildSettleTicks); return tile; }
        }
        throw Error('Ordinary production stalled: ' + name);
    }
    async attackVisible(names, ownerName, kinds = 'any') {
        return this.page.evaluate(({ names, ownerName, kinds }) => {
            const d = window.__ra2debug, g = d.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            if (g.campaign?.inputLocked) throw Error('Original source input is locked');
            const army = (g.localPlayer.campaignControlledPlayers ?? [g.localPlayer]).flatMap(owner => owner.getOwnedObjects())
                .filter(unit => unit.isSpawned && !unit.isDestroyed && (names.includes(unit.name) || names.includes(unit.id)));
            if (!army.length) return;
            const center = army.reduce((p, unit) => [p[0] + unit.tile.rx / army.length, p[1] + unit.tile.ry / army.length], [0, 0]);
            const target = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
                && !unit.rules.invisibleInGame && unit.rules.legalTarget !== false
                && !unit.owner.isNeutral && unit.owner !== g.localPlayer && !g.alliances.areAllied(g.localPlayer, unit.owner)
                && (!ownerName || unit.owner.name === ownerName) && !shroud.isShrouded(unit.tile, unit.tileElevation)
                && !unit.cloakableTrait?.isCloaked()
                && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit))
                && (kinds === 'any' || kinds === 'buildings' && unit.isBuilding() || kinds === 'units' && unit.isUnit()
                    || kinds === 'ground' && unit.isUnit() && unit.zone !== 1 && !unit.rules.naval
                    || kinds === 'air' && unit.zone === 1
                    || kinds === 'naval' && unit.isUnit() && !!unit.rules.naval)
                && (kinds === 'buildings' || !!unit.rules.naval === !!army[0].rules.naval))
                .sort((a, b) => Math.hypot(a.tile.rx - center[0], a.tile.ry - center[1])
                    - Math.hypot(b.tile.rx - center[0], b.tile.ry - center[1]) || a.id - b.id)[0];
            if (target) { d.actionsApi.orderUnits(army.map(unit => unit.id), 2, target.id);
                return { target: target.id, name: target.name, owner: target.owner.name, ids: army.map(unit => unit.id) }; }
        }, { names, ownerName, kinds });
    }
    async inspect(label) {
        return this.page.evaluate(label => {
            const g = window.__ra2debug.game, c = g.campaign;
            const describe = unit => ({ id: unit.id, name: unit.name, owner: unit.owner.name, tile: unit.tile ? [unit.tile.rx, unit.tile.ry] : null,
                health: unit.healthTrait?.health, spawned: unit.isSpawned, passengers: unit.transportTrait?.units.map(passenger => passenger.id) });
            return { label, tick: g.currentTick, hash: g.getHash(), result: c.result, failure: c.failure, credits: g.localPlayer.credits,
                own: (g.localPlayer.campaignControlledPlayers ?? [g.localPlayer]).flatMap(owner => owner.getOwnedObjects(true))
                    .filter(unit => !unit.isDestroyed).map(describe),
                houses: [...c.houses].map(([name, owner]) => ({ name, credits: owner.credits, objects: owner.getOwnedObjects(true).filter(unit => !unit.isDestroyed).map(describe) })),
                sourceTrace: c.trace, baseTrace: c.baseBuilder.trace, timer: g.countdownTimer.snapshot(),
                sourceAiTrace: c.teams.sourceAi?.trace, sourceAiState: c.teams.sourceAi?.snapshot(),
                teams: [...c.teams.instances.values()].map(team => ({ type: team.type, phase: team.phase, line: team.line,
                    members: team.members.filter(unit => !unit.isDestroyed).map(describe) })),
                queues: g.localPlayer.production.getAllQueues().map(queue => ({ type: queue.type, status: queue.status,
                    items: queue.getAll().map(item => ({ name: item.rules.name, quantity: item.quantity, progress: item.progress })) })) };
        }, label);
    }
}

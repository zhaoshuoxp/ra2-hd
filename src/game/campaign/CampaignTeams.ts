import { CampaignDefinition, waypointNumber } from '../../data/campaign/CampaignDefinition';
import type { CampaignTeam, CampaignAiTrigger, CampaignDifficulty } from '../../data/campaign/CampaignDefinition';
import { ObjectType } from '../../engine/type/ObjectType';
import { MoveTask } from '../gameobject/task/move/MoveTask';
import { ParadropTask } from '../gameobject/task/ParadropTask';
import { EvacuateTransportTask } from '../gameobject/task/EvacuateTransportTask';
import { DeployIntoTask } from '../gameobject/task/morph/DeployIntoTask';
import { CampaignDeployIntoTask } from './CampaignDeployIntoTask';
import { ScatterTask } from '../gameobject/task/ScatterTask';
import { GatherOreTask } from '../gameobject/task/harvester/GatherOreTask';
import { TaskStatus } from '../gameobject/task/system/TaskStatus';
import { OrderFactory } from '../order/OrderFactory';
import { OrderType } from '../order/OrderType';
import { AttackOrder } from '../order/AttackOrder';
import { Infantry } from '../gameobject/Infantry';
import { StanceType } from '../gameobject/infantry/StanceType';
import { VeteranLevel } from '../gameobject/unit/VeteranLevel';
import { ZoneType } from '../gameobject/unit/ZoneType';
import { RadialTileFinder } from '../map/tileFinder/RadialTileFinder';
import { ParadropEffect } from '../superweapon/ParadropEffect';
import { Vector2 } from '../math/Vector2';
import { FacingUtil } from '../gameobject/unit/FacingUtil';
import { UnlandableTrait } from '../gameobject/trait/UnlandableTrait';
import { Coords } from '../Coords';
import { canCampaignChargeTarget } from './CampaignChargedWeapon';
import { AttackMoveTask } from '../gameobject/task/move/AttackMoveTask';
import { TurnTask } from '../gameobject/task/TurnTask';
import { CallbackTask } from '../gameobject/task/system/CallbackTask';
import { CampaignUnloadTask } from './CampaignUnloadTask';
import { originalCampaignStartingVeterancy } from './CampaignStartingVeterancy';
import { CampaignVehicleParadropTask } from './CampaignVehicleParadropTask';
import { EnterTransportTask } from '../gameobject/task/EnterTransportTask';
import { campaignAttackTargetCategories } from './CampaignSupport';
import { CampaignAi } from './CampaignAi';
import { SuperWeaponStatus } from '../SuperWeapon';
import { SuperWeaponType } from '../type/SuperWeaponType';
import { SuperWeaponsTrait } from '../trait/SuperWeaponsTrait';
import { TriggerAnimEvent } from '../event/TriggerAnimEvent';
import { MovementZone } from '../type/MovementZone';
import { GarrisonBuildingTask } from '../gameobject/task/GarrisonBuildingTask';
import { EnterBunkerTask } from '../gameobject/task/EnterBunkerTask';
import { CampaignEnterBuildingTask } from './CampaignEnterBuildingTask';
import { globalRules } from '../rules/globalRules';

export const campaignScriptOpcodes = new Set([0, 1, 2, 3, 5, 6, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 20, 21, 24, 25, 34, 37, 38, 39, 40, 41, 42, 43, 46, 47, 48, 49, 50, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64]);
export interface CampaignTeamInstance {
    id: number;
    type: string;
    script?: string;
    owner: any;
    members: any[];
    phase: 'assembling' | 'flying' | 'phasing' | 'active' | 'holding' | 'finished';
    line: number;
    started: boolean;
    waitUntil?: number;
    openingAttackUntil?: number;
    target?: any;
    tasks: { unit: any; task: any }[];
    aiTrigger?: string;
    success: boolean;
    groundShot?: boolean;
    scoutHouse?: string;
    flight?: { plane: any; target: any; exit: any; remaining: string[]; dropping: boolean; nextDropTick?: number };
}

const yes = (team: CampaignTeam, key: string) => team.properties[key]?.toLowerCase() === 'yes';
const alive = (unit: any) => !unit.isDestroyed && !unit.isCrashing;
const distance = (a: any, b: any) => Math.hypot(a.rx - b.rx, a.ry - b.ry);
const ended = (task: any) => task.status === TaskStatus.Finished || task.status === TaskStatus.Cancelled;

export function campaignParadropOrigin(edge: string, fullSize: { width: number; height: number }): { rx: number; ry: number } {
    const { width, height } = fullSize;
    const points: Record<string, [number, number]> = { north: [width / 2, 0], east: [width, height / 2],
        south: [width / 2, height], west: [0, height / 2] };
    const point = points[edge.toLowerCase()];
    if (!point) throw new Error(`Unsupported campaign reinforcement edge: ${edge}`);
    // Display coordinates form the rectangular map; simulation cells are rotated.
    return { rx: Math.round((point[0] + point[1] + 2) / 2), ry: Math.round((point[1] - point[0] + width) / 2) };
}

// Retail teams own membership and script progress. Movement, combat, harvesting,
// deployment and transport still use the same simulation tasks as player orders.
export class CampaignTeams {
    readonly instances = new Map<number, CampaignTeamInstance>();
    readonly production = new Set<any>();
    readonly aiEnabled = new Set<any>();
    readonly trace: { tick: number; team: string; instance: number; line: number; opcode: number }[] = [];
    private nextId = 1;
    private aiNext = new Map<any, number>();
    private aiWeights = new Map<string, number>();
    private assignments = new Map<any, CampaignTeamInstance>();
    private initial = new Map<any, { group: number; recruitable: boolean; mission: string }>();
    private orders: OrderFactory;
    private hunters = new Set<any>();
    private recruitmentEpoch = 0;
    private released = new Map<any, { until: number; nextTeam: number }>();
    private unloading = new Map<any, CampaignTeamInstance>();
    private retreating = new Map<any, CampaignTeamInstance>();
    private detachedFlights = new Set<CampaignTeamInstance>();
    private scoutedHouses = new Map<any, Set<string>>();
    readonly sourceAi?: CampaignAi;

    constructor(private readonly definition: CampaignDefinition, private readonly game: any,
        private readonly house: (reference: string | number) => any,
        private readonly localVariable: (id: string, value: boolean) => void = () => { throw new Error('Local variable executor is unavailable'); },
        private readonly semanticsVersion = 2,
        private readonly globalVariable: (id: number, value: boolean) => void = () => { throw new Error('Global variable executor is unavailable'); },
        private readonly centerCamera: (members: any[], speed: number, sourceCell?: any) => void = () => { throw new Error('Team camera executor is unavailable'); },
        private readonly playSourceSound: (index: number) => void = () => { throw new Error('Team sound executor is unavailable'); }) {
        this.orders = new OrderFactory(game, game.map);
        for (const trigger of definition.aiTriggers.values()) this.aiWeights.set(trigger.id, trigger.weight);
        if (semanticsVersion >= 6) this.sourceAi = new CampaignAi(definition, game, house, {
            instances: this.instances, production: this.production, aiEnabled: this.aiEnabled,
            create: (...args) => this.create(...args), finish: team => this.finish(team),
        });
    }

    bindInitial(unit: any, placement: any): void {
        if (this.game?.gameOpts?.campaign?.chargingVersion === 1 && this.definition.filename === 'sov05u.map' && unit.name === 'CAPARS01'
            && unit.primaryWeapon?.rules.name === 'EiffelBolt') {
            const size = this.game.map.tiles.getMapSize();
            unit.campaignMapWeaponRange = size.width + size.height;
        }
        if (!unit.isUnit()) return;
        const section = unit.isInfantry() ? 'Infantry' : unit.isAircraft() ? 'Aircraft' : 'Units';
        const rows = this.definition.ini.getSection(section)?.entries.values() ?? [];
        for (const raw of rows) {
            const p = String(raw).split(',');
            if (p[0] !== placement.owner || p[1] !== unit.name || Number(p[3]) !== placement.rx || Number(p[4]) !== placement.ry
                || unit.isInfantry() && Number(p[5]) !== placement.subCell) continue;
            const infantry = unit.isInfantry();
            const mission = p[6];
            this.initial.set(unit, { group: Number(p[infantry ? 10 : 11]), recruitable: p[infantry ? 13 : 12] === '1', mission });
            if (mission === 'Area Guard') unit.guardMode = true;
            else if (mission === 'Guard') { unit.guardMode = false; unit.defaultToGuardArea = false; }
            else if (mission === 'Attack' && this.semanticsVersion >= 10) {
                // Original targetless Attack enters idle behavior. Electric
                // assault infantry then acquire adjacent own charge receivers.
                unit.guardMode = false; unit.defaultToGuardArea = false;
            }
            else if (mission === 'Move' && this.semanticsVersion >= 11) {
                // The source placement provides no navigation destination.
                // Original Move returns to idle until an actual order/team
                // supplies one; retain its identity and recruitment metadata.
                unit.guardMode = false; unit.defaultToGuardArea = false;
            }
            else if (mission === 'Enter' && this.semanticsVersion >= 13) {
                // Placements carry no navigation target. Original targetless
                // Enter returns to idle; retain normal on-spawn miner work.
                unit.guardMode = false; unit.defaultToGuardArea = false;
            }
            else if (mission === 'Return' && infantry && this.semanticsVersion >= 19) {
                // Infantry inherits the targetless base Return executor, which
                // performs no navigation. Preserve the original mission and
                // recruitment metadata until a real order/team takes over.
                unit.guardMode = false; unit.defaultToGuardArea = false;
            }
            else if (mission === 'Hunt' && this.semanticsVersion >= 12) {
                unit.guardMode = false; unit.defaultToGuardArea = false;
                // Reuse the normal hunt executor without discarding on-spawn
                // work, including a harvester's ordinary gathering callback.
                this.hunters.add(unit);
            }
            else if (mission === 'Sticky' && (this.semanticsVersion >= 15
                || this.semanticsVersion >= 8 && !unit.primaryWeapon && !unit.secondaryWeapon)) {
                // Sticky retains ordinary weapon acquisition while its original
                // Paralyzed/Recruitable rules prohibit reaction movement/recruitment.
                unit.guardMode = false; unit.defaultToGuardArea = false; unit.campaignSticky = true;
            }
            else if (mission === 'Sleep') unit.campaignSleeping = true;
            else if (mission === 'Harmless' && this.semanticsVersion >= 23) {
                // POWs retain a distinct mission across house transfer. Native
                // Harmless has no movement; its rules control acquisition,
                // retaliation and recruitment until a real order replaces it.
                unit.guardMode = false; unit.defaultToGuardArea = false; unit.campaignHarmless = true;
            }
            else if (mission === 'Harvest' && unit.harvesterTrait) unit.unitOrderTrait.addTask(new GatherOreTask(this.game, undefined, true));
            else throw new Error(`[${section}] ${unit.name} (${placement.rx},${placement.ry}) unsupported initial mission ${mission}`);
            return;
        }
        throw new Error(`Campaign placement metadata missing: ${unit.name}#${unit.id}`);
    }

    create(type: string, reinforce = false, waypoint?: number, aiTrigger?: string, contextOwner?: any, chrono = false): CampaignTeamInstance {
        if (chrono && (this.semanticsVersion < 9 || !reinforce)) throw new Error('Chrono reinforcement requires campaign interpreter 9');
        const spec = this.require(type), owner = contextOwner ?? this.house(spec.house);
        const team: CampaignTeamInstance = { id: this.nextId++, type, owner, members: [], phase: 'assembling',
            line: 0, started: false, tasks: [], aiTrigger, success: false };
        this.instances.set(team.id, team);
        if (reinforce) {
            const point = waypoint ?? (spec.properties.Waypoint ? waypointNumber(spec.properties.Waypoint) : undefined);
            if (point === undefined) throw new Error(`[${type}] reinforcement requires a waypoint`);
            const target = this.waypoint(point);
            const units = this.definition.taskForces.get(spec.taskForce)!.units.flatMap(entry => Array(entry.count).fill(entry.type)) as string[];
            if (yes(spec, 'Droppod') && !chrono) this.startParadrop(team, spec, target, units);
            else {
                const ordered = yes(spec, 'Full') ? [...units].sort((a, b) => this.semanticsVersion >= 28
                    ? (this.rules(b).passengers ?? 0) - (this.rules(a).passengers ?? 0)
                    : Number(!!this.rules(b).passengers) - Number(!!this.rules(a).passengers)) : units;
                for (const name of ordered) {
                    const rules = this.rules(name);
                    const transport = yes(spec, 'Full') && (this.semanticsVersion >= 28 || !rules.passengers)
                        && team.members.find(unit => unit.transportTrait && !unit.limboData
                        && unit.transportTrait.getAvailableCapacity() >= rules.size && rules.size <= unit.rules.sizeLimit);
                    if (transport) {
                        const unit = this.game.createUnitForPlayer(rules, owner);
                        const level = Number(spec.properties.VeteranLevel ?? 1) - 1;
                        if (level > 0) unit.veteranTrait?.setVeteranLevel(level as VeteranLevel);
                        if (originalCampaignStartingVeterancy(this.game.gameOpts?.campaign)) unit.veteranTrait?.activateStartingAbilities(this.game);
                        unit.position.tile = transport.tile;
                        unit.limboData = { selected: false, inTransport: true };
                        transport.transportTrait.units.push(unit); this.add(team, unit);
                    } else this.add(team, this.spawn(name, owner, target, spec));
                }
                this.loadPassengers(team);
                team.phase = 'active';
                if (chrono) {
                    const delay = this.game.rules.getIni().getSection('General')?.getNumber('ChronoReinfDelay', 60) ?? 60;
                    if (!Number.isSafeInteger(delay) || delay < 0) throw new Error('Invalid original ChronoReinfDelay');
                    team.phase = 'phasing'; team.waitUntil = this.game.currentTick + delay;
                    const warpIn = this.semanticsVersion >= 44 && this.game.gameOpts?.campaign?.edition === 'yr'
                        ? globalRules(this.game.rules).getString('WarpIn')
                        : this.game.rules.getIni().getSection('AudioVisual')?.getString('WarpIn');
                    if (!warpIn) throw new Error('Original chrono arrival animation is missing');
                    for (const unit of team.members.filter(unit => unit.isSpawned)) {
                        if (delay) unit.warpedOutTrait.setTimed(delay, false, this.game);
                        if (!this.game.campaign?.restoring) this.game.events.dispatch(new TriggerAnimEvent(warpIn, unit.tile));
                    }
                }
            }
        } else this.recruit(team);
        return team;
    }

    destroy(type: string): void {
        this.require(type);
        for (const team of this.instances.values()) if (team.type === type) this.finish(team);
    }

    flash(type: string, frames: number, tick: number): void {
        this.require(type);
        if (!Number.isSafeInteger(frames) || frames < 0) throw new Error(`Invalid source team flash duration: ${frames}`);
        for (const team of this.instances.values()) if (team.type === type && team.phase !== 'finished') {
            for (const unit of team.members) if (alive(unit) && unit.isSpawned) unit.campaignFlashUntil = tick + frames;
        }
    }

    release(unit: any): void {
        if (this.semanticsVersion >= 4) this.hunters.delete(unit);
        const team = this.assignments.get(unit);
        if (!team) return;
        team.members = team.members.filter(member => member !== unit);
        team.tasks = team.tasks.filter(entry => entry.unit !== unit);
        this.assignments.delete(unit);
        this.unloading.delete(unit);
        this.retreating.delete(unit);
    }

    noteOwnerChange(unit: any): void {
        this.hunters.delete(unit);
        // Script 20 changes the team's house before its members. Independent
        // captures must leave the previous house's team and its future work.
        if (this.assignments.get(unit)?.owner !== unit.owner) this.release(unit);
        if (unit.mindControllableTrait?.getController()) {
            unit.campaignSleeping = false;
            if (this.semanticsVersion >= 23) unit.campaignHarmless = false;
        }
    }

    hunt(owner: any): void {
        for (const team of this.instances.values()) if (team.owner === owner) this.finish(team);
        for (const unit of owner.getOwnedObjects(true)) if (unit.isUnit() && alive(unit)) {
            unit.campaignSleeping = false;
            if (this.semanticsVersion >= 23) unit.campaignHarmless = false;
            unit.unitOrderTrait.clearOrders(); unit.unitOrderTrait.cancelAllTasks(); this.hunters.add(unit);
        }
    }

    noteShot(unit: any): void {
        const team = this.assignments.get(unit);
        if (team?.started && this.definition.scripts.get(team.script ?? this.require(team.type).script)?.instructions[team.line]?.opcode === 1
            && !this.objectTarget(team.target)) team.groundShot = true;
    }

    private objectTarget(target: any): boolean {
        // Tiles also have an id. Only world objects can be passed to Target as
        // actors; preserve the old discriminator when replaying v1/v2 journals.
        return this.semanticsVersion >= 3 ? typeof target?.isTechno === 'function' : target?.id !== undefined;
    }

    private require(type: string): CampaignTeam {
        const spec = this.definition.teams.get(type);
        if (!spec) throw new Error(`Unknown campaign team: ${type}`);
        return spec;
    }
    private waypoint(number: number): any {
        const tile = this.game.map.getTileAtWaypoint(number);
        if (!tile) throw new Error(`Missing campaign waypoint: ${number}`);
        return tile;
    }
    private rules(name: string): any {
        for (const type of [ObjectType.Infantry, ObjectType.Vehicle, ObjectType.Aircraft]) {
            if (this.game.rules.hasObject(name, type)) return this.game.rules.getObject(name, type);
        }
        throw new Error(`Missing task force unit rules: ${name}`);
    }
    private add(team: CampaignTeamInstance, unit: any): void {
        const previous = this.assignments.get(unit);
        if (previous) previous.members = previous.members.filter(member => member !== unit);
        this.assignments.set(unit, team); team.members.push(unit); unit.campaignSleeping = false;
        if (this.semanticsVersion >= 23) unit.campaignHarmless = false;
        if (unit.campaignSticky) unit.campaignSticky = false;
        this.unloading.delete(unit);
        this.retreating.delete(unit);
        this.hunters.delete(unit);
        const tag = this.definition.tags.get(this.require(team.type).properties.Tag);
        if (tag) {
            unit.tag = { id: tag.id, triggerId: tag.trigger, repeatType: tag.repeat, name: tag.name };
            if (this.semanticsVersion >= 38 && this.game.gameOpts?.campaign?.edition === 'yr')
                this.game.campaign.noteSourceTeamTag(unit, team.type, team.id);
        }
        if (unit.isInfantry()) unit.isPanicked = false;
        unit.unitOrderTrait.clearOrders(); unit.unitOrderTrait.cancelAllTasks();
    }
    private finish(team: CampaignTeamInstance): void {
        if (team.phase === 'finished') return;
        if (this.semanticsVersion >= 16 && team.flight?.remaining.length && alive(team.flight.plane)) this.detachedFlights.add(team);
        team.phase = 'finished';
        for (const member of team.members) if (this.assignments.get(member) === team) {
            this.assignments.delete(member);
            this.unloading.delete(member);
            this.retreating.delete(member);
            // Let a trigger-created replacement claim released members before
            // older background pools. Old journals retain their prior ordering.
            if (this.semanticsVersion >= 3) this.released.set(member, { until: this.recruitmentEpoch + 1, nextTeam: this.nextId });
        }
        if (this.sourceAi) this.sourceAi.recordOutcome(team);
        else if (team.aiTrigger) {
            const trigger = this.definition.aiTriggers.get(team.aiTrigger)!;
            const current = this.aiWeights.get(trigger.id)!;
            const ai = this.game.rules.getIni().getSection('General');
            const delta = ai?.getNumber(team.success ? 'AITriggerSuccessWeightDelta' : 'AITriggerFailureWeightDelta', team.success ? 20 : -50) ?? 0;
            this.aiWeights.set(trigger.id, Math.max(trigger.minimumWeight, Math.min(trigger.maximumWeight, current + delta)));
        }
    }

    private deleteMembers(team: CampaignTeamInstance): void {
        const passengers = this.semanticsVersion >= 43 && this.game.gameOpts?.campaign?.edition === 'yr';
        if (passengers) {
            const removed = new Set(team.members);
            for (const carrier of new Set<any>([...this.game.world.getAllObjects(), ...team.members])) {
                const units = carrier.transportTrait?.units;
                if (units) for (let i = units.length - 1; i >= 0; i--) if (removed.has(units[i])) units.splice(i, 1);
            }
        }
        for (const member of team.members) {
            if (passengers && !member.isSpawned) {
                if (!member.limboData?.inTransport) throw Error('Original team deletion has an untracked unspawned member');
                member.owner.removeOwnedObject(member);
            } else this.game.unspawnObject(member);
            member.dispose();
        }
    }

    private recruit(team: CampaignTeamInstance): void {
        const spec = this.require(team.type), group = Number(spec.properties.Group ?? -1);
        const originalHandoff = this.game.gameOpts?.campaign?.teamRecruitmentVersion === 1 && !team.owner.isAi;
        const origin = originalHandoff && spec.properties.Waypoint && spec.properties.Waypoint !== '<none>'
            ? this.waypoint(waypointNumber(spec.properties.Waypoint)) : undefined;
        for (const needed of this.definition.taskForces.get(spec.taskForce)!.units) {
            let missing = needed.count - team.members.filter(unit => alive(unit) && unit.name === needed.type).length;
            const candidates = team.owner.getOwnedObjects(true).filter((unit: any) => {
                if (!alive(unit) || !unit.isUnit() || unit.name !== needed.type || team.members.includes(unit) || unit.limboData) return false;
                // Do not detach a transport from its live payload and delivery
                // script. The return pool may be assembling before it unloads.
                if (unit.transportTrait?.units.length) return false;
                const released = this.released.get(unit);
                if (released && team.id < released.nextTeam && this.recruitmentEpoch <= released.until) return false;
                const initial = this.initial.get(unit), other = this.assignments.get(unit);
                if (initial && (!initial.recruitable || group >= 0 && initial.group !== group
                    && !(this.semanticsVersion >= 17 && yes(spec, 'Recruiter')))) return false;
                if (this.semanticsVersion >= 8 && unit.campaignSticky
                    && this.game.rules.getIni().getSection('Sticky')?.getBool('Recruitable', true) === false) return false;
                if (this.semanticsVersion >= 23 && unit.campaignHarmless
                    && this.game.rules.getIni().getSection('Harmless')?.getBool('Recruitable', true) === false) return false;
                if (other && other.phase !== 'finished') {
                    const previous = this.require(other.type);
                    // Recruiter widens source group selection. It is not a
                    // prerequisite for a higher-priority team's handoff.
                    const complete = originalHandoff && other.phase === 'holding'
                        && other.line >= this.definition.scripts.get(previous.script)!.instructions.length;
                    if (!complete && !yes(previous, 'AreTeamMembersRecruitable')
                        || this.semanticsVersion < 17 && !yes(spec, 'Recruiter')
                        || Number(previous.properties.Priority ?? 0) >= Number(spec.properties.Priority ?? 0)) return false;
                    const instruction = this.definition.scripts.get(previous.script)?.instructions[other.line];
                    const opcode = instruction?.opcode;
                    const leaving = this.retreating.get(unit) === other || this.semanticsVersion >= 3 && (opcode === 3 || opcode === 16)
                        && !this.game.map.mapBounds.isWithinBounds(this.waypoint(Number(instruction!.params[0])));
                    const mission = opcode === 8 || opcode === 9 || this.unloading.get(unit) === other ? 'Unload'
                        : leaving ? 'Retreat' : undefined;
                    if (mission && this.game.rules.getIni().getSection(mission)?.getBool('Recruitable', true) === false) return false;
                }
                return true;
            }).sort((a: any, b: any) => (origin ? distance(a.tile, origin) - distance(b.tile, origin) : 0) || a.id - b.id);
            while (missing > 0 && candidates.length) { this.add(team, candidates.shift()); missing--; }
            if (missing > 0 && this.production.has(team.owner)) {
                const rules = this.rules(needed.type), production = team.owner.production;
                // A team requests real factory output, with its cost, prerequisites
                // and build time. Reinforcement creation never enters this path.
                if (production.isAvailableForProduction(rules)) {
                    const queue = production.getQueueForObject(rules);
                    const queued = queue.find(rules).reduce((sum: number, entry: any) => sum + entry.quantity, 0);
                    if (queued < missing) queue.push(rules, missing - queued, this.game.sellTrait.computePurchaseValue(rules, team.owner));
                }
            }
        }
        const complete = this.definition.taskForces.get(spec.taskForce)!.units.every(entry =>
            team.members.filter(unit => alive(unit) && unit.name === entry.type).length >= entry.count);
        if (complete) { this.loadPassengers(team); team.phase = 'active'; }
    }

    private spawn(name: string, owner: any, target: any, spec: CampaignTeam): any {
        const unit = this.game.createUnitForPlayer(this.rules(name), owner);
        const airborne = this.semanticsVersion >= 12 && unit.rules.movementZone === MovementZone.Fly;
        const sourceNaval = this.semanticsVersion >= 25 && !!unit.rules.naval;
        const groundEntry = this.semanticsVersion >= 27 && !airborne && !sourceNaval;
        const first = groundEntry ? this.definition.scripts.get(spec.script)?.instructions[0] : undefined;
        const destination = first && [3, 16].includes(first.opcode) ? this.waypoint(Number(first.params[0])) : undefined;
        const reachable = (candidate: any) => {
            if (!destination || !this.game.map.mapBounds.isWithinBounds(destination) || candidate === destination) return true;
            const nearbyRegroup = this.semanticsVersion >= 42 && this.game.gameOpts?.campaign?.edition === 'yr';
            const ignoredBlockers = this.semanticsVersion >= 35 && this.game.gameOpts?.campaign?.edition === 'yr'
                ? this.game.map.getGroundObjectsOnTile(destination).filter((object: any) => alive(object)
                    && (object.isBuilding() || object.isVehicle())) : [];
            // A legal player building can cover a later source regroup cell.
            // Ignore that destination occupancy only for the entry topology
            // check. Actual arrival and movement keep their normal collisions.
            const path = this.game.map.terrain.computePath(unit.rules.speedType, unit.isInfantry(), candidate,
                !!candidate.onBridgeLandType, destination, !!destination.onBridgeLandType,
                { bestEffort: nearbyRegroup, ...(ignoredBlockers.length ? { ignoredBlockers } : {}) });
            // Original regroup markers can overlap trees. Match the bounded
            // arrival radius already used by scripts 3 and 16; keep the source
            // marker and the actual movement/collision rules unchanged.
            const end = path[0]?.tile;
            return end === destination || nearbyRegroup && !!end
                && Math.abs(end.z - destination.z) < 2
                && distance(end, destination) <= Math.max(1, this.game.rules.general.closeEnough);
        };
        const tile = new RadialTileFinder(this.game.map.tiles, this.game.map.mapBounds, target, { width: 1, height: 1 }, 0, 16,
            candidate => this.canSpawn(unit, candidate, airborne, sourceNaval) && reachable(candidate), false).getNextTile();
        if (!tile) throw new Error(`[${spec.id}] no passable reinforcement cell for ${name}`);
        if (unit.isInfantry()) unit.position.subCell = this.freeSubCell(tile)!;
        unit.onBridge = !airborne && !!tile.onBridgeLandType;
        unit.zone = airborne ? ZoneType.Air : this.game.map.getTileZone(tile, !unit.onBridge);
        if (airborne) unit.position.tileElevation = Coords.worldToTileHeight(unit.rules.flightLevel ?? this.game.rules.general.flightLevel);
        else if (unit.onBridge) unit.position.tileElevation = this.game.map.tileOccupation.getBridgeOnTile(tile).tileElevation;
        const level = Number(spec.properties.VeteranLevel ?? 1) - 1;
        if (level > 0) unit.veteranTrait?.setVeteranLevel(level as VeteranLevel);
        this.game.spawnObject(unit, tile);
        if (originalCampaignStartingVeterancy(this.game.gameOpts?.campaign)) unit.veteranTrait?.activateStartingAbilities(this.game);
        return unit;
    }
    private freeSubCell(tile: any): any {
        const objects = this.game.map.getGroundObjectsOnTile(tile);
        const terrain = objects.filter((object: any) => object.isTerrain()).flatMap((object: any) =>
            object.rules.getOccupiedSubCells(this.game.map.getTheaterType()));
        return Infantry.SUB_CELLS.find(cell => !terrain.includes(cell)
            && !objects.some((object: any) => object.isInfantry() && alive(object) && object.position.subCell === cell));
    }
    private canSpawn(unit: any, tile: any, airborne = false, sourceNaval = false): boolean {
        // Source aircraft enter at flight level, including waypoints outside
        // the current view. Ground terrain and ground occupancy cannot reject
        // that air cell. Gathering and paradrop landing keep their own checks.
        if (airborne) return !this.game.map.tileOccupation.getAirObjectsOnTile(tile).some((object: any) => alive(object));
        // Source naval reinforcements can start on full-map water before the
        // player view expands. Keep terrain/occupation checks; their existing
        // physical naval-entry path leads into LocalSize without teleporting.
        return this.game.map.terrain.getPassableSpeed(tile, unit.rules.speedType, unit.isInfantry(), !!tile.onBridgeLandType,
            [], false, sourceNaval) > 0
            && !this.game.map.getGroundObjectsOnTile(tile).some((object: any) => alive(object) && (object.isBuilding() || object.isVehicle()))
            && (!unit.isInfantry() || this.freeSubCell(tile) !== undefined);
    }
    private loadPassengers(team: CampaignTeamInstance): void {
        if (!yes(this.require(team.type), 'Full')) return;
        const transports = team.members.filter(unit => unit.transportTrait);
        if (!transports.length) return;
        for (const passenger of team.members.filter(unit => !unit.transportTrait)) {
            if (passenger.limboData) continue;
            const transport = transports.find(unit => unit.transportTrait.unitFitsInside(passenger));
            if (!transport) continue;
            this.game.limboObject(passenger, { selected: false, inTransport: true });
            transport.transportTrait.units.push(passenger);
        }
    }

    private startParadrop(team: CampaignTeamInstance, spec: CampaignTeam, target: any, remaining: string[]): void {
        if (remaining.some(name => ![ObjectType.Infantry, ...(this.semanticsVersion >= 4 ? [ObjectType.Vehicle] : [])].includes(this.rules(name).type))) {
            throw new Error(`[${spec.id}] unsupported paradrop passenger type`);
        }
        const size = this.game.map.tiles.getMapSize();
        const sourceHouse = this.definition.houses.get(spec.house)
            ?? [...this.definition.houses.values()].find(house => house.country === spec.house);
        const origin = yes(spec, 'UseTransportOrigin') ? this.waypoint(waypointNumber(spec.properties.TransportWaypoint))
            : this.semanticsVersion >= 4
                ? campaignParadropOrigin(sourceHouse?.edge ?? '', this.game.map.mapBounds.getFullSize())
                : { rx: 0, ry: Math.floor(size.height / 2) };
        const effect = new ParadropEffect(undefined, team.owner, target, {}, 0);
        const { fromTile, toTile } = effect.computeFlightPath(new Vector2(target.rx, target.ry), new Vector2(origin.rx, origin.ry), this.game);
        const plane = this.game.createUnitForPlayer(this.game.rules.getObject(this.game.rules.general.paradrop.paradropPlane, ObjectType.Aircraft), team.owner);
        plane.zone = ZoneType.Air; plane.position.tileElevation = Coords.worldToTileHeight(plane.rules.flightLevel ?? this.game.rules.general.flightLevel);
        plane.direction = FacingUtil.fromMapCoords(new Vector2(target.rx - fromTile.rx, target.ry - fromTile.ry));
        this.game.spawnObject(plane, fromTile);
        plane.traits.get(UnlandableTrait).setEnabled(false);
        plane.unitOrderTrait.addTask(new MoveTask(this.game, toTile, false, { allowOutOfBoundsTarget: true }));
        team.flight = { plane, target, exit: toTile, remaining, dropping: false }; team.phase = 'flying';
    }
    private tickFlight(team: CampaignTeamInstance, detached = false): void {
        const flight = team.flight!, plane = flight.plane;
        if (!alive(plane)) { flight.remaining = []; team.phase = 'active'; return; }
        const radius = this.game.rules.general.paradrop.paradropRadius / Coords.LEPTONS_PER_TILE;
        if (distance(plane.tile, flight.target) <= radius) flight.dropping = true;
        if (flight.dropping && flight.remaining.length && distance(plane.tile, flight.target) <= radius + 1
            && (this.semanticsVersion < 23 || this.game.currentTick >= (flight.nextDropTick ?? 0))) {
            // Installed Aircraft::Mission_ParaDropOverfly returns five frames
            // between ejection attempts. Per-tick bursts strand an entire
            // source squad on the near edge of the landing radius.
            if (this.semanticsVersion >= 23) flight.nextDropTick = this.game.currentTick + 5;
            const name = flight.remaining[0], rules = this.rules(name);
            const infantry = rules.type === ObjectType.Infantry;
            if (this.canSpawn({ rules, isInfantry: () => infantry }, plane.tile)) {
                const unit = this.game.createUnitForPlayer(rules, team.owner);
                if (infantry) { unit.position.subCell = this.freeSubCell(plane.tile)!; unit.stance = StanceType.Paradrop; }
                const task = infantry ? new ParadropTask(this.game) : new CampaignVehicleParadropTask(this.game, unit);
                unit.position.tileElevation = plane.tileElevation; unit.onBridge = !!plane.tile.onBridgeLandType;
                unit.zone = this.game.map.getTileZone(plane.tile, !unit.onBridge);
                if (this.semanticsVersion >= 26) {
                    const level = Number(this.require(team.type).properties.VeteranLevel ?? 1) - 1;
                    if (level > 0) unit.veteranTrait?.setVeteranLevel(level as VeteranLevel);
                }
                this.game.spawnObject(unit, plane.tile);
                if (this.semanticsVersion >= 26 && originalCampaignStartingVeterancy(this.game.gameOpts?.campaign)) {
                    unit.veteranTrait?.activateStartingAbilities(this.game);
                }
                if (!detached) this.add(team, unit);
                else {
                    const tag = this.definition.tags.get(this.require(team.type).properties.Tag);
                    if (tag) {
                        unit.tag = { id: tag.id, triggerId: tag.trigger, repeatType: tag.repeat, name: tag.name };
                        if (this.semanticsVersion >= 38 && this.game.gameOpts?.campaign?.edition === 'yr')
                            this.game.campaign.noteSourceTeamTag(unit, team.type, team.id);
                    }
                }
                unit.unitOrderTrait.addTask(task.setCancellable(false));
                flight.remaining.shift();
            }
        }
        if (!flight.remaining.length) {
            plane.traits.get(UnlandableTrait).setEnabled(true);
            team.phase = 'active';
        } else if (!plane.unitOrderTrait.hasTasks()) {
            const target = flight.dropping ? flight.target : flight.exit;
            plane.unitOrderTrait.addTask(new MoveTask(this.game, target, false, { allowOutOfBoundsTarget: true }));
            flight.dropping = !flight.dropping;
        }
    }

    update(tick: number): void {
        if (this.semanticsVersion >= 3) {
            this.recruitmentEpoch++;
            for (const [unit, release] of this.released) if (this.recruitmentEpoch > release.until) this.released.delete(unit);
        }
        this.tickAi(tick);
        for (const team of this.detachedFlights) {
            this.tickFlight(team, true); team.phase = 'finished';
            if (!team.flight!.remaining.length || !alive(team.flight!.plane)) this.detachedFlights.delete(team);
        }
        for (const unit of this.hunters) {
            if (!alive(unit) || !unit.isSpawned) { this.hunters.delete(unit); continue; }
            if (!unit.unitOrderTrait.hasTasks()) {
                const team = { owner: unit.owner, members: [unit] } as CampaignTeamInstance;
                const target = this.findTarget(team, 0, 1);
                if (target) this.attack(team, target);
            }
        }
        for (const team of this.instances.values()) {
            if (team.phase === 'finished') continue;
            team.members = team.members.filter(alive);
            if (team.phase === 'assembling') this.recruit(team);
            if (team.phase === 'flying') { this.tickFlight(team); continue; }
            if (team.phase === 'assembling') continue;
            if (!team.members.length) { this.finish(team); continue; }
            if (team.phase === 'phasing') {
                if (tick < team.waitUntil! || team.members.some(unit => unit.isSpawned && unit.warpedOutTrait.isActive())) continue;
                team.phase = 'active'; team.waitUntil = undefined;
            }
            if (team.phase !== 'active') continue;
            if (team.members.some(unit => unit.stance === StanceType.Paradrop || unit.campaignParadropping)) continue;
            if (team.aiTrigger && !yes(this.require(team.type), 'IsBaseDefense')) {
                team.openingAttackUntil ??= this.sourceAi?.openingAttackDeadline(team.owner, tick);
                if (team.openingAttackUntil !== undefined && tick < team.openingAttackUntil) continue;
            }
            this.tickScript(team, tick);
        }
        if (this.semanticsVersion >= 10 && tick % 15 === 0) this.tickIdleCharging();
    }

    private tickIdleCharging(): void {
        const offsets = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
        for (const unit of this.game.world.getAllObjects()) {
            if (!unit.isUnit() || !unit.isSpawned || !alive(unit) || unit.campaignSleeping
                || !unit.secondaryWeapon?.warhead.rules.electricAssault || this.assignments.has(unit)
                || unit.unitOrderTrait.hasTasks() || unit.attackTrait?.isIdle() === false) continue;
            for (const [x, y] of offsets) {
                const tile = this.game.map.tiles.getByMapCoords(unit.tile.rx + x, unit.tile.ry + y);
                if (!tile) continue;
                const target = this.game.map.getObjectsOnTile(tile).find((object: any) => object.isBuilding()
                    && object.isSpawned && alive(object) && (object.owner === unit.owner
                        || !object.owner.isAi && canCampaignChargeTarget(unit, object, this.game)) && object.overpoweredTrait);
                if (!target) continue;
                this.attack({ owner: unit.owner, members: [unit] } as CampaignTeamInstance, target, true);
                break;
            }
        }
    }

    private tickScript(team: CampaignTeamInstance, tick: number): void {
        const spec = this.require(team.type), script = this.definition.scripts.get(team.script ?? spec.script)!;
        const line = script.instructions[team.line];
        if (this.game?.gameOpts?.campaign?.paradropControlVersion === 1 && line?.opcode === 0 && yes(spec, 'Droppod') && !team.owner.isAi) {
            // Human paradrops release attack scripts after landing. Logistics
            // and the original owner remain intact, ready for player orders.
            for (const member of team.members) { member.guardMode = false; member.defaultToGuardArea = false; }
            this.finish(team); return;
        }
        if (!line) {
            // Player deliveries release control after their final instruction.
            // Live AI teams retain membership: defense limits and type caps
            // must still count them while their last assigned mission runs.
            // A final ownership handoff must also free an AI-owned delivery
            // for its new house's return team. Ordinary AI guards still hold.
            const handoff = this.semanticsVersion >= 27 && script.instructions.at(-1)?.opcode === 20
                && team.owner !== this.house(spec.house);
            // A final highlight has no continuing AI mission. The next source
            // team must be able to recruit the highlighted story character.
            const highlighted = this.semanticsVersion >= 47 && this.definition.edition === 'yr'
                && script.instructions.at(-1)?.opcode === 50;
            const release = handoff || highlighted || this.semanticsVersion >= 19 && (this.semanticsVersion < 20 || !team.owner.isAi);
            if (release) { this.finish(team); return; }
            team.phase = 'holding';
            for (const unit of team.members) if (this.unloading.get(unit) === team) this.unloading.delete(unit);
            return;
        }
        const parameter = Number(line.params[0]);
        if (line.opcode === 17) {
            if (this.semanticsVersion < 28) throw new Error('Script transitions require campaign interpreter28');
            const next = [...this.definition.scripts.keys()][parameter];
            if (!Number.isInteger(parameter) || parameter < 0 || !next) throw new Error('Missing original script index: ' + parameter);
            team.script = next; team.line = 0; team.started = false; team.tasks = []; team.target = undefined;
            return;
        }
        if (line.opcode >= 59 && this.semanticsVersion < 28) throw new Error('YR team actions require campaign interpreter28');
        if (!campaignScriptOpcodes.has(line.opcode)) throw new Error(`[${line.section}] ${line.key} unsupported script ${line.opcode}`);
        if (!team.started) {
            if (line.opcode === 13 && this.semanticsVersion < 19) throw new Error('Idle animation requires campaign interpreter 19');
            if ([24, 34].includes(line.opcode) && this.semanticsVersion < 22) throw new Error('Source team presentation requires campaign interpreter 22');
            if ([25, 48].includes(line.opcode) && this.semanticsVersion < 24) throw new Error('Source team scouting and indexed sound require campaign interpreter 24');
            team.started = true;
            this.trace.push({ tick, team: team.type, instance: team.id, line: team.line, opcode: line.opcode });
            // RA2 uses seconds here. FA2SP's legacy six-second TS description
            // conflicts with WAE's RA2 definition and original mapper reports.
            if (line.opcode === 5) team.waitUntil = tick + parameter * 15;
            if (line.opcode === 3 || line.opcode === 16) {
                team.target = this.waypoint(parameter);
                const options = { closeEnoughTiles: Math.max(1, this.game.rules.general.closeEnough),
                    ...(this.semanticsVersion >= 3 && !this.game.map.mapBounds.isWithinBounds(team.target)
                        ? { allowOutOfBoundsTarget: true } : {}) };
                this.tasks(team, unit => {
                    const entry = this.semanticsVersion >= 18 && unit.rules.naval
                        && !this.game.map.mapBounds.isWithinBounds(unit.tile);
                    const movement = entry ? { ...options, campaignNavalEntry: true } : options;
                    return line.opcode === 16
                        ? new AttackMoveTask(this.game, team.target, !!team.target.onBridgeLandType, movement)
                        : new MoveTask(this.game, team.target, !!team.target.onBridgeLandType, movement);
                });
                if (options.allowOutOfBoundsTarget) for (const { unit } of team.tasks) this.retreating.set(unit, team);
            }
            if (line.opcode === 59) {
                const tile = this.waypoint(parameter);
                team.target = this.game.map.getGroundObjectsOnTile(tile).find((object: any) => object.isBuilding() && alive(object));
                if (team.target) this.attackYrStructure(team, team.target);
            }
            if (line.opcode >= 60 && line.opcode <= 64) this.enterYrStructure(team, line.opcode);
            if (line.opcode === 41) for (const member of team.members) {
                member.isPanicked = false;
                if (member.isInfantry() && member.stance === StanceType.Prone) member.stance = StanceType.None;
            }
            if (line.opcode === 1) {
                const tile = this.waypoint(parameter);
                team.target = this.game.map.getGroundObjectsOnTile(tile).find((object: any) => object.isTechno() && alive(object)) ?? tile;
                team.groundShot = false;
                if (this.objectTarget(team.target)) this.attack(team, team.target, true);
                else this.attackCell(team, tile);
            }
            if (line.opcode === 39 || line.opcode === 40) this.localVariable(String(parameter), line.opcode === 39);
            if (line.opcode === 12 || line.opcode === 38) {
                if (this.semanticsVersion < 12) throw new Error('Global script requires campaign interpreter 12');
                this.globalVariable(parameter, line.opcode === 12);
            }
            if (line.opcode === 42) this.tasks(team, unit => {
                const direction = (parameter * 45) % 360;
                // Infantry without ROT changes sprite facing directly. A
                // zero-rate TurnTask would block the later boarding order.
                return this.semanticsVersion >= 17 && unit.isInfantry() && unit.rules.rot === 0
                    ? new CallbackTask(actor => { actor.direction = direction; actor.spinVelocity = 0; })
                    : new TurnTask(direction);
            });
            if (line.opcode === 47 || line.opcode === 58) {
                const target = this.findTarget(team, line.opcode === 58 ? 58 : 46, parameter);
                if (target) {
                    team.target = target;
                    this.tasks(team, () => new MoveTask(this.game, target.tile, !!target.onBridge,
                        { closeEnoughTiles: Math.max(1, this.game.rules.general.closeEnough) }));
                }
            }
            if (line.opcode === 53 || line.opcode === 54) {
                const tile = this.gatherTile(team, line.opcode === 53);
                if (this.semanticsVersion >= 6 && !tile) { team.started = false; return; }
                if (tile) this.tasks(team, () => new MoveTask(this.game, tile, !!tile.onBridgeLandType,
                    { closeEnoughTiles: Math.max(1, this.game.rules.general.closeEnough) }));
            }
            if (line.opcode === 8) {
                this.tasks(team, unit => unit.transportTrait?.units.length ? new CampaignUnloadTask(this.game) : undefined);
                // A wait or variable instruction does not end the delivery's
                // non-recruitable Unload mission while the source team is live.
                if (this.semanticsVersion >= 3) for (const { unit } of team.tasks) this.unloading.set(unit, team);
            }
            if (line.opcode === 9) this.tasks(team, unit => unit.rules.deploysInto
                ? this.semanticsVersion >= 24 ? new CampaignDeployIntoTask(this.game) : new DeployIntoTask(this.game) : undefined);
            if (line.opcode === 14) this.boardTransports(team);
            if (line.opcode === 13) for (const member of team.members) {
                if (member.isSpawned && member.isInfantry()) member.idleActionTrait.requestCampaignIdle();
            }
            if (line.opcode === 19) this.tasks(team, unit => {
                if (unit.rules.fraidycat) { unit.isPanicked = true; return new ScatterTask(this.game, undefined, { noSlopes: true }); }
                if (unit.isInfantry()) unit.stance = StanceType.Prone;
            });
            if (line.opcode === 21) this.tasks(team, () => new ScatterTask(this.game));
            if (line.opcode === 20) {
                team.owner = this.house(parameter);
                for (const member of team.members) this.game.changeObjectOwner(member, team.owner);
            }
            if (line.opcode === 37) {
                this.deleteMembers(team);
                this.finish(team); return;
            }
            if (line.opcode === 49) team.success = true;
            if (line.opcode === 50) for (const member of team.members) member.campaignFlashUntil = tick + parameter;
            if (line.opcode === 34) {
                // Installed YR dispatch 0x6E9ACF reads TeamClass.SpawnCell,
                // initialized from TeamType.GetWaypoint at 0x6E8D40.
                if (this.semanticsVersion >= 30 && this.definition.edition === 'yr') {
                    if (!spec.properties.Waypoint) throw Error('Original YR team camera has no source waypoint');
                    this.centerCamera(team.members, parameter, this.waypoint(waypointNumber(spec.properties.Waypoint)));
                } else this.centerCamera(team.members, parameter);
            }
            if (line.opcode === 25) this.playSourceSound(parameter);
            // Script24 is a retained TS instruction. Installed RA2 dispatch
            // 0x6b8768[24] goes straight to StepCompleted at0x6b7e23; no speech.
            // Keep its trace/line and normal advance, without adding TS audio.
            if (line.opcode === 11) this.mission(team, parameter);
        }
        if (line.opcode === 6) {
            if (parameter < 1 || parameter > script.instructions.length) throw new Error(`[${line.section}] ${line.key} invalid jump line ${parameter}`);
            team.line = parameter - 1; team.started = false; return;
        }
        if (line.opcode === 10) {
            if (this.semanticsVersion < 8) throw new Error('Follow friendlies requires campaign interpreter 8');
            this.followFriendlies(team); return;
        }
        if (line.opcode === 48) { this.scout(team); return; }
        if (line.opcode === 1) {
            const repairing = this.game.gameOpts?.campaign?.teamRecruitmentVersion === 1
                && this.objectTarget(team.target) && team.target.owner === team.owner && team.target.healthTrait?.health < 100
                && team.members.some(unit => unit.isSpawned && (unit.primaryWeapon?.rules.damage < 0 || unit.secondaryWeapon?.rules.damage < 0));
            if (this.objectTarget(team.target) && alive(team.target) && team.target.isSpawned && (team.target.owner !== team.owner || repairing)) {
                if (!team.members.some(unit => unit.unitOrderTrait.hasTasks())) this.attack(team, team.target, !repairing);
                return;
            }
            if (!this.objectTarget(team.target) && !team.groundShot) return;
            for (const unit of team.members) { unit.unitOrderTrait.clearOrders(); unit.unitOrderTrait.cancelAllTasks(); }
            this.advance(team); return;
        }
        if (line.opcode === 0 || line.opcode === 46) {
            let repairingBridge = this.semanticsVersion >= 17 && line.opcode === 46
                && team.target?.cabHutTrait && team.members.some(unit => unit.rules.engineer);
            if (repairingBridge && !team.target.cabHutTrait.canRepairBridge()) { this.advance(team); return; }
            if (this.semanticsVersion >= 9 && line.opcode === 0 && team.target?.isInfantry?.()) {
                const spies = team.members.filter(unit => unit.rules.infiltrate && unit.disguiseTrait);
                if (spies.length === team.members.length && spies.every(unit => {
                    const disguise = unit.disguiseTrait.getDisguise();
                    return disguise?.rules === team.target.rules && disguise.owner === team.target.owner;
                })) { this.advance(team); return; }
            }
            if (line.opcode === 46 && team.target && (!alive(team.target) || !team.target.isSpawned
                || team.target.owner === team.owner && !repairingBridge)) {
                this.advance(team); return;
            }
            if (!team.target || !alive(team.target) || !team.target.isSpawned) {
                team.target = this.findTarget(team, line.opcode, parameter);
                if (!team.target) { this.advance(team); return; }
                repairingBridge = this.semanticsVersion >= 17 && line.opcode === 46
                    && team.target.cabHutTrait && team.members.some(unit => unit.rules.engineer);
                this.attack(team, team.target);
            } else if (!team.members.some(unit => unit.unitOrderTrait.hasTasks())) this.attack(team, team.target);
            if (team.target.owner === team.owner && !repairingBridge) team.target = undefined;
            return;
        }
        if (line.opcode === 5 && tick < team.waitUntil!) {
            for (const member of team.members) if (member.isSpawned) member.guardMode = false;
            return;
        }
        if (line.opcode === 59 && team.target && alive(team.target) && team.target.isSpawned) {
            const repair = team.members.every(unit => unit.rules.engineer);
            if (!repair || team.target.healthTrait.health < 100) {
                if (!team.members.some(unit => unit.unitOrderTrait.hasTasks())) this.attackYrStructure(team, team.target);
                return;
            }
        }
        if (line.opcode === 43 && team.members.some(unit => unit.transportTrait && unit.transportTrait.getAvailableCapacity() > 0)) return;
        if ([55, 56, 57].includes(line.opcode) && !this.callSuperWeapon(team, line.opcode, parameter)) return;
        if (team.tasks.some(({ unit, task }) => alive(unit) && !ended(task))) return;
        if (line.opcode === 14 && team.members.some(unit => unit.isSpawned && !unit.transportTrait
            && team.members.some(transport => transport.isSpawned && transport.transportTrait?.unitFitsInside(unit)))) {
            team.started = false; return;
        }
        if (line.opcode === 8) {
            if (team.members.some(unit => unit.transportTrait?.units.length)) { team.started = false; return; }
            const loseTransports = parameter === 2 || parameter === 3, loseUnits = parameter === 1 || parameter === 3;
            team.members = team.members.filter(unit => {
                if (unit.transportTrait ? loseTransports : loseUnits) { this.assignments.delete(unit); return false; }
                return true;
            });
        }
        this.advance(team);
    }
    private attackYrStructure(team: CampaignTeamInstance, target: any): void {
        for (const unit of team.members) if (unit.isSpawned) {
            const order = (unit.rules.engineer ? this.orders.create(OrderType.Repair)
                : new AttackOrder(this.game, { forceAttack: true, campaignScriptTarget: true, campaignWeaponOnly: true }))
                .set(unit, this.game.createTarget(target, target.tile));
            if (order.isValid() && order.isAllowed()) unit.unitOrderTrait.addOrder(order as any);
        }
    }
    private enterYrStructure(team: CampaignTeamInstance, opcode: number): void {
        const pending = new Map<any, number>();
        this.tasks(team, unit => {
            const candidates = this.game.world.getAllObjects().filter((building: any) => {
                if (!building.isBuilding() || !building.isSpawned || !alive(building)) return false;
                const friendly = building.owner === unit.owner || this.game.alliances.areAllied(unit.owner, building.owner);
                const count = pending.get(building) ?? 0;
                if (opcode === 60) return friendly && building.rules.grinding && !unit.rules.engineer
                    && unit.rules.movementZone !== MovementZone.Fly;
                if (opcode === 61) return friendly && building.bunkerTrait?.canEnter(unit) && !count;
                if (opcode === 62) return friendly && unit.isInfantry() && building.absorberTrait
                    && building.absorberTrait.units.length + count < building.rules.passengers;
                return unit.isInfantry() && unit.rules.occupier && building.garrisonTrait?.canBeOccupied()
                    && building.garrisonTrait.units.length + count < building.garrisonTrait.maxOccupants
                    && (opcode === 63 ? building.owner === unit.owner : building.owner.isNeutral || building.owner === unit.owner);
            }).sort((a: any, b: any) => distance(unit.tile, a.tile) - distance(unit.tile, b.tile) || a.id - b.id);
            const building = candidates[0];
            if (!building) return;
            pending.set(building, (pending.get(building) ?? 0) + 1);
            return opcode === 60 || opcode === 62 ? new CampaignEnterBuildingTask(this.game, building, opcode === 60 ? 'grinder' : 'reactor')
                : opcode === 61 ? new EnterBunkerTask(this.game, building) : new GarrisonBuildingTask(this.game, building);
        });
    }
    private advance(team: CampaignTeamInstance): void {
        team.line++; team.started = false; team.waitUntil = undefined; team.target = undefined; team.tasks = [];
        delete team.groundShot;
        delete team.scoutHouse;
    }
    private tasks(team: CampaignTeamInstance, create: (unit: any) => any): void {
        team.tasks = [];
        for (const unit of team.members) {
            if (!unit.isSpawned) continue;
            const task = create(unit);
            if (task) {
                this.unloading.delete(unit);
                this.retreating.delete(unit);
                unit.unitOrderTrait.clearOrders(); unit.unitOrderTrait.cancelAllTasks(); unit.unitOrderTrait.addTask(task); team.tasks.push({ unit, task });
            }
        }
    }
    private mission(team: CampaignTeamInstance, mission: number): void {
        if (![0, 5, 10, 11, 13, 15, 16].includes(mission)
            && !(mission === 6 && this.semanticsVersion >= 15)
            && !(mission === 28 && this.semanticsVersion >= 11)) throw new Error(`Unsupported team mission: ${mission}`);
        for (const unit of team.members) {
            if (!unit.isSpawned) continue;
            unit.campaignSleeping = mission === 0;
            if (this.semanticsVersion >= 23) unit.campaignHarmless = false;
            if (this.semanticsVersion >= 15) unit.campaignSticky = mission === 6;
            unit.unitOrderTrait.clearOrders(); unit.unitOrderTrait.cancelAllTasks();
            // Original Wait has no navigation action. Unlike Sleep it retains
            // normal response/recruitment and can receive a later real order.
            if (mission === 28 || mission === 6) { unit.guardMode = false; unit.defaultToGuardArea = false; }
            if (mission === 10 && unit.harvesterTrait) unit.unitOrderTrait.addTask(new GatherOreTask(this.game, undefined, true));
            else if (mission === 16 && unit.transportTrait) unit.unitOrderTrait.addTask(new EvacuateTransportTask(this.game, true));
            else if (mission === 15 && this.semanticsVersion >= 12) this.hunters.add(unit);
            else if ([5, 11, 15].includes(mission)) unit.guardMode = true;
        }
    }
    private boardTransports(team: CampaignTeamInstance): void {
        const transports = team.members.filter(unit => unit.isSpawned && unit.transportTrait);
        const capacity = new Map(transports.map(unit => [unit, unit.transportTrait.getAvailableCapacity()]));
        for (const transport of transports) { transport.unitOrderTrait.clearOrders(); transport.unitOrderTrait.cancelAllTasks(); }
        this.tasks(team, passenger => {
            if (passenger.transportTrait) return;
            const transport = transports.find(unit => unit.transportTrait.unitFitsInside(passenger)
                && capacity.get(unit)! >= passenger.rules.size);
            if (!transport) return;
            capacity.set(transport, capacity.get(transport)! - passenger.rules.size);
            return new EnterTransportTask(this.game, transport);
        });
    }
    preferredSuperWeaponTarget(owner: any, category: number): any {
        const team = [...this.instances.values()].find(team => team.owner === owner && team.phase !== 'finished'
            && team.members.some(unit => unit.isSpawned && alive(unit)));
        return team ? this.findTarget(team, 0, category) : undefined;
    }

    private findTarget(team: CampaignTeamInstance, opcode: number, parameter: number): any {
        if (opcode === 0 && (!campaignAttackTargetCategories.has(parameter)
            || this.semanticsVersion < 8 && [8, 10, 11].includes(parameter))) throw new Error(`Unsupported attack target category: ${parameter}`);
        if (opcode === 0 && parameter === 0) return;
        const leader = team.members.find(unit => unit.isSpawned);
        if (!leader) return;
        const type = parameter & 0xffff, mode = parameter >>> 16;
        const candidates = this.game.world.getAllObjects().filter((object: any) => {
            if (!object.isTechno() || !object.isSpawned || !alive(object) || !this.game.isValidTarget(object)) return false;
            if (opcode === 58) return object.owner === team.owner && object.isBuilding() && object.rules.index === type;
            if (opcode === 46 && this.semanticsVersion >= 17 && object.isBuilding() && object.rules.index === type
                && object.cabHutTrait && team.members.some(unit => unit.rules.engineer)) {
                return team.members.some(unit => !!this.bridgeRepairOrder(unit, object));
            }
            if (opcode === 46 && this.semanticsVersion >= 46 && object.isBuilding() && object.rules.index === type
                && object.garrisonTrait?.canBeOccupied()
                && team.members.every(unit => unit.isInfantry() && unit.rules.occupier)
                && (object.owner === team.owner || this.game.alliances.areAllied(team.owner, object.owner))) {
                // Original escort scripts name the friendly destination by
                // building type. Their normal occupation order is not hostile.
                return true;
            }
            if (object.owner === team.owner || this.game.alliances.areAllied(team.owner, object.owner)) return false;
            if (opcode === 46) return object.isBuilding() && object.rules.index === type;
            if (this.semanticsVersion >= 8 && object.owner.isNeutral && ![10, 11].includes(parameter)) return false;
            // The installed RA2 category mapper gives 8 the same normal
            // threat mask as 1. Extension-specific house-threat masks differ.
            if (parameter === 1 || parameter === 8) return true;
            if (parameter === 2) return object.isBuilding();
            if (parameter === 3 && this.semanticsVersion >= 5) return !!object.harvesterTrait;
            if (parameter === 4) return object.isInfantry();
            if (parameter === 5) return object.isVehicle() || object.isAircraft() || object.isBuilding() && !!object.rules.undeploysInto;
            if (parameter === 6) return object.isBuilding() && (this.semanticsVersion >= 5 ? object.rules.factory !== undefined : !!object.rules.factory);
            if (parameter === 7 && this.semanticsVersion >= 5) return object.isBuilding() && object.rules.isBaseDefense;
            if (parameter === 9) return object.isBuilding() && object.rules.power > 0;
            if (parameter === 10) return object.isBuilding() && !!object.garrisonTrait?.isOccupied();
            if (parameter === 11) return object.isBuilding() && object.rules.capturable && object.rules.needsEngineer;
            throw new Error(`Unsupported attack target category: ${parameter}`);
        });
        candidates.sort((a: any, b: any) => {
            const d = distance(leader.tile, a.tile) - distance(leader.tile, b.tile);
            if (![46, 58].includes(opcode) || mode === 2) return d || a.id - b.id;
            if (mode === 3) return -d || a.id - b.id;
            const threat = (a.rules.threatPosed ?? 0) - (b.rules.threatPosed ?? 0);
            return (mode === 1 ? -threat : threat) || d || a.id - b.id;
        });
        return candidates[0];
    }

    private followFriendlies(team: CampaignTeamInstance): void {
        const members = team.members.filter(unit => unit.isSpawned), reference = members.at(-1);
        if (!reference) return;
        const target = this.game.world.getAllObjects().filter((unit: any) => alive(unit) && unit.isSpawned
            && (unit.isInfantry() || unit.isVehicle()) && !team.members.includes(unit)
            && (unit.owner === team.owner || this.game.alliances.areAllied(unit.owner, team.owner)))
            .sort((a: any, b: any) => distance(reference.tile, a.tile) - distance(reference.tile, b.tile) || a.id - b.id)[0];
        team.target = target;
        // The original line waits for a real friendly rather than advancing
        // an empty search or teleporting a reinforcement to its destination.
        if (!target) return;
        const closeEnoughTiles = Math.max(1, this.game.rules.general.closeEnough);
        const arrived = (unit: any) => distance(unit.tile, target.tile) <= closeEnoughTiles && !!unit.onBridge === !!target.onBridge;
        if (members.every(arrived)) { this.advance(team); return; }
        const tasks = new Map(team.tasks.map(entry => [entry.unit, entry.task]));
        const next: CampaignTeamInstance['tasks'] = [];
        const sharedTarget = target.attackTrait?.currentTarget?.obj;
        for (const unit of members) {
            const task = tasks.get(unit);
            if (arrived(unit)) {
                if (sharedTarget && alive(sharedTarget) && sharedTarget.isSpawned && !unit.unitOrderTrait.hasTasks()) {
                    this.attack({ ...team, members: [unit] }, sharedTarget);
                }
                if (task && !ended(task)) next.push({ unit, task });
                continue;
            }
            if (task instanceof MoveTask && !ended(task)) {
                if (!task.hasTarget(target.tile, !!target.onBridge)) task.updateTarget(target.tile, !!target.onBridge);
                next.push({ unit, task });
            } else {
                const move = new MoveTask(this.game, target.tile, !!target.onBridge, { closeEnoughTiles });
                unit.unitOrderTrait.clearOrders(); unit.unitOrderTrait.cancelAllTasks(); unit.unitOrderTrait.addTask(move);
                this.unloading.delete(unit); this.retreating.delete(unit); next.push({ unit, task: move });
            }
        }
        team.tasks = next;
    }

    private scout(team: CampaignTeamInstance): void {
        const members = team.members.filter(unit => alive(unit) && unit.isSpawned);
        const leader = members.reduce((best, unit) => !best || unit.rules.speed > best.rules.speed ? unit : best, undefined);
        if (!leader) return;
        let visited = this.scoutedHouses.get(team.owner);
        if (!visited) this.scoutedHouses.set(team.owner, visited = new Set());
        if (team.scoutHouse) {
            const task = team.tasks.find(entry => entry.unit === leader)?.task;
            if (task && !ended(task)) return;
            visited.add(team.scoutHouse); delete team.scoutHouse;
            team.target = undefined; team.tasks = []; return;
        }
        // Source House ScoutNodes contains the other houses, including allies.
        // Preference is shared across that house's scout teams, not per unit.
        const houses = [...this.definition.houses.keys()].map(name => this.house(name))
            .filter(owner => owner !== team.owner && !visited.has(owner.name));
        if (!houses.length) { this.advance(team); return; }
        const owner = houses[this.game.generateRandomInt(0, houses.length - 1)];
        const targets = this.game.world.getAllObjects().filter(object => object.isTechno() && object.owner === owner
            && alive(object) && object.isSpawned);
        team.scoutHouse = owner.name;
        if (!targets.length) { visited.add(owner.name); delete team.scoutHouse; return; }
        const target = targets[this.game.generateRandomInt(0, targets.length - 1)], size = this.game.map.mapBounds.getFullSize();
        const tile = new RadialTileFinder(this.game.map.tiles, this.game.map.mapBounds, target.tile,
            { width: 1, height: 1 }, 0, size.width + size.height, candidate => this.canSpawn(leader, candidate), false).getNextTile();
        team.target = tile;
        if (tile) this.tasks(team, unit => new MoveTask(this.game, tile, !!tile.onBridgeLandType,
            { closeEnoughTiles: this.game.rules.general.closeEnough }));
    }
    private attack(team: CampaignTeamInstance, target: any, force = false): void {
        for (const unit of team.members) {
            if (!unit.isSpawned) continue;
            const repair = !force && this.bridgeRepairOrder(unit, target);
            if (repair) { unit.unitOrderTrait.addOrder(repair as any); continue; }
            const type = unit.rules.engineer ? OrderType.Capture
                : this.semanticsVersion >= 9 && !force && unit.rules.infiltrate && target.isBuilding() && target.rules.spyable ? OrderType.Occupy
                : !force && unit.rules.occupier && target.garrisonTrait?.canBeOccupied() ? OrderType.Occupy
                : force ? OrderType.ForceAttack : OrderType.Attack;
            // Script1 names an original map target. Its attack mission is not
            // a player Ctrl-click and must not wait for the AI's short sight.
            const order = (type === OrderType.ForceAttack && this.semanticsVersion >= 21
                ? new AttackOrder(this.game, { forceAttack: true, campaignScriptTarget: true })
                : this.orders.create(type)).set(unit, this.game.createTarget(target, target.tile));
            if (order.isValid() && order.isAllowed()) unit.unitOrderTrait.addOrder(order as any);
        }
    }

    private bridgeRepairOrder(unit: any, target: any): any {
        if (this.semanticsVersion < 17 || !unit.rules.engineer || !target.cabHutTrait) return;
        const order = this.orders.create(OrderType.Repair).set(unit, this.game.createTarget(target, target.tile));
        return order.isValid() && order.isAllowed() ? order : undefined;
    }

    private attackCell(team: CampaignTeamInstance, tile: any): void {
        for (const unit of team.members) if (unit.isSpawned) {
            const order = (this.semanticsVersion >= 21
                ? new AttackOrder(this.game, { forceAttack: true, campaignScriptTarget: true })
                : this.orders.create(OrderType.ForceAttack)).set(unit, this.game.createTarget(undefined, tile));
            if (order.isValid() && order.isAllowed()) unit.unitOrderTrait.addOrder(order as any);
        }
    }

    private gatherTile(team: CampaignTeamInstance, enemy: boolean): any {
        const leader = team.members.find(unit => unit.isSpawned);
        if (!leader) return;
        const buildings = this.game.world.getAllObjects().filter((object: any) => object.isBuilding() && alive(object) && object.isSpawned);
        const own = buildings.filter((object: any) => object.owner === team.owner);
        const hostile = buildings.filter((object: any) => object.owner !== team.owner && !object.owner.isNeutral
            && !this.game.alliances.areAllied(team.owner, object.owner));
        const base = (enemy ? hostile : own).sort((a: any, b: any) => distance(leader.tile, a.tile) - distance(leader.tile, b.tile) || a.id - b.id)[0];
        if (!base) return;
        const destination = (enemy ? own : hostile)[0]?.tile ?? leader.tile;
        const baseTile = !enemy && this.game.campaign?.yr?.baseCenters.get(team.owner) || base.tile;
        const length = Math.max(1, distance(baseTile, destination));
        const safe = this.game.rules.getIni().getSection('General')?.getNumber('AISafeDistance', 20) ?? 20;
        let center = baseTile;
        for (let radius = safe; radius >= 0; radius--) {
            const tile = this.game.map.tiles.getByMapCoords(Math.round(baseTile.rx + (destination.rx - baseTile.rx) * radius / length),
                Math.round(baseTile.ry + (destination.ry - baseTile.ry) * radius / length));
            if (tile) { center = tile; break; }
        }
        const size = this.semanticsVersion >= 6 ? this.game.map.mapBounds.getFullSize() : undefined;
        const radius = size ? size.width + size.height : 16;
        const tile = new RadialTileFinder(this.game.map.tiles, this.game.map.mapBounds, center, { width: 1, height: 1 }, 0, radius,
            candidate => this.canSpawn(leader, candidate), false).getNextTile();
        if (!tile && this.semanticsVersion < 6) throw new Error(`No passable campaign gathering cell for ${team.type}`);
        return tile;
    }

    private callSuperWeapon(team: CampaignTeamInstance, opcode: number, parameter: number): boolean {
        const type = opcode === 55 ? SuperWeaponType.IronCurtain : SuperWeaponType.ChronoSphere;
        const weapon = team.owner.superWeaponsTrait.getAll().find((weapon: any) => weapon.rules.type === type);
        if (!weapon) return true;
        if (weapon.status !== SuperWeaponStatus.Ready) {
            const threshold = this.game.rules.getIni().getSection('General')!.getNumber('AIMinorSuperReadyPercent');
            return weapon.getChargeProgress() < threshold;
        }
        const members = team.members.filter(unit => unit.isSpawned && alive(unit));
        if (!members.length) return true;
        const source = this.game.map.tiles.getByMapCoords(
            Math.round(members.reduce((sum, unit) => sum + unit.tile.rx, 0) / members.length),
            Math.round(members.reduce((sum, unit) => sum + unit.tile.ry, 0) / members.length));
        if (!source) throw new Error(`Campaign superweapon team has no source cell: ${team.type}`);
        let destination;
        if (opcode !== 55) {
            const target = this.findTarget(team, opcode === 56 ? 46 : 0, parameter);
            if (!target) return true;
            destination = new RadialTileFinder(this.game.map.tiles, this.game.map.mapBounds, target.tile,
                { width: 1, height: 1 }, 1, 16, tile => this.canSpawn(members[0], tile), false).getNextTile();
            if (!destination) return false;
        }
        this.game.traits.get(SuperWeaponsTrait).activateSuperWeapon(type, team.owner, this.game, source, destination);
        return true;
    }

    private tickAi(tick: number): void {
        if (this.sourceAi) { this.sourceAi.update(tick); return; }
        for (const owner of this.aiEnabled) {
            if (!this.production.has(owner) || tick < (this.aiNext.get(owner) ?? 0)) continue;
            const eligible = [...this.definition.aiTriggers.values()].filter(trigger => trigger.enabled
                && trigger.difficulties[this.game.gameOpts.campaign.difficulty as CampaignDifficulty] && this.aiOwnerMatches(trigger, owner)
                && (this.semanticsVersion < 5 || trigger.techLevel <= owner.campaignTechLevel)
                && this.aiCondition(trigger, owner) && this.belowMaximum(trigger.team));
            const total = eligible.reduce((sum, trigger) => sum + (this.aiWeights.get(trigger.id) ?? 0), 0);
            if (total > 0) {
                let choice = this.game.generateRandom() * total;
                const selected = eligible.find(trigger => (choice -= this.aiWeights.get(trigger.id)!) < 0) ?? eligible[eligible.length - 1];
                this.create(selected.team, false, undefined, selected.id);
                if (selected.secondTeam && this.belowMaximum(selected.secondTeam)) this.create(selected.secondTeam, false, undefined, selected.id);
            }
            const delays = this.game.rules.getIni().getSection('General')?.getNumberArray('TeamDelays');
            const index = { hard: 0, normal: 1, easy: 2 }[this.game.gameOpts.campaign.difficulty as CampaignDifficulty];
            this.aiNext.set(owner, tick + Math.max(1, delays?.[index] ?? 2500));
        }
    }
    private aiOwnerMatches(trigger: CampaignAiTrigger, owner: any): boolean {
        if (this.semanticsVersion < 5 || trigger.house.toLowerCase() !== '<all>') return this.house(trigger.house) === owner;
        // A wildcard is a selector, never a scenario house name. The source
        // team still belongs to its explicitly declared house.
        return this.house(this.require(trigger.team).house) === owner;
    }
    private belowMaximum(type: string): boolean {
        const maximum = Number(this.require(type).properties.Max ?? -1);
        return maximum < 0 || [...this.instances.values()].filter(team => team.type === type && team.phase !== 'finished').length < maximum;
    }
    private aiCondition(trigger: CampaignAiTrigger, owner: any): boolean {
        if (![0, 1].includes(trigger.condition)) throw new Error(`[AITriggerTypes] ${trigger.id} unsupported condition ${trigger.condition}`);
        const players = trigger.condition === 1 ? [owner] : this.game.getCombatants().filter((player: any) =>
            player !== owner && !player.isNeutral && !this.game.alliances.areAllied(owner, player));
        const count = players.flatMap((player: any) => player.getOwnedObjects(true)).filter((object: any) => alive(object) && object.name === trigger.object).length;
        switch (trigger.comparison) {
            case 0: return count < trigger.count;
            case 1: return count <= trigger.count;
            case 2: return count === trigger.count;
            case 3: return count >= trigger.count;
            case 4: return count > trigger.count;
            case 5: return count !== trigger.count;
            default: throw new Error(`[AITriggerTypes] ${trigger.id} unsupported comparison ${trigger.comparison}`);
        }
    }
    snapshot(): unknown {
        return { nextId: this.nextId, production: [...this.production].map(player => player.name), aiEnabled: [...this.aiEnabled].map(player => player.name),
            ...(this.semanticsVersion >= 24 ? { scouting: [...this.scoutedHouses].map(([owner, visited]) => [owner.name, [...visited]]) } : {}),
            ...(this.semanticsVersion >= 16 ? { detachedFlights: [...this.detachedFlights].map(team => team.id) } : {}),
            ...(this.semanticsVersion >= 15 ? { unitMissions: this.game.world.getAllObjects()
                .filter((unit: any) => unit.campaignSticky || unit.campaignFlashUntil > this.game.currentTick
                    || this.semanticsVersion >= 23 && unit.campaignHarmless)
                .map((unit: any) => ({ id: unit.id, sticky: !!unit.campaignSticky,
                    ...(this.semanticsVersion >= 23 ? { harmless: !!unit.campaignHarmless } : {}),
                    flashUntil: unit.campaignFlashUntil > this.game.currentTick ? unit.campaignFlashUntil : null })) } : {}),
            ...(this.sourceAi ? { sourceAi: this.sourceAi.snapshot() } : {}),
            ...(this.semanticsVersion < 3 ? {} : { recruitmentEpoch: this.recruitmentEpoch,
                released: [...this.released].map(([unit, state]) => [unit.id, state]),
                unloading: [...this.unloading].map(([unit, team]) => [unit.id, team.id]),
                retreating: [...this.retreating].map(([unit, team]) => [unit.id, team.id]) }),
            ...(this.hunters.size ? { hunters: [...this.hunters].map(unit => unit.id) } : {}),
            ...(this.semanticsVersion < 4 ? {} : { vehicleParadrops: [...this.assignments.keys()]
                .filter(unit => unit.campaignParadropping).map(unit => unit.id) }),
            aiNext: [...this.aiNext].map(([player, tick]) => [player.name, tick]), aiWeights: [...this.aiWeights],
            instances: [...this.instances.values()].map(team => ({ id: team.id, type: team.type, ...(team.script ? { script: team.script } : {}), owner: team.owner.name,
                members: team.members.map(unit => unit.id), phase: team.phase, line: team.line, started: team.started,
                waitUntil: team.waitUntil ?? null, target: team.target?.id ?? null, success: team.success, aiTrigger: team.aiTrigger ?? null,
                ...(team.openingAttackUntil !== undefined ? { openingAttackUntil: team.openingAttackUntil } : {}),
                ...(team.groundShot === undefined ? {} : { groundShot: team.groundShot }),
                ...(team.scoutHouse === undefined ? {} : { scoutHouse: team.scoutHouse,
                    scoutDestination: team.target ? [team.target.rx, team.target.ry, !!team.target.onBridgeLandType] : null }),
                tasks: team.tasks.map(({ unit, task }) => [unit.id, task.status]), flight: team.flight && {
                    plane: team.flight.plane.id, remaining: team.flight.remaining, dropping: team.flight.dropping,
                    ...(team.flight.nextDropTick === undefined ? {} : { nextDropTick: team.flight.nextDropTick }) } })) };
    }
}

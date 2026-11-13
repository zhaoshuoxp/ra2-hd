import type { CampaignDefinition, CampaignInstruction, CampaignTrigger } from '../../data/campaign/CampaignDefinition';
import { waypointNumber } from '../../data/campaign/CampaignDefinition';
import { ObjectType } from '../../engine/type/ObjectType';
import { EventType } from '../event/EventType';
import { RadialTileFinder } from '../map/tileFinder/RadialTileFinder';
import { BuildStatus } from '../gameobject/Building';
import { SuperWeaponStatus } from '../SuperWeapon';
import { findCampaignFoundationExit } from './CampaignFoundationClearance';

export const campaignYrEvents = new Set([43, 58, 59, 60, 61]);
export const campaignYrActions = new Set([0, 68, 70, 81, 106, 118, 119, 120, 121, 122, 125, 127, 128, 129, 130, 131, 132, 135, 136, 137, 139]);
interface Host {
    house(reference: string | number): any;
    owner(trigger: CampaignTrigger): any;
    targets(trigger: CampaignTrigger): any[];
    destroyTrigger(id: string): void;
    release(unit: any): void;
    result(value: 'victory' | 'defeat'): void;
}
interface StartingBuilding { name: string; house: string; x: number; y: number; tag?: any; poweredOn: boolean }
export interface CampaignChronoScreenState {
    key: string;
    phase: 'out' | 'hold' | 'in';
    white: number;
    warp: number;
}

// Interpreter28 isolates new YR behavior from accepted RA2 journals. Source
// records remain unchanged; this subsystem owns the extra world/UI state.
export class CampaignYrRuntime {
    chronoScreenUntil = 0;
    readonly techLevels = new Map<string, number>();
    readonly preferredCells = new Map<any, any>();
    readonly baseCenters = new Map<any, any>();
    readonly radarBlackouts = new Map<any, number>();
    readonly outcomes: { tick: number; action: string; index?: number; success: boolean }[] = [];
    private startingBuildings: StartingBuilding[] = [];
    constructor(private definition: CampaignDefinition, private game: any, private host: Host) {}

    chronoScreenEffect(tick = this.game.currentTick): CampaignChronoScreenState | undefined {
        for (let index = this.outcomes.length - 1; index >= 0; index--) {
            const outcome = this.outcomes[index];
            const action = this.definition.triggers.get(outcome.action)?.actions[outcome.index ?? 0];
            if (action?.opcode !== 127 || !outcome.success) continue;
            const duration = this.frames(action.params[1]), elapsed = tick - outcome.tick;
            if (!duration || elapsed < 0 || elapsed >= duration * 2 + 45) return;
            const phase = elapsed < duration ? 'out' : elapsed < duration + 45 ? 'hold' : 'in';
            const steps = phase === 'out' ? elapsed : phase === 'hold' ? duration : duration * 2 + 45 - elapsed;
            return { key: `${outcome.tick}/${outcome.action}/${outcome.index}`, phase,
                white: Math.min(1, steps / duration), warp: .001 * steps * (steps + 1) };
        }
    }

    start(): void {
        this.startingBuildings = this.game.map.getInitialMapObjects().technos.filter((entry: any) => entry.isStructure())
            .map((entry: any) => ({ name: entry.name, house: entry.owner, x: entry.rx, y: entry.ry,
                tag: this.game.map.getTags().find((tag: any) => tag.id === entry.tag), poweredOn: entry.poweredOn }));
    }
    check(event: CampaignInstruction, targets: any[], observations: any[]): boolean | string[] | undefined {
        if (!campaignYrEvents.has(event.opcode)) return;
        const parameter = Number(event.params[1]);
        if (event.opcode === 58) return !this.host.house(parameter).powerTrait.isLowPower();
        if (event.opcode === 59) return observations.filter(entry => entry.type === EventType.EnterTile
            && targets.includes(entry.target) && (parameter === -1 || entry.source.owner === this.host.house(parameter)))
            .map(entry => entry.target.id === undefined ? `cell:${entry.target.rx},${entry.target.ry}` : `object:${entry.target.id}`);
        if (event.opcode === 43) return observations.filter(entry => entry.type === EventType.InflictDamage
            && targets.includes(entry.target) && entry.damageHitPoints > 0 && entry.prevHealth >= 25 && entry.currentHealth < 25)
            .map(entry => `object:${entry.target.id}`);
        // Original global TechnoClass counting includes transported/absorbed
        // units. Limbo cannot turn a live type into a false absence.
        const launch = this.game.gameOpts?.campaign;
        const owners = launch?.edition === 'yr' && launch.semanticsVersion >= 34
            ? this.game.getAllPlayers() : this.game.getCombatants();
        const count = owners.flatMap((owner: any) => owner.getOwnedObjects(true))
            .filter((object: any) => !object.isDestroyed && (object.name === event.params[2]
                || launch?.edition === 'yr' && launch.semanticsVersion >= 46 && event.opcode === 61
                    && object.rules?.deploysInto === event.params[2])).length;
        return event.opcode === 60 ? count >= parameter : count === 0;
    }
    execute(action: CampaignInstruction, trigger: CampaignTrigger): boolean {
        if (!campaignYrActions.has(action.opcode)) return false;
        const parameter = action.params[1], tick = this.game.currentTick;
        const owner = () => this.host.owner(trigger);
        let success = true;
        switch (action.opcode) {
            case 0: break; // Explicit original null action with retained unused parameters.
            case 68:
                this.host.result(Number(this.game.localPlayer.country.id) === Number(parameter) ? 'defeat' : 'victory');
                break;
            case 70: {
                const tag = this.definition.tags.get(parameter);
                if (!tag) { success = false; break; }
                for (const id of this.definition.triggerChain(tag.trigger)) this.host.destroyTrigger(id);
                for (const object of this.game.world.getAllObjects()) if (object.tag?.id === parameter) object.tag = undefined;
                break;
            }
            case 81:
                for (const unit of this.host.targets(trigger)) if (unit.isUnit?.() && unit.isSpawned && !unit.isDestroyed) {
                    unit.campaignSleeping = unit.campaignHarmless = unit.campaignSticky = false;
                    unit.guardMode = unit.defaultToGuardArea = false;
                }
                break;
            case 106: {
                const rules = this.techno(parameter), level = Number(action.params[6]);
                if (!Number.isSafeInteger(level)) throw Error('Invalid original YR technology level');
                rules.techLevel = level; this.techLevels.set(parameter, level);
                break;
            }
            case 118:
                for (const object of [...this.game.world.getAllObjects()]) if (object.isSmudge()) {
                    this.game.unspawnObject(object); object.dispose();
                }
                break;
            case 119: case 120: case 121: case 122:
                for (const object of [...this.host.house(Number(parameter)).getOwnedObjects()]) {
                    if (!object.isDestroyed && (action.opcode === 119 || action.opcode === 120 && object.isBuilding()
                        || action.opcode === 121 && object.isUnit() && !object.rules.naval
                        || action.opcode === 122 && object.isUnit() && object.rules.naval)) this.game.destroyObject(object);
                }
                break;
            case 125:
                success = !!owner() && this.createBuilding(parameter, owner(), this.waypoint(action), undefined, true);
                break;
            case 127:
                this.chronoScreenUntil = tick + this.frames(parameter);
                break;
            case 128:
                if (owner()) this.teleportHouse(owner(), this.waypoint(action)); else success = false;
                break;
            case 129: case 132: {
                const index = Number(parameter), names = [...new Set<string>(this.game.rules.getIni().getSection('SuperWeaponTypes')?.entries.values() ?? [])];
                if (!Number.isInteger(index) || index < 0 || !names[index]) throw Error('Invalid original YR superweapon index');
                const weapon = owner()?.superWeaponsTrait.get(names[index]);
                if (!weapon) { success = false; break; }
                if (action.opcode === 132) weapon.rechargeTicks = this.frames(action.params[6]);
                else {
                    const percent = Number(action.params[6]);
                    if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw Error('Invalid original superweapon charge');
                    weapon.chargeTicks = weapon.rechargeTicks - Math.trunc(weapon.rechargeTicks * percent / 100);
                    if (weapon.chargeTicks === 0) weapon.status = SuperWeaponStatus.Ready;
                    else if (weapon.status === SuperWeaponStatus.Ready) weapon.status = SuperWeaponStatus.Charging;
                }
                break;
            }
            case 130:
                for (const initial of this.startingBuildings.filter(entry => this.host.house(entry.house) === this.host.house(Number(parameter)))) {
                    const tile = this.game.map.tiles.getByMapCoords(initial.x, initial.y);
                    const existing = this.game.map.getGroundObjectsOnTile(tile).find((object: any) => object.isBuilding()
                        && !object.isDestroyed && object.name === initial.name && object.owner === this.host.house(initial.house) && object.tile === tile);
                    if (existing) existing.healthTrait.healToFull(undefined, this.game);
                    else if (!this.createBuilding(initial.name, this.host.house(initial.house), tile, initial.tag, initial.poweredOn)) success = false;
                }
                break;
            case 131:
                for (const building of owner()?.buildings ?? []) if (!building.isDestroyed && building.name === parameter) {
                    building.campaignFlashUntil = tick + this.frames(action.params[6]);
                }
                break;
            case 135:
                if (owner()) this.preferredCells.set(owner(), this.waypoint(action)); else success = false;
                break;
            case 136:
                if (owner()) this.preferredCells.delete(owner()); else success = false;
                break;
            case 137:
                if (owner()) this.baseCenters.set(owner(), this.waypoint(action)); else success = false;
                break;
            case 139:
                if (owner()) {
                    const until = tick + this.frames(parameter);
                    this.radarBlackouts.set(owner(), until); owner().campaignRadarBlackoutUntil = until;
                } else success = false;
                break;
        }
        this.outcomes.push({ tick, action: action.key, index: action.index, success });
        return true;
    }
    private frames(value: string): number {
        const frames = Number(value);
        if (!Number.isSafeInteger(frames) || frames < 0) throw Error('Invalid original YR frame duration');
        return frames;
    }
    private techno(name: string): any {
        const types = [ObjectType.Building, ObjectType.Vehicle, ObjectType.Aircraft, ObjectType.Infantry];
        const matches = types.filter(type => this.game.rules.hasObject(name, type));
        if (matches.length !== 1) throw Error('Unknown or ambiguous original YR TechnoType: ' + name);
        return this.game.rules.getObject(name, matches[0]);
    }
    private waypoint(action: CampaignInstruction): any {
        const tile = this.game.map.getTileAtWaypoint(waypointNumber(action.params[6]));
        if (!tile) throw Error('Missing original YR action waypoint: ' + action.params[6]);
        return tile;
    }
    private createBuilding(name: string, owner: any, tile: any, tag: any, poweredOn: boolean): boolean {
        if (!tile || !this.game.rules.hasObject(name, ObjectType.Building)) throw Error('Missing original YR building type or cell: ' + name);
        const building = this.game.createObject(ObjectType.Building, name);
        const cells = this.game.map.tileOccupation.calculateTilesForGameObject(tile, building);
        const occupants = new Set<any>(cells.flatMap((cell: any) => this.game.map.getGroundObjectsOnTile(cell)));
        for (const object of occupants) {
            if (object.isBuilding() && object.isDestroyed) {
                this.game.removeBuildingRubble(object);
            } else if (object.isOverlay()) {
                this.game.unspawnObject(object); object.dispose();
            } else if (object.isUnit()) {
                const exit = findCampaignFoundationExit(this.game, object, cells);
                if (!exit) { building.dispose(); return false; }
                object.moveTrait.teleportUnitToTile(exit, this.game.map.tileOccupation.getBridgeOnTile(exit), true, false, this.game);
            } else if (object.isBuilding() || object.isTerrain()) { building.dispose(); return false; }
        }
        building.tag = tag; building.poweredTrait?.setTurnedOn(poweredOn);
        this.game.changeObjectOwner(building, owner); this.game.spawnObject(building, tile);
        building.setBuildStatus(BuildStatus.Ready, this.game);
        return true;
    }
    private teleportHouse(owner: any, destination: any): void {
        // Original Action128 visits FootClass in reverse allocation order and
        // handles vehicles/infantry outside limbo; aircraft remain in place.
        const units = owner.getOwnedObjects().filter((unit: any) => (unit.isVehicle() || unit.isInfantry())
            && unit.isSpawned && !unit.isDestroyed).sort((a: any, b: any) => b.id - a.id);
        const size = this.game.map.mapBounds.getFullSize();
        for (const unit of units) {
            const tile = new RadialTileFinder(this.game.map.tiles, this.game.map.mapBounds, destination,
                { width: 1, height: 1 }, 0, size.width + size.height, (candidate: any) =>
                    this.game.map.terrain.getPassableSpeed(candidate, unit.rules.speedType, unit.isInfantry(),
                        !!candidate.onBridgeLandType, [], false, true) > 0
                    && !this.game.map.terrain.findObstacles({ tile: candidate, onBridge: !!candidate.onBridgeLandType }, unit).length, false).getNextTile();
            if (!tile) continue;
            unit.unitOrderTrait.clearOrders(); unit.unitOrderTrait.cancelAllTasks();
            unit.moveTrait.teleportUnitToTile(tile, this.game.map.tileOccupation.getBridgeOnTile(tile), true, false, this.game);
        }
    }
    snapshot(): unknown {
        const cells = (values: Map<any, any>) => [...values].map(([owner, tile]) => [owner.name, tile.rx, tile.ry]);
        return { chronoScreenUntil: this.chronoScreenUntil, techLevels: [...this.techLevels], preferredCells: cells(this.preferredCells),
            baseCenters: cells(this.baseCenters), radarBlackouts: [...this.radarBlackouts].map(([owner, tick]) => [owner.name, tick]) };
    }
}

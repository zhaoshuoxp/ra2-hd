import { CampaignDefinition, isCampaignDifficulty, isNullCampaignTeamAction, waypointNumber } from '../../data/campaign/CampaignDefinition';
import type { CampaignDifficulty, CampaignInstruction, CampaignTrigger } from '../../data/campaign/CampaignDefinition';
import { CampaignTriggerMachine } from './CampaignTriggerMachine';
import { campaignPreflight, triggerMachineActions, triggerMachineEvents } from './CampaignSupport';
import { Country } from '../Country';
import { EventType } from '../event/EventType';
import { ObjectAttackedEvent } from '../event/ObjectAttackedEvent';
import { ObjectType } from '../../engine/type/ObjectType';
import { recoverSourceBaseActivation } from './CampaignBaseActivation';
import { SideType } from '../SideType';
import { ZoneType } from '../gameobject/unit/ZoneType';
import { TriggerExecutorFactory } from '../trigger/TriggerExecutorFactory';
import { CampaignJournal } from './CampaignCheckpoint';
import { CampaignPlayTime } from './CampaignPlayTime';
import { CampaignTeams, campaignScriptOpcodes } from './CampaignTeams';
import { CampaignParticles } from './CampaignParticles';
import { CampaignParticleSystems } from './CampaignParticleSystems';
import { CampaignSourceParticles } from './CampaignSourceParticles';
import { retailCampaignTechno, retailCampaignWeapon } from './CampaignTypeRegistry';
import { detonateTriggerWeapon } from '../trigger/executor/DetonateWarheadExecutor';
import { DifficultyRules } from '../rules/DifficultyRules';
import { AiDifficulty } from '../gameopts/GameOpts';
import { CampaignBaseBuilder } from './CampaignBaseBuilder';
import { SuperWeaponsTrait } from '../trait/SuperWeaponsTrait';
import { SuperWeaponType } from '../type/SuperWeaponType';
import { CheerTask } from '../gameobject/task/CheerTask';
import { canControlOwner } from './CampaignControl';
import type { IniFile } from '../../data/IniFile';
import { CampaignGlobals, type CampaignGlobalState } from './CampaignGlobals';
import { CampaignLightning } from './CampaignLightning';
import { TriggerSoundFxEvent } from '../event/TriggerSoundFxEvent';
import { TriggerStopSoundFxEvent } from '../event/TriggerStopSoundFxEvent';
import { campaignCombatThreshold } from './CampaignCombatThreshold';
import { revealCampaignZone } from './CampaignZones';
import { CampaignSuperWeapons } from './CampaignSuperWeapons';
import { CampaignYrRuntime, campaignYrActions, campaignYrEvents } from './CampaignYrRuntime';

export function campaignStartingCredits(credits: number, playerControl: boolean, difficulty: CampaignDifficulty,
    rules: IniFile, enabled: boolean): number {
    if (!enabled || !playerControl || difficulty === 'normal') return credits;
    const key = difficulty === 'easy' ? 'CampaignMoneyDeltaEasy' : 'CampaignMoneyDeltaHard';
    const delta = rules.getSection('General')?.getNumber(key, difficulty === 'easy' ? 5000 : -5000)
        ?? (difficulty === 'easy' ? 5000 : -5000);
    if (!Number.isSafeInteger(delta)) throw new Error(`Invalid original campaign starting money: ${key}`);
    return Math.max(0, credits + delta);
}

export const campaignCapabilities = {
    events: new Set([...triggerMachineEvents, ...campaignYrEvents, 1, 2, 4, 5, 6, 7, 9, 10, 11, 14, 15, 16, 17, 19, 20, 21, 22, 25, 26, 27, 28, 29, 30, 31, 32, 33, 39, 40, 41, 44, 48, 52, 55, 56, 57]),
    actions: new Set([...triggerMachineActions, ...campaignYrActions, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 14, 16, 17, 18, 19, 20, 21, 23, 24, 25, 27, 28, 29, 32, 35, 36, 37, 38, 40, 41, 42, 44, 46, 47, 48, 51, 55, 60, 61, 63, 74, 75, 77, 78, 80, 88, 89, 90, 99, 100, 101, 102, 103, 104, 107, 108, 111, 112, 113, 114, 115, 116, 117]),
    scripts: campaignScriptOpcodes,
    subsystems: [
        { id: 'retail-teams', ready: true, reason: 'Required team, task force and script executors are implemented' },
        { id: 'campaign-ai', ready: true, reason: 'Original map AI trigger conditions, weights, limits and factory recruitment are implemented' },
        { id: 'world-save-restore', ready: true, reason: 'Native changed-world reconstruction and deterministic continuation pass' },
        { id: 'mission-media', ready: true, reason: 'Source movie indices are resolved by the mission media binding; playback does not advance simulation or RNG' },
    ],
};

export interface CampaignLaunch {
    edition: 'ra2' | 'yr';
    mission: string;
    difficulty: CampaignDifficulty;
    diagnostic: boolean;
    semanticsVersion?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48;
    chargingVersion?: 1;
    paradropControlVersion?: 1;
    teamRecruitmentVersion?: 1;
    civilianTargetingVersion?: 1 | 2;
    demolitionSafetyVersion?: 1;
    neutralStructureTargetingVersion?: 1;
    retaliationVersion?: 1;
    parasiteCadenceVersion?: 1;
    baseActivationVersion?: 1 | 2 | 3;
    openingGraceVersion?: 1;
    bridgeRallyVersion?: 1;
    startingCreditsVersion?: 1;
    startingVeterancyVersion?: 1;
    tileLineVersion?: 1;
    countryIdentityVersion?: 1;
    incomingGlobals?: CampaignGlobalState;
    globalAiSha256?: string;
    sourceSha256: string;
    provenanceDigest: string;
}

export class CampaignRuntime {
    readonly houses = new Map<string, any>();
    readonly issues;
    readonly machine: CampaignTriggerMachine;
    readonly teams: CampaignTeams;
    readonly particles: CampaignParticles | CampaignParticleSystems | CampaignSourceParticles;
    readonly baseBuilder?: CampaignBaseBuilder;
    readonly globals?: CampaignGlobals;
    readonly lightning?: CampaignLightning;
    readonly superWeapons?: CampaignSuperWeapons;
    readonly yr?: CampaignYrRuntime;
    private legacyProductionRatios = new Map<any, { aircraft: number; infantry: number }>();
    readonly journal = new CampaignJournal();
    readonly playTime = new CampaignPlayTime();
    trainerModified = false;
    restoring = false;
    pendingMedia: string[] = [];
    inspectionModified = false;
    readonly trace: { tick: number; section: string; key: string; index?: number; opcode: number }[] = [];
    readonly sourceQuirks: { section: string; key: string; value: string; kind: string }[] = [];
    result?: 'victory' | 'defeat';
    failure?: string;
    inputLocked = false;
    readonly cameoFlashes = new Map<string, number>();
    readonly soundEmitters = new Map<string, { sound: string; waypoint: number; tick: number }[]>();
    musicTheme?: string;
    uiAction?: (action: CampaignInstruction) => void;
    uiTeamCamera?: (tile: any, speed: number) => void;
    presentationTick?: () => void;
    private events: any[] = [];
    private boundTargets = new Map<string, any[]>();
    private sourceTeamCaptureTags = new Set<number>();
    private subscription?: () => void;
    private selected = new Set<any>();
    private buildingLosses = new Map<any, number>();
    private discoverySubjects = new Set<any>();
    private discoveredHouses = new Set<any>();
    private executorFactory = new TriggerExecutorFactory();

    // Existing Soviet 01 journals retain their accepted interpreter behavior.
    // New launches explicitly pin the expanded interpreter for future replay.
    get legacySemantics(): boolean {
        return this.launch.mission === 'sov01t.map' && this.launch.semanticsVersion === undefined;
    }

    constructor(readonly definition: CampaignDefinition, readonly launch: CampaignLaunch, private readonly game: any) {
        this.issues = campaignPreflight(definition, campaignCapabilities);
        for (const record of definition.dormantRecords) this.sourceQuirks.push({ section: record.section, key: record.key,
            value: record.reason, kind: 'retained-original-dormant-record' });
        if (!isCampaignDifficulty(launch.difficulty)) throw new Error('Unsupported campaign difficulty');
        if ((launch.semanticsVersion ?? 1) >= 12) {
            this.globals = new CampaignGlobals(launch.incomingGlobals);
            this.lightning = new CampaignLightning(game);
        }
        else if (launch.incomingGlobals !== undefined) throw new Error('Campaign globals require interpreter 12');
        if (this.issues.length && !launch.diagnostic) throw new Error('Campaign preflight failed; formal play is unavailable');
        this.machine = new CampaignTriggerMachine(definition, launch.difficulty, {
            targets: trigger => this.targets(trigger).map(target => this.targetId(target)),
            condition: (event, trigger) => this.check(event, trigger),
            randomInt: (minimum, maximum) => game.generateRandomInt(minimum, maximum),
            action: (action, trigger) => {
                try { this.execute(action, trigger); }
                catch (error) { throw new Error(`[${action.section}] ${action.key}:${action.index}: ${error instanceof Error ? error.message : String(error)}`); }
            },
        }, 15, this.legacySemantics, launch.semanticsVersion ?? 1);
        this.teams = new CampaignTeams(definition, game, reference => this.resolveHouse(reference),
            (id, value) => this.machine.variables.set(id, value), launch.semanticsVersion ?? 1,
            (id, value) => this.setGlobalVariable(id, value), (members, speed, sourceCell) => this.centerTeamCamera(members, speed, sourceCell),
            index => { if (!this.restoring) game.events.dispatch(new TriggerSoundFxEvent('', undefined, index)); });
        if ((launch.semanticsVersion ?? 1) >= 25) this.superWeapons = new CampaignSuperWeapons(definition, game,
            reference => this.resolveHouse(reference), this.teams);
        if (launch.edition === 'yr' && (launch.semanticsVersion ?? 1) >= 28) this.yr = new CampaignYrRuntime(definition, game, {
            house: reference => this.resolveHouse(reference), owner: trigger => this.triggerOwner(trigger), targets: trigger => this.targets(trigger),
            destroyTrigger: id => this.machine.destroy(id), release: unit => this.teams.release(unit), result: result => {
                this.result = result; game.localPlayer.defeated = result === 'defeat'; game.afterTick(() => game.end());
            },
        });
        this.particles = (launch.semanticsVersion ?? 1) >= 19 ? new CampaignSourceParticles(game)
            : (launch.semanticsVersion ?? 1) >= 17 ? new CampaignParticleSystems(game) : new CampaignParticles(game);
        if ((launch.semanticsVersion ?? 1) >= 4) this.baseBuilder = new CampaignBaseBuilder(definition, game,
            reference => this.resolveHouse(reference), this.teams.production, launch.semanticsVersion);
    }

    createPlayers(factory: any): void {
        const version = this.launch.semanticsVersion ?? 1;
        // Inheritance began in version5. New first-mission launches separately
        // pin exact country identity; existing version5 journals stay unchanged.
        const inheritParents = version >= 5 && this.launch.countryIdentityVersion !== 1;
        for (const house of this.definition.houses.values()) {
            const country = Country.factory(house.country, this.game.rules, (this.launch.semanticsVersion ?? 1) < 6 ? undefined
                : (section, value) => this.sourceQuirks.push({ section, key: 'ParentCountry', value, kind: 'unregistered-country-label' }),
                inheritParents);
            const color = this.game.rules.colors.get(house.color);
            if (!color) throw new Error(`Unknown campaign house color: ${house.color}`);
            const aiDifficulty = { easy: AiDifficulty.Easy, normal: AiDifficulty.Medium, hard: AiDifficulty.Brutal }[this.launch.difficulty];
            const player = factory.createCombatant(house.id, country, 0, color, !house.playerControl,
                house.playerControl ? AiDifficulty.Medium : aiDifficulty, undefined, true, house.techLevel);
            player.handicap = DifficultyRules.readCampaign(this.game.rules.getIni(), house.playerControl, this.launch.difficulty);
            // Passive campaign countries can retain a combat side for their
            // artwork; Multiplay availability is not their neutral-house flag.
            player.isNeutral = this.launch.edition === 'yr' && version >= 46
                ? country.side === SideType.Civilian
                : version >= 7 ? country.isPassive() : country.side === SideType.Civilian;
            player.campaignHouse = house.id;
            player.campaignSemanticsVersion = this.launch.semanticsVersion ?? 1;
            player.campaignChargingVersion = this.launch.chargingVersion;
            player.campaignTechLevel = house.techLevel;
            this.houses.set(house.id, player);
            if ((this.launch.semanticsVersion ?? 1) >= 12) this.legacyProductionRatios.set(player, {
                aircraft: this.definition.ini.getSection(house.id)!.getNumber('RatioTeamAircraft', 75),
                infantry: this.definition.ini.getSection(house.id)!.getNumber('RatioTeamInfantry', 75),
            });
            this.game.addPlayer(player);
        }
        if ((this.launch.semanticsVersion ?? 1) >= 6) {
            const controller = this.houses.get(this.definition.ini.getSection('Basic')!.getString('Player'));
            controller.campaignControlledPlayers = [...this.definition.houses.values()].filter(house => house.playerControl)
                .map(house => this.houses.get(house.id));
            for (const owner of controller.campaignControlledPlayers) owner.campaignController = controller;
        }
    }

    resolveHouse(reference: string | number): any {
        if (typeof reference === 'number' && (this.launch.semanticsVersion ?? 1) >= 4) {
            // Scenario countries are appended to the original country array;
            // a map's local [Houses] keys restart at zero and are not those ids.
            const matches = [...this.houses.values()].filter(player => Number(player.country.id) === reference);
            if (matches.length === 1) return matches[0];
            throw new Error(`Ambiguous or missing campaign house id: ${reference}`);
        }
        if (typeof reference === 'number') {
            const name = this.definition.ini.getSection('Houses')?.getString(String(reference));
            if (name && this.houses.has(name)) return this.houses.get(name);
        }
        const direct = this.houses.get(String(reference));
        if (direct) return direct;
        const matches = [...this.houses.values()].filter(player => player.country.name === reference || player.country.id === Number(reference));
        if (matches.length !== 1) throw new Error(`Ambiguous or missing campaign house: ${reference}`);
        return matches[0];
    }

    private triggerOwner(trigger: CampaignTrigger): any {
        const direct = this.houses.get(trigger.house);
        if (direct) return direct;
        const matches = [...this.houses.values()].filter(player => player.country.name === trigger.house);
        if (matches.length === 1) return matches[0];
        // Original country-index lookup returns null when that country has no
        // scenario house. ParentCountry does not participate in this lookup.
        if (!matches.length && this.game.rules.hasCountry(trigger.house)) return undefined;
        throw new Error(`Ambiguous or missing trigger country: ${trigger.house}`);
    }

    initialize(): void {
        for (const house of this.definition.houses.values()) {
            const player = this.houses.get(house.id);
            const originalStartingMoney = this.launch.startingCreditsVersion === 1 || (this.launch.semanticsVersion ?? 1) >= 8;
            player.credits = originalStartingMoney ? campaignStartingCredits(house.credits, house.playerControl,
                this.launch.difficulty, this.game.rules.getIni(), true) : house.credits;
            if (this.definition.ini.getSection('Basic')?.getBool('FreeRadar')) player.radarTrait.setDisabled(false);
            this.game.alliances.setScenarioAllies(player, house.allies.map(id => this.houses.get(id)));
        }
    }

    start(): void {
        this.yr?.start();
        for (const trigger of this.definition.triggers.values()) this.boundTargets.set(trigger.id, this.targets(trigger));
        this.machine.bindTargets();
        if ((this.launch.semanticsVersion ?? 1) >= 12) for (const trigger of this.definition.triggers.values()) {
            for (const event of trigger.events) if (event.opcode === 5) this.discoverySubjects.add(this.resolveHouse(Number(event.params[1])));
        }
        this.subscription = this.game.events.subscribe((event: any) => {
            const entryTag = (this.launch.semanticsVersion ?? 1) >= 16 && event.type === EventType.EnterObject
                ? this.definition.tags.get(event.target.tag?.id) : undefined;
            // A repeated tag must see an attached notification once. Retaining
            // the same event for polling would fire its actions twice that tick.
            if (!entryTag || (this.launch.semanticsVersion ?? 1) < 17) this.events.push(event);
            if (entryTag && !this.failure && !this.result) {
                try {
                    this.refreshTargets();
                    this.machine.notify(this.definition.triggerChain(entryTag.trigger), 1,
                        (instruction, trigger) => this.check(instruction, trigger, [event]));
                } catch (error) { this.failure = error instanceof Error ? error.message : String(error); }
            }
            // The original building-loss counter excludes Insignificant
            // objects. General score statistics count a different population.
            if ((this.launch.semanticsVersion ?? 1) >= 10 && event.type === EventType.ObjectDestroy
                && event.target.isBuilding() && !event.target.rules.insignificant
                && Number(event.target.owner.country.id) >= 0) {
                const owner = event.target.owner;
                this.buildingLosses.set(owner, (this.buildingLosses.get(owner) ?? 0) + 1);
            }
            if (event.type === EventType.WeaponFire) this.teams.noteShot(event.gameObject);
            if (event.type === EventType.InflictDamage) this.teams.sourceAi?.noteDamage(event);
            if ((this.launch.semanticsVersion ?? 1) >= 11 && event.type === EventType.ObjectOwnerChange
                && event.target.isUnit()) this.teams.noteOwnerChange(event.target);
            if ((this.launch.semanticsVersion ?? 1) >= 9 && event.type === EventType.BuildingInfiltration) {
                this.teams.release(event.source);
            }
        });
    }

    update(): void {
        if (this.failure || this.result) return;
        try {
            if ((this.launch.baseActivationVersion ?? 0) >= 1) {
                for (const id of recoverSourceBaseActivation(this.definition, this.machine, reference => this.resolveHouse(reference)))
                    this.sourceQuirks.push({ section: 'Triggers', key: id, value: String(this.machine.tick),
                        kind: 'late-source-base-production-timer-recovered' });
            }
            this.refreshTargets(); this.refreshDiscovery(); this.lightning?.update(); this.machine.update(); this.teams.update(this.machine.tick);
            this.baseBuilder?.update(this.machine.tick); this.superWeapons?.update(this.machine.tick); this.particles.update();
            if (!this.restoring) this.presentationTick?.();
        }
        catch (error) { this.failure = error instanceof Error ? error.message : String(error); }
        finally { this.events = []; this.selected.clear(); }
    }

    noteSelected(units: any[]): void { for (const unit of units) this.selected.add(unit); }
    private centerTeamCamera(members: any[], speed: number, sourceCell?: any): void {
        if ((this.launch.semanticsVersion ?? 1) < 22) throw new Error('Team camera requires campaign interpreter 22');
        if (!Number.isInteger(speed) || speed < 0 || speed > 4) throw new Error(`Invalid source camera speed: ${speed}`);
        if (this.launch.edition === 'yr' && (this.launch.semanticsVersion ?? 1) >= 30) {
            if (!sourceCell) throw new Error('Original YR team camera requires its source waypoint cell');
            if (!this.restoring) {
                if (!this.uiTeamCamera) throw new Error('Campaign team camera presentation is unavailable');
                this.uiTeamCamera(sourceCell, speed);
            }
            return;
        }
        const live = members.filter(member => member.isSpawned && !member.isDestroyed && !member.isCrashing);
        // All original RA2 script34 references use one Tanya. Multi-member
        // source centroid/path fallback needs separate admission, not a guess.
        if (live.length !== 1) throw new Error('Multi-member team camera requires source center qualification');
        if (!this.restoring) {
            if (!this.uiTeamCamera) throw new Error('Campaign team camera presentation is unavailable');
            this.uiTeamCamera(live[0].tile, speed);
        }
    }
    notePlayerOrder(unit: any, player: any): void {
        if (!this.legacySemantics && player === this.game.localPlayer && canControlOwner(player, unit.owner)) this.teams.release(unit);
    }

    noteSourceTeamTag(unit: any, type: string, instance: number): void {
        if (this.launch.edition !== 'yr' || (this.launch.semanticsVersion ?? 1) < 38) return;
        const team = this.definition.teams.get(type), tag = team && this.definition.tags.get(team.properties.Tag);
        const force = team && this.definition.taskForces.get(team.taskForce);
        if (!tag || tag.repeat !== 0 || force?.units.length !== 1 || force.units[0].count !== 1
            || this.definition.triggerChain(tag.trigger).some(id => {
                const events = this.definition.triggers.get(id)!.events;
                return events.length !== 1 || events[0].opcode !== 48;
            }) || this.sourceTeamCaptureTags.has(instance)) return;
        this.sourceTeamCaptureTags.add(instance);
        const trigger = this.definition.triggers.get(tag.trigger)!;
        if (!this.machine.states.get(trigger.id)?.finished) return;
        if (this.targets(trigger).some(target => target !== unit && !target.isDestroyed && target.isSpawned))
            throw new Error('Overlapping fresh single-actor capture tags require independent source instances');
        if (!this.machine.renewConsumedCaptureTag(tag.id, this.targetId(unit))) return;
        for (const id of this.definition.triggerChain(tag.trigger)) this.boundTargets.set(id, [unit]);
        this.events = this.events.filter(event => event.type !== EventType.ObjectOwnerChange || event.target !== unit);
        this.sourceQuirks.push({ section: 'Tags', key: tag.id, value: String(this.machine.tick),
            kind: 'fresh-source-single-actor-capture-tag-renewed' });
    }

    noteMindControlHit(target: any, controller: any, previousOwner: any): void {
        if ((this.launch.semanticsVersion ?? 1) < 11 || previousOwner === target.owner
            || target.mindControllableTrait?.getController() !== controller) return;
        // A successful psychic hit is an attack even though it deals no
        // health damage. Keep the pre-control house for deferred tag dispatch.
        this.events.push(new ObjectAttackedEvent(target, { obj: controller, player: controller.owner }, false, previousOwner));
    }

    setGlobalVariable(id: number, value: boolean): void {
        if (!this.globals) throw new Error('Campaign globals require interpreter 12');
        this.globals.set(id, value);
    }

    private refreshDiscovery(): void {
        if (!this.discoverySubjects.size) return;
        const shroud = this.game.mapShroudTrait.getPlayerShroud(this.game.localPlayer);
        for (const owner of this.discoverySubjects) {
            if (this.discoveredHouses.has(owner)) continue;
            if (owner.getOwnedObjects(true).some((object: any) => object.isTechno() && object.isSpawned
                && !object.isDestroyed && !object.limboData && !object.rules.invisibleInGame && object.tile
                && this.game.map.tileOccupation.calculateTilesForGameObject(object.tile, object)
                    .some((tile: any) => !shroud.isShrouded(tile, object.tileElevation)))) this.discoveredHouses.add(owner);
        }
    }

    private refreshTargets(): void {
        const tagged = this.game.world.getAllObjects().filter((object: any) => object.tag);
        for (const trigger of this.definition.triggers.values()) {
            const bound = this.boundTargets.get(trigger.id);
            if (!bound) continue;
            const tags = this.definition.tagsForTrigger(trigger.id).map(tag => tag.id);
            for (const object of tagged) if (tags.includes(object.tag.id) && !bound.includes(object)) {
                bound.push(object); this.machine.addTarget(trigger.id, this.targetId(object));
            }
        }
    }

    private targets(trigger: CampaignTrigger): any[] {
        const bound = this.boundTargets.get(trigger.id);
        if (bound) return bound;
        const tags = this.definition.tagsForTrigger(trigger.id).map(tag => tag.id);
        const objects = this.game.world.getAllObjects().filter((object: any) => tags.includes(object.tag?.id));
        const cells = this.definition.cellTags.filter(cell => tags.includes(cell.tag))
            .map(cell => this.game.map.tiles.getByMapCoords(cell.x, cell.y)).filter(Boolean);
        return [...objects, ...cells];
    }
    private targetId(target: any): string { return target.id === undefined ? `cell:${target.rx},${target.ry}` : `object:${target.id}`; }

    private check(event: CampaignInstruction, trigger: CampaignTrigger, observations = this.events): boolean | string[] {
        const parameter = Number(event.params[1]);
        const targets = this.targets(trigger);
        const yrResult = this.yr?.check(event, targets, observations);
        if (yrResult !== undefined) return yrResult;
        const triggered = (types: EventType[], predicate: (event: any) => boolean = () => true) => observations
            .filter(entry => types.includes(entry.type) && targets.includes(entry.target) && predicate(entry))
            .map(entry => this.targetId(entry.target));
        switch (event.opcode) {
            case 1: return triggered([EventType.EnterObject, EventType.EnterTile], entry =>
                (parameter === -1 || entry.source.owner === this.resolveHouse(parameter)) && entry.source.zone !== ZoneType.Air);
            // RA2 event 2 has no house selector. Its serialized zero is an
            // unused field, unlike the separate disguise-house event 53.
            case 2: return triggered([EventType.BuildingInfiltration]);
            case 4: {
                const shroud = this.game.mapShroudTrait.getPlayerShroud(this.game.localPlayer);
                return targets.filter(target => target.isTechno?.() && !shroud.isShrouded(target.tile, target.tileElevation)).map(target => this.targetId(target));
            }
            case 5:
                if ((this.launch.semanticsVersion ?? 1) < 12) throw new Error('House discovery requires campaign interpreter 12');
                return this.discoveredHouses.has(this.resolveHouse(parameter));
            case 6: case 44: return triggered([EventType.ObjectAttacked], entry => {
                const player = entry.attacker?.player;
                const owner = (this.launch.semanticsVersion ?? 1) >= 11 ? entry.ownerAtHit ?? entry.target.owner : entry.target.owner;
                return !entry.incidental && (!player || player !== owner && !this.game.alliances.areAllied(player, owner))
                    && (event.opcode === 6 || player === this.resolveHouse(parameter));
            });
            case 7: return triggered([EventType.ObjectDestroy], entry => {
                const attacker = entry.attackerInfo?.player;
                // Splash is a targeting distinction, not an environmental
                // cause. An owned weapon still destroys on behalf of a house.
                const combat = (this.launch.semanticsVersion ?? 1) >= 13
                    ? !!attacker && (!entry.incidental || !!entry.attackerInfo.weapon) : !entry.incidental;
                return combat && (!attacker || attacker !== entry.target.owner
                    && !this.game.alliances.areAllied(attacker, entry.target.owner));
            });
            case 14: return observations.some(entry => entry.type === EventType.TimerExpire);
            case 29: return triggered([EventType.ObjectDestroy]);
            case 31: {
                if ((this.launch.semanticsVersion ?? 1) < 17) throw new Error('Attached bridge destruction requires campaign interpreter 17');
                const bridges = this.game.map.bridges;
                return observations.filter(entry => entry.type === EventType.ObjectDestroy
                    && entry.target.isOverlay() && entry.target.isBridge() && entry.target.bridgeTrait?.bridgeSpec)
                    .flatMap(entry => {
                        const spec = entry.target.bridgeTrait.bridgeSpec;
                        if (!bridges.findDestroyedPieceTiles(spec).length) return [];
                        const span = bridges.findAllBridgeTiles(spec);
                        return targets.filter(target => span.includes(target.tile ?? target)).map(target => this.targetId(target));
                    });
            }
            case 15:
                if ((this.launch.semanticsVersion ?? 1) < 10) throw new Error('Building-loss event requires campaign interpreter 10');
                return (this.buildingLosses.get(this.resolveHouse(trigger.house)) ?? 0) >= parameter;
            case 9: case 10: case 11: case 55: case 56: {
                const player = this.resolveHouse(parameter);
                const originalGroundClasses = this.launch.edition === 'yr' && (this.launch.semanticsVersion ?? 1) >= 45;
                return !player.getOwnedObjects(true).some((object: any) => !object.isDestroyed && !object.rules.insignificant &&
                    (!originalGroundClasses || !object.isAircraft()) &&
                    (event.opcode === 11 ? object.isTechno() : event.opcode === 10 ? object.isBuilding()
                        : object.isUnit() && (event.opcode === 55 ? !!object.rules.naval : event.opcode !== 56 || !object.rules.naval)));
            }
            case 16: return [ObjectType.Infantry, ObjectType.Vehicle, ObjectType.Aircraft].reduce((sum, type) =>
                sum + this.resolveHouse(trigger.house).getUnitsLost(type), 0) >= parameter;
            case 17:
                if ((this.launch.semanticsVersion ?? 1) < 20) throw new Error('No factories condition requires campaign interpreter 20');
                return ![...this.resolveHouse(trigger.house).buildings].some((building: any) => !building.isDestroyed && !!building.rules.factory);
            case 19: return observations.some(entry => {
                const building = entry.type === EventType.BuildingPlace ? entry.target
                    : (this.launch.semanticsVersion ?? 1) >= 18 && entry.type === EventType.ObjectMorph
                        && entry.from.isVehicle() && entry.to.isBuilding() && entry.from.rules.deploysInto === entry.to.name
                        ? entry.to : undefined;
                return building?.owner === this.resolveHouse(trigger.house) && building.rules.index === parameter;
            });
            case 20: case 21: case 22: return observations.some(entry => entry.type === EventType.FactoryProduceUnit
                && entry.target?.owner === this.resolveHouse(trigger.house)
                && (event.opcode === 20 ? entry.target?.isVehicle() : event.opcode === 21 ? entry.target?.isInfantry() : entry.target?.isAircraft())
                && entry.target.rules.index === parameter);
            case 25: case 26: return observations.filter(entry => entry.type === EventType.EnterTile
                && entry.source.zone !== ZoneType.Air && entry.source.owner === this.resolveHouse(parameter))
                .flatMap(entry => targets.filter(target => (target.id === undefined
                    || ((this.launch.semanticsVersion ?? 1) >= 10 || this.launch.tileLineVersion === 1) && typeof target.id === 'string'
                        && typeof target.rx === 'number' && typeof target.ry === 'number')
                    && (event.opcode === 25 ? target.ry === entry.target.ry : target.rx === entry.target.rx))
                    .map(target => this.targetId(target)));
            case 30: return this.resolveHouse(parameter).powerTrait.isLowPower();
            case 27: case 28:
                if (!this.globals) throw new Error('Global condition requires campaign interpreter 12');
                return this.globals.get(parameter) === (event.opcode === 27);
            case 32: case 57: {
                const has = [...this.resolveHouse(trigger.house).buildings].some((object: any) => !object.isDestroyed && object.rules.index === parameter);
                return event.opcode === 32 ? has : !has;
            }
            case 33: return targets.filter(target => this.selected.has(target)).map(target => this.targetId(target));
            case 39: case 40:
                if ((this.launch.semanticsVersion ?? 1) < 18) throw new Error('Combat health thresholds require campaign interpreter 18');
                return triggered([EventType.InflictDamage], entry =>
                    campaignCombatThreshold(entry, this.game.rules.audioVisual.conditionRed) === event.opcode);
            case 41:
                if ((this.launch.semanticsVersion ?? 1) < 11) throw new Error('First-damage event requires campaign interpreter 11');
                // Original damage dispatch compares pre-hit strength with the
                // type maximum. Repairing to full permits another first hit.
                return triggered([EventType.InflictDamage, EventType.ObjectDestroy], entry => entry.type === EventType.ObjectDestroy
                    ? entry.previousHealth === 100
                    : entry.prevHealth === 100 && entry.currentHealth < entry.prevHealth && entry.damageHitPoints > 0);
            case 48: {
                // Original YR FootClass ownership changes call the attached
                // destruction notification, including psychic capture and
                // release. Preserve the older RA2 and YR journal policy.
                const unitTransfers = this.launch.edition === 'yr' && (this.launch.semanticsVersion ?? 1) >= 36;
                return triggered(unitTransfers
                    ? [EventType.ObjectDestroy, EventType.BuildingCapture, EventType.BuildingInfiltration, EventType.ObjectOwnerChange]
                    : (this.launch.semanticsVersion ?? 1) >= 25
                    ? [EventType.ObjectDestroy, EventType.BuildingCapture, EventType.BuildingInfiltration]
                    : [EventType.ObjectDestroy], entry => entry.type !== EventType.ObjectOwnerChange
                        || entry.target.isUnit() && entry.prevOwner !== entry.target.owner);
            }
            case 52:
                if ((this.launch.semanticsVersion ?? 1) < 24) throw new Error('Source available-money threshold requires campaign interpreter 24');
                return this.resolveHouse(trigger.house).credits <= parameter;
            default: throw new Error(`[${event.section}] ${event.key}:${event.index} unsupported event ${event.opcode}`);
        }
    }

    private execute(action: CampaignInstruction, trigger: CampaignTrigger): void {
        this.trace.push({ tick: this.machine.tick, section: action.section, key: action.key, index: action.index, opcode: action.opcode });
        if (!campaignCapabilities.actions.has(action.opcode)) throw new Error(`[Actions] ${action.key}:${action.index} unsupported action ${action.opcode}; original record retained`);
        if (this.yr?.execute(action, trigger)) return;
        if ([25, 51].includes(action.opcode) && (this.launch.semanticsVersion ?? 1) < 22) {
            throw new Error('Timer extension and map reshroud require campaign interpreter 22');
        }
        if ([42, 61].includes(action.opcode) && (this.launch.semanticsVersion ?? 1) < 24) {
            throw new Error('Source weapon detonation and building power-off require campaign interpreter 24');
        }
        if (action.opcode === 42) {
            const waypoint = waypointNumber(action.params[6]), tile = this.game.map.getTileAtWaypoint(waypoint);
            if (!tile) throw new Error(`Missing source explosion waypoint: ${action.params[6]}`);
            detonateTriggerWeapon(this.game, retailCampaignWeapon(this.game.rules, Number(action.params[1])), tile); return;
        }
        if (action.opcode === 20) {
            if ((this.launch.semanticsVersion ?? 1) < 16) throw new Error('Source music switch requires campaign interpreter 16');
            this.musicTheme = action.params[1];
            if (!this.restoring) {
                if (!this.uiAction) throw new Error(`[Actions] ${action.key}:${action.index} campaign presentation is unavailable`);
                this.uiAction(action);
            }
            return;
        }
        if (action.opcode === 104) {
            if ((this.launch.semanticsVersion ?? 1) < 15) throw new Error('Flash Team requires campaign interpreter 15');
            this.teams.flash(action.params[1], Number(action.params[6]), this.machine.tick); return;
        }
        if (action.opcode === 116 || action.opcode === 99 && (this.launch.semanticsVersion ?? 1) >= 15) {
            if ((this.launch.semanticsVersion ?? 1) < 15) throw new Error('Stop Sounds At requires campaign interpreter 15');
            const waypoint = waypointNumber(action.params[6]), tile = this.game.map.getTileAtWaypoint(waypoint);
            if (!tile) {
                // Original Stop Audio accepts a cleared waypoint slot. No
                // positional emitter can have been created at an absent cell.
                if (action.opcode === 116 && this.launch.edition === 'yr' && (this.launch.semanticsVersion ?? 1) >= 41
                    && !this.definition.waypoints.has(waypoint)) {
                    this.sourceQuirks.push({ section: action.section, key: action.key, value: action.raw,
                        kind: 'original-stop-sound-undefined-waypoint' });
                    return;
                }
                throw new Error(`Missing sound waypoint: ${action.params[6]}`);
            }
            const key = `${tile.rx},${tile.ry},${tile.z}`;
            if (action.opcode === 99) {
                const requests = this.soundEmitters.get(key) ?? [];
                requests.push({ sound: action.params[1], waypoint, tick: this.machine.tick });
                this.soundEmitters.set(key, requests);
            } else this.soundEmitters.delete(key);
            if (!this.restoring) this.game.events.dispatch(action.opcode === 99
                ? new TriggerSoundFxEvent(action.params[1], tile) : new TriggerStopSoundFxEvent(tile));
            return;
        }
        if (action.opcode === 28 || action.opcode === 29) {
            this.setGlobalVariable(Number(action.params[1]), action.opcode === 28); return;
        }
        if ([3, 74].includes(action.opcode)) {
            const owner = this.resolveHouse(Number(action.params[1]));
            (action.opcode === 3 ? this.teams.production : this.teams.aiEnabled).add(owner);
            return;
        }
        if (action.opcode === 75) { this.teams.aiEnabled.delete(this.resolveHouse(Number(action.params[1]))); return; }
        if (action.opcode === 77 || action.opcode === 78) {
            if ((this.launch.semanticsVersion ?? 1) < 12) throw new Error('Original team ratio fields require campaign interpreter 12');
            const value = Number(action.params[1]);
            if (!Number.isSafeInteger(value)) throw new Error('Invalid original team production ratio');
            const owner = this.triggerOwner(trigger);
            if (owner) this.legacyProductionRatios.get(owner)![action.opcode === 77 ? 'aircraft' : 'infantry'] = value;
            // The installed RA2 handlers write these legacy fields. No AI read
            // exists in that image; they must not replace RatioAITriggerTeam.
            this.sourceQuirks.push({ section: action.section, key: action.key, value: action.raw, kind: 'retained-original-legacy-team-ratio' });
            return;
        }
        if (action.opcode === 107) {
            this.teams.create(action.params[1], true, waypointNumber(action.params[6]), undefined, undefined, true); return;
        }
        if ([4, 5, 7, 80].includes(action.opcode)) {
            if ((isNullCampaignTeamAction(action) || this.yr && action.opcode === 7 && action.params[0] === '0' && action.params[1] === '0')
                && !this.definition.teams.has(action.params[1])) {
                if ((this.launch.semanticsVersion ?? 1) < 10) throw new Error('Null team action requires campaign interpreter 10');
                this.sourceQuirks.push({ section: 'Actions', key: action.key, value: action.raw, kind: 'original-null-team-pointer' });
                return;
            }
            if (action.opcode === 5) this.teams.destroy(action.params[1]);
            else this.teams.create(action.params[1], action.opcode !== 4,
                action.opcode === 80 ? waypointNumber(action.params[6]) : undefined);
            return;
        }
        if (action.opcode === 6) { this.teams.hunt(this.resolveHouse(Number(action.params[1]))); return; }
        if (action.opcode === 9) {
            for (const building of [...this.resolveHouse(Number(action.params[1])).buildings]) this.game.sellTrait.sell(building);
            return;
        }
        if (action.opcode === 14) {
            const owner = this.resolveHouse(Number(action.params[1]));
            for (const object of this.targets(trigger)) if (object.isTechno?.() && object.isSpawned) this.game.changeObjectOwner(object, owner);
            return;
        }
        if (action.opcode === 111) {
            if ((this.launch.semanticsVersion ?? 1) < 20) throw new Error('Evict occupiers requires campaign interpreter 20');
            // Original action111 stops after the first live building carrying
            // this trigger, even when that building has no occupants.
            const building = this.targets(trigger).find(object => object.isBuilding?.() && object.isSpawned && !object.isDestroyed);
            building?.garrisonTrait?.evacuate(this.game, false);
            return;
        }
        if (action.opcode === 36) {
            const owner = this.resolveHouse(trigger.house), destination = this.resolveHouse(Number(action.params[1]));
            const objects = [...owner.getOwnedObjects(true)].filter((object: any) => !object.isDestroyed);
            for (const object of objects) this.teams.release(object);
            // A transport changes its passengers recursively. Release every
            // assignment first and avoid transferring an already moved passenger.
            for (const object of objects) if (object.owner === owner) this.game.changeObjectOwner(object, destination);
            return;
        }
        if (action.opcode === 16) { this.game.mapShroudTrait.revealMap(this.game.localPlayer, this.game); return; }
        if (action.opcode === 18) {
            if ((this.launch.semanticsVersion ?? 1) < 21) throw new Error('Zone reveal requires campaign interpreter 21');
            const tile = this.game.map.getTileAtWaypoint(Number(action.params[1]));
            if (!tile) throw new Error(`Missing zone reveal waypoint: ${action.params[1]}`);
            revealCampaignZone(this.game, tile); return;
        }
        if (action.opcode === 44) {
            if ((this.launch.semanticsVersion ?? 1) < 18) throw new Error('Source storm duration requires campaign interpreter 18');
            this.game.traits.get(SuperWeaponsTrait).startCampaignLightning(this.game, Number(action.params[1]));
            return;
        }
        if (action.opcode === 90) {
            if (!this.lightning) throw new Error('Single lightning strike requires campaign interpreter 12');
            const tile = this.game.map.getTileAtWaypoint(waypointNumber(action.params[6]));
            if (!tile) throw new Error(`Missing lightning waypoint: ${action.params[6]}`);
            this.lightning.strike(tile); return;
        }
        if (action.opcode === 102) {
            const tile = this.game.map.getTileAtWaypoint(waypointNumber(action.params[6]));
            if (!tile) throw new Error(`Missing lightning waypoint: ${action.params[6]}`);
            const owner = (this.launch.semanticsVersion ?? 1) >= 12 ? this.triggerOwner(trigger) : this.resolveHouse(trigger.house);
            if ((this.launch.semanticsVersion ?? 1) >= 12 && this.game.traits.get(SuperWeaponsTrait).hasActiveEffectType(SuperWeaponType.LightningStorm)) return;
            const rules = [...this.game.rules.superWeaponRules.values()].find((rule: any) => rule.type === SuperWeaponType.LightningStorm);
            if (!rules) throw new Error('Missing original lightning storm rules');
            this.game.traits.get(SuperWeaponsTrait).activateEffect(rules, owner, this.game, tile, undefined, true);
            return;
        }
        if (action.opcode === 113 && (this.launch.semanticsVersion ?? 1) >= 4) {
            const owners = Number(action.params[1]) === -1 ? [...this.houses.values()] : [this.resolveHouse(Number(action.params[1]))];
            for (const owner of owners) for (const unit of owner.getOwnedObjectsByType(ObjectType.Infantry)) {
                if (unit.unitOrderTrait.isIdle()) unit.unitOrderTrait.addTask(new CheerTask());
            }
            return;
        }
        if (action.opcode === 35) {
            if ((this.launch.semanticsVersion ?? 1) < 25 || !this.superWeapons) throw new Error('Source target preference requires campaign interpreter 25');
            this.superWeapons.setPreferred(this.resolveHouse(trigger.house), Number(action.params[1]));
            return;
        }
        if (action.opcode === 37) {
            if ((this.launch.semanticsVersion ?? 1) < 11) throw new Error('Source Make Ally requires campaign interpreter 11');
            const owner = this.resolveHouse(trigger.house), ally = this.resolveHouse(Number(action.params[1]));
            this.game.alliances.setScenarioAllies(owner, [...this.game.alliances.getAllies(owner), ally]);
            return;
        }
        if (action.opcode === 38) {
            const owner = this.resolveHouse(trigger.house), enemy = this.resolveHouse(Number(action.params[1]));
            this.game.alliances.setScenarioAllies(owner, this.game.alliances.getAllies(owner).filter((player: any) => player !== enemy));
            this.teams.sourceAi?.declareEnemy(owner, enemy);
            return;
        }
        if (action.opcode === 88) {
            const tile = this.game.map.getTileAtWaypoint(waypointNumber(action.params[6]));
            if (!tile) throw new Error(`Missing particle waypoint: ${action.params[6]}`);
            this.particles.create(Number(action.params[1]), tile);
            return;
        }
        if (action.opcode === 89) {
            if ((this.launch.semanticsVersion ?? 1) < 26 || !(this.particles instanceof CampaignSourceParticles)) {
                throw new Error('Source particle removal requires campaign interpreter 26');
            }
            const tile = this.game.map.getTileAtWaypoint(waypointNumber(action.params[6]));
            if (!tile) throw new Error(`Missing particle-removal waypoint: ${action.params[6]}`);
            this.particles.removeAt(tile);
            return;
        }
        if (action.opcode === 115) {
            const type = this.launch.edition === 'yr'
                ? [ObjectType.Building, ObjectType.Vehicle, ObjectType.Aircraft, ObjectType.Infantry]
                    .filter(type => this.game.rules.hasObject(action.params[1], type)).map(type => this.game.rules.getObject(action.params[1], type))[0]
                : retailCampaignTechno(this.game.rules, Number(action.params[1]));
            if (!type) throw new Error('Unknown original cameo type: ' + action.params[1]);
            this.cameoFlashes.set(type.name, this.machine.tick + Number(action.params[6]));
            return;
        }
        if (action.opcode === 40) {
            if ((this.launch.semanticsVersion ?? 1) < 12) throw new Error('View resize requires campaign interpreter 12');
            const [x, y, width, height] = action.params.slice(2, 6).map(Number), size = { x, y, width, height };
            if (![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
                throw new Error('Invalid original player-view rectangle');
            }
            this.game.map.mapBounds.updateRawLocalSize(size, !!this.yr);
            if (JSON.stringify(this.game.map.mapBounds.getRawLocalSize()) !== JSON.stringify(size)) {
                throw new Error('Original player-view rectangle could not be applied');
            }
            return;
        }
        if (action.opcode === 1 || action.opcode === 2) {
            const target = this.resolveHouse(Number(action.params[1]));
            if (target !== this.game.localPlayer) throw new Error('Non-player mission result semantics are not verified');
            this.result = action.opcode === 1 ? 'victory' : 'defeat';
            target.defeated = this.result === 'defeat';
            this.game.afterTick(() => this.game.end());
            return;
        }
        if ([10, 46, 47, 48, 100, 112, 114, 115, 117].includes(action.opcode)) {
            if (action.opcode === 10 && (this.launch.semanticsVersion ?? 1) < 14) throw new Error('Source fullscreen movie requires campaign interpreter 14');
            if (action.opcode === 117 && (this.launch.semanticsVersion ?? 1) < 25) throw new Error('Source paused radar movie requires campaign interpreter 25');
            if (action.opcode === 112 && (this.launch.semanticsVersion ?? 1) < 12) throw new Error('Camera jump requires campaign interpreter 12');
            if (action.opcode === 46 || action.opcode === 47) this.inputLocked = action.opcode === 46;
            if (!this.restoring) {
                if (!this.uiAction) throw new Error(`[Actions] ${action.key}:${action.index} campaign presentation is unavailable`);
                this.uiAction(action);
            }
            return;
        }
        if (action.opcode === 17 || action.opcode === 101) {
            const tile = this.game.map.getTileAtWaypoint(Number(action.params[1]));
            if (!tile) throw new Error(`Missing reveal waypoint: ${action.params[1]}`);
            const shroud = this.game.mapShroudTrait.getPlayerShroud(this.game.localPlayer);
            if (action.opcode === 17) shroud.revealAround(tile, this.game.rules.general.revealTriggerRadius);
            else shroud.unrevealAround(tile, this.game.rules.general.revealTriggerRadius);
            return;
        }
        if (action.opcode === 27 && (this.launch.semanticsVersion ?? 1) >= 12) {
            // Original Timer Set also starts a stopped timer at the current frame.
            this.game.countdownTimer.setSeconds(Number(action.params[1]));
            this.game.countdownTimer.start();
            return;
        }
        const converted = { type: action.opcode, triggerId: trigger.id, index: action.index,
            params: [Number(action.params[0]), ...action.params.slice(1, 6),
                /^[A-Z]+$/i.test(action.params[6]) ? waypointNumber(action.params[6]) : Number(action.params[6])] };
        this.executorFactory.create(converted, { id: trigger.id, houseName: trigger.house, name: trigger.name }).execute(this.game, this.targets(trigger));
    }

    lightningPresentation(): {
        clouds: ReturnType<CampaignLightning['presentation']>;
        storms: ReturnType<SuperWeaponsTrait['campaignLightningPresentation']>;
    } | undefined {
        if ((this.launch.semanticsVersion ?? 1) < 12) return;
        return { clouds: this.lightning!.presentation(), storms: this.game.traits.get(SuperWeaponsTrait).campaignLightningPresentation(this.game) };
    }
    dispose(): void { this.subscription?.(); this.subscription = undefined; this.events = []; this.particles.dispose(); }
    checkpointState(): unknown {
        const storms = (this.launch.semanticsVersion ?? 1) >= 12 ? this.game.traits.get(SuperWeaponsTrait).campaignLightningSnapshot() : [];
        return { ...(this.yr ? { yr: this.yr.snapshot() } : {}), triggers: this.machine.snapshot(), teams: this.teams.snapshot(), particles: this.particles.snapshot(),
            ...(this.launch.edition === 'yr' && (this.launch.semanticsVersion ?? 1) >= 38
                ? { sourceTeamCaptureTags: [...this.sourceTeamCaptureTags] } : {}),
            ...(this.superWeapons ? { superWeapons: this.superWeapons.snapshot() } : {}),
            ...((this.launch.semanticsVersion ?? 1) >= 16 ? { musicTheme: this.musicTheme ?? null } : {}),
            ...((this.launch.semanticsVersion ?? 1) >= 15 ? { soundEmitters: [...this.soundEmitters] } : {}),
            ...(storms.length ? { lightningStorms: storms } : {}),
            ...((this.launch.semanticsVersion ?? 1) >= 12 ? { viewBounds: { ...this.game.map.mapBounds.getRawLocalSize() },
                globals: this.globals!.snapshot(), discoveredHouses: [...this.discoveredHouses].map(owner => owner.name),
                legacyProductionRatios: [...this.legacyProductionRatios].map(([owner, values]) => [owner.name, { ...values }]),
                lightning: this.lightning!.snapshot() } : {}),
            ...((this.launch.semanticsVersion ?? 1) >= 10 ? {
                buildingLosses: [...this.houses].map(([id, owner]) => [id, this.buildingLosses.get(owner) ?? 0]),
            } : {}),
            ...(this.sourceQuirks.length ? { sourceQuirks: this.sourceQuirks } : {}),
            ...(this.baseBuilder ? { baseBuilder: this.baseBuilder.snapshot(), countdown: this.game.countdownTimer.snapshot() } : {}),
            cameoFlashes: [...this.cameoFlashes], result: this.result ?? null, failure: this.failure ?? null, inputLocked: this.inputLocked };
    }
}

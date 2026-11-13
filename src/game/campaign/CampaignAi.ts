import type { CampaignAiTrigger, CampaignDefinition, CampaignDifficulty } from '../../data/campaign/CampaignDefinition';
import type { CampaignTeamInstance } from './CampaignTeams';
import { SuperWeaponStatus } from '../SuperWeapon';
import { SuperWeaponType } from '../type/SuperWeaponType';
import { ObjectType } from '../../engine/type/ObjectType';

export const campaignAiConditions = new Set([-1, 0, 1, 2, 3, 4, 5, 6, 7]);
export function campaignOpeningGrace(launch: any): number {
    return launch?.openingGraceVersion === 1 ? { easy: 1350, normal: 900, hard: 450 }[launch.difficulty] ?? 0 : 0;
}
const alive = (unit: any) => !unit.isDestroyed && !unit.isCrashing;

interface CampaignAiHost {
    instances: Map<number, CampaignTeamInstance>;
    production: Set<any>;
    aiEnabled: Set<any>;
    create(type: string, reinforce: boolean, waypoint: undefined, trigger: string, owner: any): CampaignTeamInstance;
    finish(team: CampaignTeamInstance): void;
}

// Interpreter 6 reads the archived AI library alongside scenario overrides.
// Legacy journals continue to use the frozen selector in CampaignTeams.
export class CampaignAi {
    readonly trace: { tick: number; house: string; trigger: string; teams: string[] }[] = [];
    private next = new Map<any, number>();
    private openingReady = new Map<any, number>();
    private weights = new Map<string, number>();
    private outcomes = new Map<string, { runs: number; successes: number }>();
    private enemies = new Map<any, any>();
    private anger = new Map<any, Map<any, number>>();

    openingAttackDeadline(owner: any, tick: number): number | undefined {
        const grace = campaignOpeningGrace(this.game.gameOpts.campaign);
        if (!grace) return;
        if (!this.openingReady.has(owner)) this.openingReady.set(owner, tick + grace);
        return this.openingReady.get(owner);
    }

    constructor(private definition: CampaignDefinition, private game: any,
        private house: (reference: string | number) => any, private host: CampaignAiHost) {
        for (const trigger of definition.aiTriggers.values()) this.weights.set(trigger.id, trigger.weight);
    }

    private difficultyIndex(): number {
        return { hard: 0, normal: 1, easy: 2 }[this.game.gameOpts.campaign.difficulty as CampaignDifficulty];
    }

    private listValue(key: string): number {
        const values = this.game.rules.getIni().getSection('General')?.getNumberArray(key);
        const value = values?.[this.difficultyIndex()];
        if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid original campaign AI list: ${key}`);
        return value;
    }

    enemy(owner: any): any {
        const hostile = (player: any) => player !== owner && !player.isNeutral
            && !this.game.alliances.areAllied(owner, player) && player.getOwnedObjects(true).some(alive);
        const explicit = this.enemies.get(owner);
        if (explicit && hostile(explicit)) return explicit;
        return [...(this.anger.get(owner) ?? [])].filter(([player]) => hostile(player))
            .sort((a, b) => b[1] - a[1])[0]?.[0];
    }

    declareEnemy(owner: any, enemy: any): void { this.enemies.set(owner, enemy); }

    noteDamage(event: any): void {
        const owner = event.target.owner, attacker = event.attacker?.player ?? event.attacker?.obj?.owner;
        if (!owner?.isAi || owner.isNeutral || !attacker || attacker === owner || attacker.isNeutral
            || event.damageHitPoints <= 0 || this.game.alliances.areAllied(owner, attacker)) return;
        const anger = this.anger.get(owner) ?? new Map<any, number>();
        anger.set(attacker, (anger.get(attacker) ?? 0) + event.damageHitPoints); this.anger.set(owner, anger);
    }

    private ownedTeams(owner: any): CampaignTeamInstance[] {
        return [...this.host.instances.values()].filter(team => team.owner === owner && team.phase !== 'finished');
    }

    private belowMaximum(type: string, owner?: any): boolean {
        const maximum = Number(this.definition.teams.get(type)!.properties.Max ?? 0);
        return maximum < 0 || [...this.host.instances.values()].filter(team => team.type === type && team.phase !== 'finished'
            && (!owner || team.owner === owner)).length < maximum;
    }

    private teamTypes(trigger: CampaignAiTrigger): string[] {
        return [trigger.team, ...(trigger.secondTeam ? [trigger.secondTeam] : [])];
    }

    private rules(name: string): any {
        for (const type of [ObjectType.Infantry, ObjectType.Vehicle, ObjectType.Aircraft]) {
            if (this.game.rules.hasObject(name, type)) return this.game.rules.getObject(name, type);
        }
        throw new Error(`Unknown campaign AI member: ${name}`);
    }

    effectiveTechLevel(trigger: CampaignAiTrigger): number {
        return Math.max(0, ...this.teamTypes(trigger).flatMap(type => {
            const force = this.definition.taskForces.get(this.definition.teams.get(type)!.taskForce)!;
            return force.units.map(unit => {
                const level = this.rules(unit.type).techLevel;
                // In campaign mode a disabled type still needs an already
                // owned recruit; the ordinary buildability gate rejects it.
                return Math.max(0, level);
            });
        }));
    }

    ownerMatches(trigger: CampaignAiTrigger, owner: any): boolean {
        if (trigger.house.toLowerCase() === '<none>') return false;
        if (trigger.house.toLowerCase() !== '<all>' && trigger.house !== owner.name && trigger.house !== owner.country.name) return false;
        return !(trigger.side! > 0) || trigger.side === owner.country.side + 1;
    }

    private canSupply(type: string, owner: any): boolean {
        const spec = this.definition.teams.get(type)!, force = this.definition.taskForces.get(spec.taskForce)!;
        return force.units.every(unit => {
            const rules = this.rules(unit.type);
            return owner.production.isAvailableForProduction(rules) || owner.getOwnedObjects(true).some((object: any) =>
                object.name === unit.type && object.isUnit() && alive(object) && object.isSpawned && !object.limboData);
        });
    }

    private compare(trigger: CampaignAiTrigger, value: number): boolean {
        switch (trigger.comparison) {
            case 0: return value < trigger.count;
            case 1: return value <= trigger.count;
            case 2: return value === trigger.count;
            case 3: return value >= trigger.count;
            case 4: return value > trigger.count;
            case 5: return value !== trigger.count;
            default: throw new Error(`Invalid campaign AI comparison: ${trigger.id}`);
        }
    }

    condition(trigger: CampaignAiTrigger, owner: any): boolean {
        if (!campaignAiConditions.has(trigger.condition)) throw new Error(`Unsupported campaign AI condition: ${trigger.id}/${trigger.condition}`);
        if (trigger.condition === -1) return true;
        const enemy = this.enemy(owner);
        if (!enemy && trigger.condition !== 1) return false;
        if ([2, 3].includes(trigger.condition)) {
            if (!enemy) return false;
            const power = enemy.powerTrait.debugGetState();
            const surplus = power.power - power.drain;
            return surplus < (trigger.condition === 2 ? 100 : 0);
        }
        if (trigger.condition === 4) return !!enemy && this.compare(trigger, enemy.credits);
        if (trigger.condition === 5 || trigger.condition === 6) {
            const type = trigger.condition === 5 ? SuperWeaponType.IronCurtain : SuperWeaponType.ChronoSphere;
            const weapon = owner.superWeaponsTrait.getAll().find((weapon: any) => weapon.rules.type === type);
            const threshold = this.game.rules.getIni().getSection('General')!.getNumber('AIMinorSuperReadyPercent');
            return !!weapon && weapon.status !== SuperWeaponStatus.Paused && weapon.getChargeProgress() >= threshold;
        }
        const players = trigger.condition === 1 ? [owner] : trigger.condition === 7
            ? this.game.getAllPlayers().filter((player: any) => player.isNeutral) : enemy ? [enemy] : [];
        const count = players.flatMap((player: any) => player.getOwnedObjects(true))
            .filter((object: any) => alive(object) && object.name === trigger.object).length;
        return this.compare(trigger, count);
    }

    eligible(trigger: CampaignAiTrigger, owner: any, skipDefensive = false): boolean {
        const types = this.teamTypes(trigger);
        const defensive = types.every(type => this.definition.teams.get(type)!.properties.IsBaseDefense?.toLowerCase() === 'yes');
        const onlyDefense = !this.enemy(owner) || this.game.rules.getIni().getSection('General')!.getBool('UseMinDefenseRule')
            && this.ownedTeams(owner).filter(team => this.definition.teams.get(team.type)!.properties.IsBaseDefense?.toLowerCase() === 'yes').length
                < this.listValue('MinimumAIDefensiveTeams');
        return trigger.enabled && trigger.difficulties[this.game.gameOpts.campaign.difficulty as CampaignDifficulty]
            && this.ownerMatches(trigger, owner) && !(defensive && skipDefensive) && (defensive || !onlyDefense)
            && this.effectiveTechLevel(trigger) <= owner.campaignTechLevel && this.condition(trigger, owner)
            && types.every(type => this.belowMaximum(type, owner) && this.canSupply(type, owner));
    }

    update(tick: number): void {
        const delay = this.listValue('TeamDelays');
        let index = 0;
        for (const source of this.definition.houses.values()) {
            const owner = this.house(source.id), initial = delay + 175 * index++;
            if (!owner.isAi || owner.isNeutral) continue;
            if (tick < (this.next.get(owner) ?? initial)) continue;
            this.next.set(owner, tick + Math.max(1, delay));
            const ratio = this.definition.ini.getSection(source.id)!.getNumber('RatioAITriggerTeam', 100);
            if (this.game.generateRandomInt(1, 100) > ratio || !this.host.aiEnabled.has(owner)) continue;
            let teams = this.ownedTeams(owner);
            const defenses = teams.filter(team => this.definition.teams.get(team.type)!.properties.IsBaseDefense?.toLowerCase() === 'yes');
            const cap = this.listValue('TotalAITeamCap');
            let skipDefensive = defenses.length > this.listValue('MaximumAIDefensiveTeams');
            if (teams.length >= cap && defenses.length >= Math.floor(teams.length / 2)) {
                if (defenses[0]) this.host.finish(defenses[0]);
                skipDefensive = true; teams = this.ownedTeams(owner);
            }
            if (teams.length >= cap) continue;
            const choices = [...this.definition.aiTriggers.values()].filter(trigger => this.eligible(trigger, owner, skipDefensive));
            // Original 5000-weight triggers are an exclusive priority class.
            const urgent = choices.filter(trigger => Math.trunc(this.weights.get(trigger.id)!) === 5000);
            const candidates = urgent.length ? urgent : choices;
            const weight = (trigger: CampaignAiTrigger) => Math.max(0, Math.trunc(this.weights.get(trigger.id)!));
            const total = candidates.reduce((sum, trigger) => sum + weight(trigger), 0);
            if (!total) continue;
            let roll = this.game.generateRandomInt(1, total);
            const selected = candidates.find(trigger => (roll -= weight(trigger)) <= 0)!;
            const types = this.teamTypes(selected);
            if (teams.some(team => types.includes(team.type) && team.phase === 'assembling')) continue;
            const created: string[] = [];
            for (const type of types) {
                // Shared source templates need the same owner-specific limit
                // at creation as at eligibility. A global Max=1 defense team
                // otherwise starves the other houses of their first defender.
                const limitOwner = (this.game.gameOpts.campaign.baseActivationVersion ?? 0) >= 2 ? owner : undefined;
                if (!this.belowMaximum(type, limitOwner)) continue;
                this.host.create(type, false, undefined, selected.id, owner); created.push(type);
            }
            this.trace.push({ tick, house: owner.name, trigger: selected.id, teams: created });
        }
    }

    recordOutcome(team: CampaignTeamInstance): void {
        const general = this.game.rules.getIni().getSection('General')!;
        const delta = general.getNumber(team.success ? 'AITriggerSuccessWeightDelta' : 'AITriggerFailureWeightDelta');
        for (const trigger of this.definition.aiTriggers.values()) if (trigger.team === team.type) {
            const current = this.weights.get(trigger.id)!;
            const record = this.outcomes.get(trigger.id) ?? { runs: 0, successes: 0 };
            const history = record.successes - record.runs / 2;
            const term = team.success ? Math.max(0, history) : Math.min(0, history * general.getNumber('AITriggerTrackRecordCoefficient'));
            this.weights.set(trigger.id, Math.max(trigger.minimumWeight, Math.min(trigger.maximumWeight, current + delta + term)));
            record.runs++; if (team.success) record.successes++;
            this.outcomes.set(trigger.id, record);
        }
    }

    snapshot(): unknown {
        return { next: [...this.next].map(([owner, tick]) => [owner.name, tick]), weights: [...this.weights], outcomes: [...this.outcomes],
            ...(this.openingReady.size ? { openingReady: [...this.openingReady].map(([owner, tick]) => [owner.name, tick]) } : {}),
            enemies: [...this.enemies].map(([owner, enemy]) => [owner.name, enemy.name]),
            anger: [...this.anger].map(([owner, values]) => [owner.name, [...values].map(([enemy, value]) => [enemy.name, value])]) };
    }
}

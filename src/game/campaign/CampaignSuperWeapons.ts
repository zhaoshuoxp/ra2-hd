import type { CampaignDefinition } from '../../data/campaign/CampaignDefinition';
import { ObjectType } from '../../engine/type/ObjectType';
import { SuperWeaponStatus } from '../SuperWeapon';
import { SuperWeaponType } from '../type/SuperWeaponType';
import { SuperWeaponsTrait } from '../trait/SuperWeaponsTrait';
import type { CampaignTeams } from './CampaignTeams';
import { FactoryType } from '../rules/TechnoRules';

// Source Action35 changes a house preference; it does not launch a weapon or
// use the serialized waypoint. Automatic major-weapon firing is independent
// of team creation/production. Earlier campaign interpreters stay frozen.
export class CampaignSuperWeapons {
    private preferred = new Map<any, number>();
    readonly trace: { tick: number; house: string; weapon: string; category: number; target: number; cell: number[] }[] = [];
    constructor(private definition: CampaignDefinition, private game: any,
        private house: (reference: string) => any, private teams: CampaignTeams) {}

    setPreferred(owner: any, category: number): void {
        if (!Number.isInteger(category) || category < 0 || category > 11) throw new Error(`Unsupported source target preference: ${category}`);
        this.preferred.set(owner, category);
    }

    private value(key: string): number {
        const values = this.game.rules.getIni().getSection('General')?.getNumberArray(key);
        const indices: Record<string, number> = { hard: 0, normal: 1, easy: 2 };
        const index = indices[this.game.gameOpts.campaign.difficulty];
        const result = values?.[index];
        if (!Number.isSafeInteger(result) || result < 0) throw new Error(`Invalid source strategic target values: ${key}`);
        return result;
    }

    private strategicValue(object: any): number {
        if (this.game.gameOpts.campaign.edition === 'yr' && this.game.gameOpts.campaign.semanticsVersion >= 33)
            return this.yrStrategicValue(object);
        const rules = object.rules;
        if (object.isBuilding()) {
            if (rules.constructionYard) return this.value('AIIonCannonConYardValue');
            if (rules.factory === ObjectType.Vehicle) return this.value('AIIonCannonWarFactoryValue');
            if (rules.power > 0) return this.value('AIIonCannonPowerValue');
            if (rules.isBaseDefense) return this.value('AIIonCannonBaseDefenseValue');
            if (rules.helipad) return this.value('AIIonCannonHelipadValue');
            if (rules.superWeapon) return this.value('AIIonCannonTempleValue');
            return 4;
        }
        if (rules.engineer) return this.value('AIIonCannonEngineerValue');
        if (rules.thief) return this.value('AIIonCannonThiefValue');
        if (object.harvesterTrait) return this.value('AIIonCannonHarvesterValue');
        const source = this.game.rules.getIni().getSection(rules.name);
        if (source?.getString('DeploysInto') && this.game.rules.getBuilding(source.getString('DeploysInto'))?.constructionYard) {
            return this.value('AIIonCannonMCVValue');
        }
        return 2;
    }

    private yrStrategicValue(object: any): number {
        const rules = object.rules, ini = this.game.rules.getIni(), native = ini.getSection(rules.name);
        const listed = (key: string, name: string) => ini.getSection('AI')?.getArray(key)
            .some((value: string) => value.toUpperCase() === name.toUpperCase());
        if (object.isInfantry()) {
            if (rules.engineer) return this.value('AIIonCannonEngineerValue');
            if (native?.getBool('VehicleThief', false)) return this.value('AIIonCannonThiefValue');
        } else if (object.isBuilding()) {
            if (rules.factory === FactoryType.BuildingType) return this.value('AIIonCannonConYardValue');
            if (rules.factory === FactoryType.UnitType && !rules.naval) return this.value('AIIonCannonWarFactoryValue');
            if (rules.power > 0) return this.value('AIIonCannonPowerValue');
            if (rules.isBaseDefense) return this.value('AIIonCannonBaseDefenseValue');
            // Original IsTemple/HoverPad classification is independent of
            // SuperWeapon/Helipad. YR leaves the unused legacy lists absent.
            if (native?.getBool('IsPlug', false)) return this.value('AIIonCannonPlugValue');
            if (native?.getBool('IsTemple', false)) return this.value('AIIonCannonTempleValue');
            if (native?.getBool('HoverPad', false)) return this.value('AIIonCannonHelipadValue');
            if (listed('BuildTech', rules.name)) return this.value('AIIonCannonTechCenterValue');
            return 4;
        } else if (object.isVehicle()) {
            if (object.harvesterTrait) return this.value('AIIonCannonHarvesterValue');
            const deployed = native?.getString('DeploysInto');
            if (deployed && listed('BuildConst', deployed)) return this.value('AIIonCannonMCVValue');
            if ((native?.getNumber('Passengers', 0) ?? 0) > 0) return this.value('AIIonCannonAPCValue');
        }
        return 2;
    }

    private target(owner: any, category: number): any {
        if (category !== 1) return this.teams.preferredSuperWeaponTarget(owner, category);
        // The installed strategic selector ranks the current enemy's technos
        // using the original difficulty lists and samples equal maxima. Exact
        // pristine visibility/cloak ranking remains a documented qualification.
        let enemy = this.teams.sourceAi?.enemy(owner);
        if (!enemy) {
            const humans = [...this.definition.houses.values()].filter(source => source.playerControl)
                .map(source => this.house(source.id)).filter(player => player !== owner && !player.isNeutral
                    && !this.game.alliances.areAllied(owner, player) && player.getOwnedObjects(true).length);
            if (humans.length === 1) enemy = humans[0];
        }
        if (!enemy) return;
        let maximum = -1;
        const candidates: any[] = [];
        for (const object of this.game.world.getAllObjects()) {
            if (object.owner !== enemy || !object.isTechno() || !object.isSpawned || object.isDestroyed || object.isCrashing
                || object.isAircraft() || !this.game.isValidTarget(object)) continue;
            const value = this.strategicValue(object);
            if (value > maximum) { maximum = value; candidates.length = 0; }
            if (value === maximum) candidates.push(object);
        }
        return candidates.length ? candidates[this.game.generateRandomInt(0, candidates.length - 1)] : undefined;
    }

    update(tick: number): void {
        const required = this.game.rules.getIni().getSection('IQ')?.getNumber('SuperWeapons', 4) ?? 4;
        for (const source of this.definition.houses.values()) {
            const owner = this.house(source.id);
            if (source.playerControl || !owner.isAi || owner.isNeutral || owner.defeated || source.iq < required) continue;
            for (const weapon of owner.superWeaponsTrait.getAll()) {
                const yr = this.game.campaign?.yr;
                const types = yr ? [SuperWeaponType.MultiMissile, SuperWeaponType.LightningStorm,
                    SuperWeaponType.PsychicDominator, SuperWeaponType.GeneticConverter]
                    : [SuperWeaponType.MultiMissile, SuperWeaponType.LightningStorm];
                if (weapon.status !== SuperWeaponStatus.Ready
                    || !types.includes(weapon.rules.type)) continue;
                const category = this.preferred.get(owner) ?? 1;
                const designated = yr?.preferredCells.get(owner);
                if (designated) {
                    this.game.traits.get(SuperWeaponsTrait).activateSuperWeapon(weapon.rules.type, owner, this.game, designated, undefined);
                    this.trace.push({ tick, house: owner.name, weapon: weapon.name, category, target: -1, cell: [designated.rx, designated.ry] });
                    continue;
                }
                const target = this.target(owner, category);
                if (!target) continue;
                const foundation = target.getFoundation();
                const width = foundation.width, height = foundation.height;
                const tile = this.game.map.tiles.getByMapCoords(target.tile.rx + Math.floor(width / 2), target.tile.ry + Math.floor(height / 2));
                if (!tile) throw new Error('Source superweapon target has no map cell');
                this.game.traits.get(SuperWeaponsTrait).activateSuperWeapon(weapon.rules.type, owner, this.game, tile, undefined);
                this.trace.push({ tick, house: owner.name, weapon: weapon.name, category, target: target.id, cell: [tile.rx, tile.ry] });
            }
        }
    }

    snapshot(): unknown { return { preferred: [...this.preferred].map(([owner, category]) => [owner.name, category]) }; }
}

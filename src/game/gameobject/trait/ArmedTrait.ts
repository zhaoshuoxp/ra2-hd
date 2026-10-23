import { RangeHelper } from '../unit/RangeHelper';
import { Weapon } from "@/game/Weapon";
import { WeaponType } from "@/game/WeaponType";
import { NotifyTick } from "@/game/gameobject/trait/interface/NotifyTick";
import { NotifyDestroy } from "@/game/gameobject/trait/interface/NotifyDestroy";
import { VeteranLevel } from "@/game/gameobject/unit/VeteranLevel";
import { isNotNullOrUndefined } from "@/util/typeGuard";
import { fnv32a } from '@/util/math';
interface GameObject {
    veteranLevel: VeteranLevel;
    rules: GameObjectRules;
    art: GameObjectArt;
    name: string;
    explodes: boolean;
    crashableTrait?: any;
    isCrashing?: boolean;
    tile: any;
    transportTrait?: {
        units: GameObject[];
    };
    isVehicle(): boolean;
}
interface GameObjectRules {
    isGattling?: boolean;
    gattlingStages: number[];
    eliteGattlingStages: number[];
    gattlingRateUp: number;
    gattlingRateDown: number;
    weaponCount?: number;
    elitePrimary?: string;
    primary?: string;
    eliteSecondary?: string;
    secondary?: string;
    deathWeapon?: string;
    combatDamage: {
        deathWeapon?: string;
    };
    guardRange: number;
    deployFire?: boolean;
    deployFireWeapon?: WeaponType;
    getEliteWeaponAtIndex(index: number): string | undefined;
    getWeaponAtIndex(index: number): string | undefined;
}
interface GameObjectArt {
    elitePrimaryFireFlh?: any;
    primaryFireFlh?: any;
    eliteSecondaryFireFlh?: any;
    secondaryFireFlh?: any;
    getSpecialWeaponFlh(index: number): any;
}
interface DestroyContext {
    weapon?: {
        warhead: {
            rules: {
                temporal: boolean;
            };
        };
        rules: {
            suicide: boolean;
        };
    };
    obj?: GameObject;
}
interface Target {
    createTarget(obj: GameObject, tile: any): any;
}
export class ArmedTrait implements NotifyTick, NotifyDestroy {
    private gameObject: GameObject;
    private rules: GameObjectRules;
    private specialWeaponIndex: number = 0;
    private gattlingHeat = 0;
    private firingUntil = -1;
    private garrisonWeaponName?: string;
    private garrisonWeapons = new Map<any, Weapon>();
    private guardWeaponRangeOverride?: number;
    public primaryWeapon?: Weapon;
    public secondaryWeapon?: Weapon;
    public deathWeapon?: Weapon;
    constructor(gameObject: GameObject, rules: GameObjectRules) {
        this.gameObject = gameObject;
        this.rules = rules;
        this.specialWeaponIndex = 0;
        const isElite = gameObject.veteranLevel === VeteranLevel.Elite;
        if (gameObject.rules.weaponCount) {
            this.selectSpecialWeapon(0, isElite);
            this.guardWeaponRangeOverride = this.primaryWeapon?.range;
        }
        else {
            this.selectStandardWeapons(isElite);
        }
    }
    private selectStandardWeapons(isElite: boolean = false): void {
        const gameObject = this.gameObject;
        const primaryWeaponName = (isElite && gameObject.rules.elitePrimary) || gameObject.rules.primary;
        if (primaryWeaponName) {
            const fireFlh = isElite ? gameObject.art.elitePrimaryFireFlh : gameObject.art.primaryFireFlh;
            this.primaryWeapon = Weapon.factory(primaryWeaponName, WeaponType.Primary, gameObject as any, this.rules as any, fireFlh);
        }
        else {
            this.primaryWeapon = undefined;
        }
        const secondaryWeaponName = (isElite && gameObject.rules.eliteSecondary) || gameObject.rules.secondary;
        if (secondaryWeaponName) {
            const fireFlh = isElite ? gameObject.art.eliteSecondaryFireFlh : gameObject.art.secondaryFireFlh;
            this.secondaryWeapon = Weapon.factory(secondaryWeaponName, WeaponType.Secondary, gameObject as any, this.rules as any, fireFlh);
        }
        else {
            this.secondaryWeapon = undefined;
        }
        if (gameObject.explodes || gameObject.crashableTrait) {
            const deathWeaponName = gameObject.rules.deathWeapon ||
                (gameObject.crashableTrait && this.secondaryWeapon?.rules.name) ||
                this.primaryWeapon?.rules.name ||
                this.rules.combatDamage.deathWeapon;
            this.deathWeapon = Weapon.factory(deathWeaponName, WeaponType.DeathWeapon, gameObject as any, this.rules as any);
        }
    }
    private selectSpecialWeapon(index: number, isElite: boolean = false): void {
        const gameObject = this.gameObject;
        const weaponCount = gameObject.rules.weaponCount;
        if (!weaponCount || weaponCount < 1) {
            throw new Error(`Object "${gameObject.name}" doesn't support special weapons`);
        }
        if (weaponCount - 1 < index) {
            throw new RangeError(`Weapon index ${index} out of bounds (max ${weaponCount}) for object ${gameObject.name}`);
        }
        const weaponName = (isElite && gameObject.rules.getEliteWeaponAtIndex(index)) ||
            gameObject.rules.getWeaponAtIndex(index);
        if (!weaponName) {
            throw new Error(`Missing weapon at index ${index} for object "${gameObject.name}"`);
        }
        const fireFlh = gameObject.art.getSpecialWeaponFlh(index);
        this.primaryWeapon = Weapon.factory(weaponName, WeaponType.Primary, gameObject as any, this.rules as any, fireFlh);
        this.secondaryWeapon = undefined;
        if (gameObject.rules.isGattling) {
            const secondary = (isElite && gameObject.rules.getEliteWeaponAtIndex(index + 1)) || gameObject.rules.getWeaponAtIndex(index + 1);
            if (secondary) this.secondaryWeapon = Weapon.factory(secondary, WeaponType.Secondary, gameObject as any,
                this.rules as any, gameObject.art.getSpecialWeaponFlh(index + 1));
        }
        this.specialWeaponIndex = index;
        this.deathWeapon = (this.primaryWeapon.rules as any).suicide
            ? Weapon.factory(gameObject.rules.deathWeapon || this.primaryWeapon.name, WeaponType.DeathWeapon, gameObject as any, this.rules as any)
            : undefined;
    }
    public toggleEliteWeapons(isElite: boolean): void {
        if (this.gameObject.rules.weaponCount) {
            this.selectSpecialWeapon(this.specialWeaponIndex, isElite);
        }
        else {
            this.selectStandardWeapons(isElite);
        }
    }
    public getSpecialWeaponIndex(): number {
        return this.specialWeaponIndex;
    }
    public computeGuardScanRange(weapon?: Weapon): number {
        const maxWeaponRange = this.guardWeaponRangeOverride ??
            [this.primaryWeapon, this.secondaryWeapon]
                .filter(isNotNullOrUndefined)
                .filter(w => w === weapon || (w.rules as any).neverUse)
                .reduce((max, w) => Math.max(max, w.range), 0);
        const guardRange = Math.max(maxWeaponRange, this.gameObject.rules.guardRange);
        return Math.min(15, 2 * guardRange - 1);
    }
    public getDeployFireWeapon(): Weapon | undefined {
        if (this.gameObject.rules.deployFire) {
            const weapon = this.gameObject.rules.deployFireWeapon === WeaponType.Primary
                ? this.primaryWeapon
                : this.secondaryWeapon;
            // Retail Chaos Drone leaves the secondary scanner in the default
            // deploy slot. Its usable AreaFire weapon supplies the gas attack.
            if (this.gameObject.isVehicle() && weapon?.rules.neverUse) {
                return [this.primaryWeapon, this.secondaryWeapon]
                    .find(candidate => candidate?.rules.areaFire && !candidate.rules.neverUse);
            }
            return weapon;
        }
        return undefined;
    }
    public isEquippedWithWeapon(weapon: Weapon): boolean {
        return [this.primaryWeapon, this.secondaryWeapon].includes(weapon);
    }
    public getWeapons(): Weapon[] {
        return [this.primaryWeapon, this.secondaryWeapon].filter(isNotNullOrUndefined);
    }
    fireGarrisonWeapons(target: any, world: any): boolean {
        if (!this.garrisonWeapons.size) return false;
        const range = new RangeHelper(world.map.tileOccupation);
        for (const weapon of this.garrisonWeapons.values()) {
            if (!weapon.getCooldownTicks() && weapon.targeting.canTarget(target.obj, target.tile, world, false, false) &&
                range.isInWeaponRange(this.gameObject as any, target.obj ?? target.tile, weapon as any, world.rules)) weapon.fire(target, world);
        }
        return true;
    }
    private updateGarrisonWeapons(): void {
        const units = (this.gameObject as any).garrisonTrait?.units ?? [];
        for (const unit of this.garrisonWeapons.keys()) if (!units.includes(unit)) this.garrisonWeapons.delete(unit);
        for (const unit of units) {
            const name = unit.veteranLevel === VeteranLevel.Elite && unit.rules.eliteOccupyWeapon || unit.rules.occupyWeapon;
            if (!name) continue;
            const previous = this.garrisonWeapons.get(unit);
            if (previous?.name !== name) {
                const weapon = Weapon.factory(name, WeaponType.Primary, this.gameObject as any, this.rules as any, this.gameObject.art.primaryFireFlh);
                weapon.garrisonOccupant = unit;
                if (previous) weapon.inheritCooldown(previous);
                this.garrisonWeapons.set(unit, weapon);
            }
        }
        for (const weapon of this.garrisonWeapons.values()) weapon.tick();
    }
    onWeaponFire(weapon: Weapon, tick: number): void {
        if (this.gameObject.rules.isGattling) this.firingUntil = tick + Math.max(1, weapon.rof);
    }
    getGattlingStage(): number { return Math.floor(this.specialWeaponIndex / 2); }
    getHash(): number { return fnv32a([this.gattlingHeat, this.firingUntil, this.specialWeaponIndex, ...[...this.garrisonWeapons].flatMap(([u, w]) => [u.id, w.getCooldownTicks()])]); }
    [NotifyTick.onTick](_object?: any, world?: any): void {
        this.updateGarrisonWeapons();
        const occupant = (this.gameObject as any).garrisonTrait?.units[0];
        const occupyWeapon = occupant && ((occupant.veteranLevel === VeteranLevel.Elite && occupant.rules.eliteOccupyWeapon) || occupant.rules.occupyWeapon);
        if (occupyWeapon !== this.garrisonWeaponName) {
            const previous = this.primaryWeapon;
            if (occupyWeapon) {
                this.primaryWeapon = Weapon.factory(occupyWeapon, WeaponType.Primary, this.gameObject as any, this.rules as any, this.gameObject.art.primaryFireFlh);
                this.secondaryWeapon = this.primaryWeapon;
                if (previous) this.primaryWeapon.inheritCooldown(previous);
            } else if (this.garrisonWeaponName) {
                this.selectStandardWeapons();
            }
            this.garrisonWeaponName = occupyWeapon;
        }
        this.primaryWeapon?.tick();
        if (this.secondaryWeapon !== this.primaryWeapon) this.secondaryWeapon?.tick();
        const rules = this.gameObject.rules;
        if (rules.isGattling && world) {
            const elite = this.gameObject.veteranLevel === VeteranLevel.Elite;
            const stages = elite ? rules.eliteGattlingStages : rules.gattlingStages;
            if (!stages.length) return;
            const firing = world.currentTick <= this.firingUntil && !(this.gameObject as any).attackTrait?.isIdle();
            this.gattlingHeat = firing ? Math.min(stages.at(-1)!, this.gattlingHeat + rules.gattlingRateUp)
                : rules.gattlingRateDown ? Math.max(0, this.gattlingHeat - rules.gattlingRateDown) : 0;
            let stage = stages.findIndex(threshold => this.gattlingHeat < threshold);
            if (stage < 0) stage = stages.length - 1;
            if (stage * 2 !== this.specialWeaponIndex) {
                const primary = this.primaryWeapon, secondary = this.secondaryWeapon;
                this.selectSpecialWeapon(stage * 2, elite);
                if (primary) this.primaryWeapon?.inheritCooldown(primary);
                if (secondary) this.secondaryWeapon?.inheritCooldown(secondary);
            }
        }
    }
    [NotifyDestroy.onDestroy](gameObject: GameObject, target: Target, context?: DestroyContext): void {
        if (!this.deathWeapon)
            return;
        if (context?.weapon?.warhead.rules.temporal)
            return;
        if (gameObject.crashableTrait && !gameObject.isCrashing)
            return;
        if (context?.obj?.isVehicle() &&
            context.weapon?.rules.suicide &&
            context.obj.transportTrait?.units.find(unit => unit === gameObject))
            return;
        this.deathWeapon.fire(target.createTarget(gameObject, gameObject.tile), target as any);
    }
    public dispose(): void {
        this.gameObject = undefined!;
        this.primaryWeapon = undefined;
        this.secondaryWeapon = undefined;
        this.deathWeapon = undefined;
    }
}

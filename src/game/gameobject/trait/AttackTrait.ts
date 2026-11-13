import { isNotNullOrUndefined } from "@/util/typeGuard";
import { ArmorType } from "@/game/type/ArmorType";
import { ZoneType } from "@/game/gameobject/unit/ZoneType";
import { AttackTask } from "@/game/gameobject/task/AttackTask";
import { protectsNeutralStructure } from '../neutralStructureTargeting';
import { campaignChargedWeaponRange, canCampaignChargeTarget } from '../../campaign/CampaignChargedWeapon';
import { SideType } from "@/game/SideType";
import { NotifyTick } from "@/game/gameobject/trait/interface/NotifyTick";
import { RangeHelper } from "@/game/gameobject/unit/RangeHelper";
import { NotifyDamage } from "@/game/gameobject/trait/interface/NotifyDamage";
import { TaskRunner } from "@/game/gameobject/task/system/TaskRunner";
import { Target } from "@/game/Target";
import { MoveTask } from "@/game/gameobject/task/move/MoveTask";
import { CallbackTask } from "@/game/gameobject/task/system/CallbackTask";
import { MoveResult } from "@/game/gameobject/trait/MoveTrait";
import { MovementZone } from "@/game/type/MovementZone";
import { Coords } from "@/game/Coords";
import { NotifyTeleport } from "@/game/gameobject/trait/interface/NotifyTeleport";
import { VhpScan } from "@/game/type/VhpScan";
import { LosHelper } from "@/game/gameobject/unit/LosHelper";
import { Vector2 } from "@/game/math/Vector2";
import { Box2 } from "@/game/math/Box2";
export enum AttackState {
    Idle = 0,
    CheckRange = 1,
    PrepareToFire = 2,
    FireUp = 3,
    Firing = 4,
    JustFired = 5
}
export class AttackTrait implements NotifyTick, NotifyDamage, NotifyTeleport {
    private disabled: boolean = false;
    private attackState: AttackState = AttackState.Idle;
    private passiveScanCooldownTicks: number = 0;
    private taskRunner: TaskRunner = new TaskRunner();
    private distributedFireHistory: Map<any, number> = new Map();
    private rangeHelper: RangeHelper;
    private losHelper: LosHelper;
    private opportunityFireTask?: any;
    private retaliateTarget?: any;
    private currentTarget?: any;
    constructor(e: any, t: any) {
        this.rangeHelper = new RangeHelper(t);
        this.losHelper = new LosHelper(e, t);
    }
    isIdle(): boolean {
        return this.attackState === AttackState.Idle;
    }
    isDisabled(): boolean {
        return this.disabled;
    }
    setDisabled(e: boolean): void {
        this.disabled = e;
    }
    isOnCooldown(e: any): boolean {
        let t = [e.primaryWeapon, e.secondaryWeapon];
        const i = e.armedTrait?.getDeployFireWeapon();
        if (i?.rules.areaFire && !i.rules.fireOnce) {
            t = t.filter((e) => e !== i);
        }
        return t.some((e) => (e?.getCooldownTicks() ?? 0) > 0);
    }
    expirePassiveScanCooldown(): void {
        this.passiveScanCooldownTicks = 0;
    }
    increasePassiveScanCooldown(e: number): void {
        this.passiveScanCooldownTicks += e;
    }
    cancelOpportunityFire(): void {
        this.opportunityFireTask?.cancel();
    }
    selectDefaultWeapon(e: any): any {
        let i;
        if ((e.isInfantry() || e.isVehicle()) && e.rules.deployFire) {
            const t = e.armedTrait?.getDeployFireWeapon();
            i = e.isVehicle() && t?.rules.areaFire ? t : e.deployerTrait?.isDeployed()
                ? t && !t.rules.areaFire
                    ? t
                    : undefined
                : [e.primaryWeapon, e.secondaryWeapon].find((e) => e !== t);
        }
        else {
            i =
                e.isBuilding() && e.garrisonTrait
                    ? e.garrisonTrait.isOccupied()
                        ? e.owner.country.side === SideType.GDI
                            ? e.primaryWeapon
                            : (e.secondaryWeapon ?? e.primaryWeapon)
                        : undefined
                    : e.isBuilding() && e.overpoweredTrait
                        ? e.overpoweredTrait.getWeapon()
                        : e.primaryWeapon;
        }
        return i;
    }
    selectWeaponVersus(e: any, t: any, i: any, r: boolean = false, s: boolean = false): any {
        const a = t.tile;
        const n = t instanceof Target ? t.obj : t;
        const o = this.getAvailableWeapons(e, s, n?.isOverlay() || (r && !n));
        return this.selectWeaponFromList(e, n, a, o, i, r, s, false);
    }
    selectWeaponFromList(e: any, t: any, i: any, r: any[], s: any, a: boolean, n: boolean, o: boolean): any {
        if (t?.isBuilding() && t.rules.drainable && !s.areFriendly(e, t)) {
            r = [...r.filter(w => w.rules.drainWeapon), ...r.filter(w => !w.rules.drainWeapon)];
        }
        if (t?.isBuilding() && !s.areFriendly(e, t)) r = [...r.filter(w => w.warhead.rules.airstrike), ...r.filter(w => !w.warhead.rules.airstrike)];
        if ((!t?.isInfantry() && !t?.isVehicle()) ||
            !t.disguiseTrait ||
            this.canAttackThroughDisguise(e, t, t.disguiseTrait, s, a, n, o)) {
            if (t?.isBuilding() &&
                t.overpoweredTrait &&
                (t.owner === e.owner || canCampaignChargeTarget(e, t, s)) &&
                r.find((e: any) => e.warhead.rules.electricAssault)) {
                r = r.filter((e: any) => e.warhead.rules.electricAssault);
            }
            if (!(n &&
                t?.isAircraft() &&
                t.missileSpawnTrait &&
                t.zone !== ZoneType.Air)) {
                const l = t?.isTechno() ? t.rules.armor : undefined;
                for (const c of r) {
                    if (c.targeting.canTarget(t, i, s, a, n) &&
                        (l === undefined || this.checkArmor(c.warhead.rules, l, n))) {
                        return c;
                    }
                }
            }
        }
    }
    getAvailableWeapons(e: any, t: boolean, i: boolean): any[] {
        let r;
        let s;
        if ((e.isInfantry() || e.isVehicle()) &&
            e.rules.deployFire &&
            e.armedTrait) {
            s = e.armedTrait.getDeployFireWeapon();
            r = e.isVehicle() && s?.rules.areaFire ? [s] : [
                e.deployerTrait?.isDeployed()
                    ? s.rules.areaFire
                        ? undefined
                        : s
                    : s === e.secondaryWeapon
                        ? e.primaryWeapon
                        : e.secondaryWeapon,
            ];
        }
        else if (e.isBuilding() && e.garrisonTrait) {
            r = e.garrisonTrait.isOccupied()
                ? [
                    e.owner.country.side === SideType.GDI
                        ? e.primaryWeapon
                        : (e.secondaryWeapon ?? e.primaryWeapon),
                ]
                : [];
        }
        else if (e.isBuilding() && e.overpoweredTrait) {
            r = [e.overpoweredTrait.getWeapon()];
        }
        else if (i || t) {
            r = [
                e.primaryWeapon,
                !i && t && e.secondaryWeapon
                    ? e.secondaryWeapon
                    : undefined,
            ];
        }
        else {
            r = [e.primaryWeapon, e.secondaryWeapon];
        }
        return r.filter((e) => e && !e.rules.neverUse);
    }
    canAttackThroughDisguise(e: any, t: any, i: any, r: any, s: boolean, a: boolean, n: boolean): boolean {
        if (!s &&
            i.hasTerrainDisguise() &&
            !r.areFriendly(e, t) &&
            !e.owner.sharedDetectDisguiseTrait?.has(t)) {
            return false;
        }
        if (a) {
            if (n &&
                t.moveTrait.isIdle() &&
                !e.rules.detectDisguise &&
                !e.owner.sharedDetectDisguiseTrait?.has(t) &&
                !r.areFriendly(t, e)) {
                return false;
            }
            const o = i.getDisguise();
            if (o?.owner &&
                !e.rules.detectDisguise &&
                !e.owner.sharedDetectDisguiseTrait?.has(t) &&
                (o.owner === e.owner ||
                    r.alliances.areAllied(e.owner, o.owner))) {
                return false;
            }
        }
        return true;
    }
    checkArmor(e: any, t: ArmorType, i: boolean): boolean {
        const r = e.ivanBomb || e.bombDisarm || e.nukeMaker
            ? 1
            : e.verses.get(t);
        if (r === undefined) {
            console.warn(`Unhandled ArmorType ${ArmorType[t]} in warhead ${e.name} verses`);
            return false;
        }
        return !(100 * r <= (i ? 1 : 0));
    }
    createAttackTask(e: any, t: any, i: any, r: any, s: any): AttackTask {
        return new AttackTask(e, e.createTarget(t, i), r, s);
    }
    [NotifyTick.onTick](a: any, n: any): void {
        if (a.campaignSleeping) return;
        const chargedWeapon = a.campaignMapWeaponRange ? this.selectDefaultWeapon(a) : undefined;
        const mapRange = campaignChargedWeaponRange(a, chargedWeapon);
        if (mapRange && !this.isDisabled() && !a.unitOrderTrait.hasTasks()) {
            // The requested energized-tower effect is a map-wide electric
            // salvo. Every victim receives an actual original projectile;
            // weapon damage, ROF, diplomacy and source victory events remain.
            if (!this.isOnCooldown(a) && a.ammo !== 0) {
                const targets = this.scanTechnosAround(a, mapRange, n).filter(target => n.isValidTarget(target)
                    && !target.owner.isNeutral && !protectsNeutralStructure(n, target) && !n.areFriendly(a, target)
                    && !(a.owner.campaignController && n.areFriendly({ owner: a.owner.campaignController }, target))
                    && (target.isUnit() || target.garrisonTrait?.isOccupied())
                    && !!this.selectWeaponFromList(a, target, target.tile, [chargedWeapon], n, false, true, true)
                    && this.rangeHelper.isInWeaponRange(a, target, chargedWeapon, n.rules))
                    .sort((left, right) => left.id - right.id);
                for (const target of targets) chargedWeapon.fire(n.createTarget(target, target.tile), n);
            }
            return;
        }
        if (!this.isDisabled()) {
            if (this.opportunityFireTask &&
                (!a.unitOrderTrait.hasTasks() ||
                    (a.isUnit() &&
                        !a.unitOrderTrait.getTasks()[0]
                            .preventOpportunityFire) ||
                    (a.unitOrderTrait.getTasks()[0] instanceof AttackTask
                        ? (this.opportunityFireTask = undefined)
                        : this.opportunityFireTask.cancel()),
                    this.opportunityFireTask)) {
                const h = [this.opportunityFireTask];
                this.taskRunner.tick(h, a);
                if (!h.length) {
                    this.opportunityFireTask = undefined;
                }
            }
            if (!this.opportunityFireTask && this.retaliateTarget) {
                const o = this.retaliateTarget;
                this.retaliateTarget = undefined;
                let e;
                if (!a.drainTrait?.isEngaged() && !a.unitOrderTrait.hasTasks() && n.isValidTarget(o)) {
                    e = this.selectWeaponVersus(a, o, n, false);
                    if (e) {
                        a.unitOrderTrait.addTask(this.createAttackTask(n, o, o.tile, e, {
                            holdGround: a.rules.movementZone === MovementZone.Fly || !!a.campaignSticky
                                && (n.campaign?.launch.semanticsVersion ?? 1) >= 15
                                && n.rules.getIni().getSection('Sticky')?.getBool('Paralyzed', false),
                        }));
                    }
                }
            }
            if (!this.opportunityFireTask && this.shouldPassiveAcquire(a, n)) {
                if (this.passiveScanCooldownTicks > 0) {
                    this.passiveScanCooldownTicks--;
                }
                else {
                    this.passiveScanCooldownTicks = a.guardMode
                        ? n.rules.general.guardAreaTargetingDelay
                        : n.rules.general.normalTargetingDelay;
                    let e = this.selectDefaultWeapon(a);
                    const h = a.unitOrderTrait.hasTasks();
                    let t = undefined;
                    let i;
                    let r;
                    if (!h && a.guardMode && e && a.owner.isCombatant()) {
                        t = a.armedTrait?.computeGuardScanRange(e);
                        i = a.guardArea?.tile;
                        r = 50;
                    }
                    let s = false;
                    if (e) {
                        const o = this.scanForTarget(a, e, n, t, i);
                        if (o.target) {
                            const { target: l, weapon: c } = o;
                            const task = this.createAttackTask(n, l, l.tile, c, {
                                holdGround: h || !a.guardMode,
                                disallowTurning: h,
                                leashTiles: r,
                                passive: true,
                            });
                            if (h) {
                                this.opportunityFireTask = task;
                            }
                            else {
                                a.unitOrderTrait.addTask(task);
                            }
                            s = true;
                            if (!h && a.guardMode && !a.guardArea) {
                                a.guardArea = {
                                    tile: a.tile,
                                    onBridge: !!a.isUnit() && a.onBridge,
                                };
                            }
                            if (s && !h) {
                                a.unitOrderTrait[NotifyTick.onTick](a, n);
                            }
                        }
                    }
                    if (!s && !h && a.secondaryWeapon?.warhead.rules.electricAssault) {
                        e = a.secondaryWeapon;
                        const c = this.scanForTarget(a, e, n, undefined, undefined, true);
                        if (c.target) {
                            const { target: l, weapon: c2 } = c;
                            const task = this.createAttackTask(n, l, l.tile, c2, {
                                passive: true,
                            });
                            a.unitOrderTrait.addTask(task);
                            s = true;
                        }
                    }
                    if (!s && !h && a.guardArea && a.isUnit() && a.moveTrait && !a.moveTrait.isDisabled() && a.guardArea.tile !== a.tile) {
                        a.unitOrderTrait.addTasks(new MoveTask(n, a.guardArea.tile, a.guardArea.onBridge), new CallbackTask(() => {
                            if (![
                                MoveResult.Success,
                                MoveResult.CloseEnough,
                            ].includes(a.moveTrait.lastMoveResult)) {
                                a.resetGuardModeToIdle();
                            }
                            a.guardArea = undefined;
                        }));
                    }
                }
            }
        }
    }
    [NotifyDamage.onDamage](e: any, t: any, i: number, r: any): void {
        if (!this.isDisabled() && !this.retaliateTarget && !this.opportunityFireTask && r && r.obj && r.weapon) {
            if (this.shouldRetaliate(e, t, i, r.obj, r.weapon.warhead)) {
                this.retaliateTarget = r.obj;
            }
        }
    }
    [NotifyTeleport.onBeforeTeleport](e: any, t: any, i: any, r: boolean): void {
        if (!r) {
            this.attackState = AttackState.Idle;
            this.currentTarget = undefined;
            this.retaliateTarget = undefined;
            this.opportunityFireTask = undefined;
        }
    }
    shouldPassiveAcquire(e: any, game: any): boolean {
        if (e.campaignHarmless && game.rules.getIni().getSection('Harmless')?.getBool('NoThreat', false)) return false;
        if ((!e.owner.isCombatant() && e.rules.needsEngineer) ||
            !e.rules.canPassiveAquire ||
            !e.primaryWeapon ||
            (e.ammoTrait && !e.ammoTrait.ammo && e.rules.manualReload)) {
            return false;
        }
        // Protect a FireOnce drain from projectile launch through continuous channeling.
        if (e.drainTrait?.isEngaged() || e.mindControllerTrait?.isAtCapacity()) {
            return false;
        }
        const t = e.rules.opportunityFire ||
            (e.rules.balloonHover &&
                e.unitOrderTrait.getCurrentTask()?.isAttackMove);
        if (e.isUnit() && t) {
            if (e.unitOrderTrait.hasTasks() &&
                e.unitOrderTrait.getTasks()[0].preventOpportunityFire) {
                return false;
            }
        }
        else if (e.unitOrderTrait.hasTasks()) {
            return false;
        }
        return true;
    }
    shouldRetaliate(e: any, t: any, i: number, r: any, s: any): boolean {
        if (e.campaignHarmless && t.rules.getIni().getSection('Harmless')?.getBool('Retaliate', true) === false) return false;
        if (i < 1 ||
            t.areFriendly(e, r) ||
            !e.rules.canRetaliate ||
            !e.primaryWeapon ||
            (e.ammoTrait && !e.ammoTrait.ammo && e.rules.manualReload) ||
            s.rules.temporal ||
            r.rules.missileSpawn ||
            e.unitOrderTrait.hasTasks() ||
            !t.isValidTarget(r) ||
            ((r.isInfantry() || r.isVehicle()) &&
                r.disguiseTrait &&
                !e.rules.detectDisguise) ||
            e.drainTrait?.isEngaged() ||
            e.mindControllerTrait?.isAtCapacity()) {
            return false;
        }
        const a = this.selectWeaponVersus(e, r, t, false);
        if (!a) {
            return false;
        }
        const distance = e.isBuilding() || r.isBuilding()
            ? this.rangeHelper.tileDistance(e, r)
            : this.rangeHelper.distance2(e, r) / Coords.LEPTONS_PER_TILE;
        const sourceRange = (t.gameOpts?.campaign ?? t.gameOpts)?.retaliationVersion === 1
            ? Math.min(15, Math.max(r.primaryWeapon?.range ?? 0, r.secondaryWeapon?.range ?? 0)) : 0;
        return !(distance > Math.max(a.range, e.sight, sourceRange));
    }
    scanForTarget(e: any, t: any, i: any, r?: number, s?: any, a: boolean = false): {
        target?: any;
        weapon?: any;
    } {
        let n: {
            target?: any;
            weapon?: any;
        } = {};
        let o = Number.NEGATIVE_INFINITY;
        let bestFriendly = false;
        const berserk = e.berserkTrait?.isActive() ?? false;
        const l = this.getAvailableWeapons(e, true, false);
        const chargedMapRange = campaignChargedWeaponRange(e, t);
        const c = chargedMapRange ?? r ??
            (e.rules.guardRange || t.range) +
                1 +
                3 +
                i.rules.elevationModel.bonusCap +
                (t.projectileRules.isAntiAir ? e.rules.airRangeBonus : 0);
        for (const d of this.scanTechnosAround(e, c, i)) {
            if (chargedMapRange && (i.areFriendly(e, d)
                || e.owner.campaignController && i.areFriendly({ owner: e.owner.campaignController }, d))) continue;
            const u = this.selectWeaponFromList(e, d, d.tile, l, i, false, true, true);
            if (u &&
                (chargedMapRange ? !d.owner.isNeutral && !protectsNeutralStructure(i, d) : this.canPassiveAcquire(d, i)) &&
                i.isValidTarget(d) &&
                (r && chargedMapRange === undefined
                    ? this.rangeHelper.isInRange(e, d, u.minRange, r, u.rules.cellRangefinding) &&
                        (!s || this.rangeHelper.isInRange2(s, d, 0, r))
                    : this.rangeHelper.isInWeaponRange(e, d, u, i.rules)) &&
                (a || chargedMapRange !== undefined || this.losHelper.hasLineOfSight(e, d, u))) {
                let h = this.rangeHelper.distance3(e, d) /
                    Coords.LEPTONS_PER_TILE;
                h = this.computeThreat(d, e, u, h, i.rules.general.threat);
                if (chargedMapRange && d.isUnit()) h += 1e9;
                const friendly = berserk && (e.owner === d.owner || i.alliances.areAllied(e.owner, d.owner));
                if ((!n.target || friendly && !bestFriendly) || (friendly === bestFriendly && h > o)) {
                    n = { target: d, weapon: u } as any;
                    o = h;
                    bestFriendly = friendly;
                }
            }
        }
        if (n.target && e.rules.distributedFire) {
            this.updateDistributedFireHistory(n as any);
        }
        return n;
    }
    scanTechnosAround(e: any, t: number, i: any): any[] {
        const r = e.getFoundation();
        const s = new Vector2(e.tile.rx, e.tile.ry);
        const a = new Vector2(e.tile.rx + r.width - 1, e.tile.ry + r.height - 1);
        s.addScalar(-t);
        a.addScalar(t);
        const box = new Box2(s, a);
        return i.map.technosByTile.queryRange(box);
    }
    canPassiveAcquire(e: any, t: any): boolean {
        if (protectsNeutralStructure(t, e)) return false;
        const version = (t.gameOpts?.campaign ?? t.gameOpts)?.civilianTargetingVersion;
        const launch = t.gameOpts?.campaign;
        const armedGarrison = launch?.edition === 'yr' && launch.semanticsVersion >= 46
            && e.isBuilding() && e.garrisonTrait?.isOccupied() && !!(e.primaryWeapon || e.secondaryWeapon);
        const hostileCivilian = e.rules.civilian && !!version &&
            (!!e.mindControllableTrait?.getController() || !e.isBuilding() &&
                (version === 2 || !!(e.primaryWeapon || e.secondaryWeapon)));
        return (!e.owner.isNeutral &&
            (!e.rules.civilian || hostileCivilian || armedGarrison) &&
            (!e.rules.insignificant || version === 2 && hostileCivilian || armedGarrison) &&
            (hostileCivilian || armedGarrison || e.rules.threatPosed > 1 ||
                (e.rules.specialThreatValue > 0 && !e.isBuilding()) ||
                e.rules.harvester ||
                e.name === t.rules.general.paradrop.paradropPlane));
    }
    computeThreat(e: any, t: any, i: any, r: number, s: any): number {
        let n = [e.primaryWeapon, e.secondaryWeapon]
            .filter(isNotNullOrUndefined)
            .map((e) => e.warhead.rules.verses.get(t.rules.armor) ?? 0)
            .reduce((e, t) => Math.max(e, t), 0) *
            s.targetEffectivenessCoefficientDefault;
        if (e.attackTrait?.currentTarget?.obj === t) {
            n *= -1;
        }
        n +=
            e.rules.specialThreatValue *
                s.targetSpecialThreatCoefficientDefault;
        n +=
            (i.warhead.rules.verses.get(e.rules.armor) ?? 0) *
                s.myEffectivenessCoefficientDefault;
        n +=
            (e.healthTrait.health / 100) *
                s.targetStrengthCoefficientDefault;
        n += r * s.targetDistanceCoefficientDefault;
        n += 1e5;
        if (t.rules.vhpScan !== VhpScan.None) {
            const a = e.healthTrait.getProjectedHitPoints();
            if (t.rules.vhpScan === VhpScan.Strong) {
                if (a <= 0) {
                    n = Number.NEGATIVE_INFINITY;
                }
            }
            else if (t.rules.vhpScan === VhpScan.Normal) {
                if (a <= 0) {
                    n /= 2;
                }
                else if (a <= e.healthTrait.maxHitPoints / 2) {
                    n *= 2;
                }
            }
        }
        if (t.rules.distributedFire) {
            n -= 1e6 * (this.distributedFireHistory.get(e) ?? 0);
        }
        return n;
    }
    updateDistributedFireHistory(e: {
        target: any;
        weapon: any;
    }): void {
        if (this.distributedFireHistory.get(e.target) !== 50) {
            for (const [t, i] of this.distributedFireHistory) {
                const newValue = i - 1;
                if (newValue <= 0) {
                    this.distributedFireHistory.delete(t);
                }
                else {
                    this.distributedFireHistory.set(t, newValue);
                }
            }
            this.distributedFireHistory.set(e.target, 50);
        }
    }
    dispose(): void {
        this.distributedFireHistory.clear();
    }
}

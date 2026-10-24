import { CompositeDisposable } from '@/util/disposable/CompositeDisposable';
import { EventType } from '@/game/event/EventType';
import { SoundKey } from '@/engine/sound/SoundKey';
import { ChannelType } from '@/engine/sound/ChannelType';
import { Coords } from '@/game/Coords';
import { PowerupType } from '@/game/type/PowerupType';
import { SuperWeaponType } from '@/game/type/SuperWeaponType';
import { RadarEventType } from '@/game/rules/general/RadarRules';
import { aiUiNames } from '@/game/gameopts/constants';
import { OrderFeedbackType } from '@/game/order/OrderFeedbackType';

const detectedSuperWeaponEvaByType = new Map([
    [SuperWeaponType.MultiMissile, 'EVA_NuclearSiloDetected'],
    [SuperWeaponType.IronCurtain, 'EVA_IronCurtainDetected'],
    [SuperWeaponType.ChronoSphere, 'EVA_ChronosphereDetected'],
    [SuperWeaponType.LightningStorm, 'EVA_WeatherDeviceReady'],
]);

const superWeaponReadyEvaByType = new Map([
    [SuperWeaponType.MultiMissile, 'EVA_NuclearMissileReady'],
    [SuperWeaponType.IronCurtain, 'EVA_IronCurtainReady'],
    [SuperWeaponType.ChronoSphere, 'EVA_ChronosphereReady'],
    [SuperWeaponType.LightningStorm, 'EVA_LightningStormReady'],
    [SuperWeaponType.ParaDrop, 'EVA_ReinforcementsReady'],
    [SuperWeaponType.AmerParaDrop, 'EVA_ReinforcementsReady'],
]);

const superWeaponActivateEvaByType = new Map([
    [SuperWeaponType.MultiMissile, 'EVA_NuclearMissileLaunched'],
    [SuperWeaponType.IronCurtain, 'EVA_IronCurtainActivated'],
    [SuperWeaponType.ChronoSphere, 'EVA_ChronosphereActivated'],
    [SuperWeaponType.LightningStorm, 'EVA_LightningStormCreated'],
]);

const superWeaponActivateSoundByType = new Map([
    [SuperWeaponType.MultiMissile, SoundKey.DigSound],
]);

const superWeaponActivateMessageByType = new Map([
    [SuperWeaponType.LightningStorm, 'TXT_LIGHTNING_STORM_APPROACHING'],
]);

const crateSoundByType = new Map([
    [PowerupType.Veteran, SoundKey.CratePromoteSound],
    [PowerupType.Money, SoundKey.CrateMoneySound],
    [PowerupType.Reveal, SoundKey.CrateRevealSound],
    [PowerupType.Firepower, SoundKey.CrateFireSound],
    [PowerupType.Armor, SoundKey.CrateArmourSound],
    [PowerupType.Speed, SoundKey.CrateSpeedSound],
    [PowerupType.Unit, SoundKey.CrateUnitSound],
]);

const crateEvaByType = new Map([
    [PowerupType.Armor, 'EVA_UnitArmorUpgraded'],
    [PowerupType.Firepower, 'EVA_UnitFirePowerUpgraded'],
    [PowerupType.Speed, 'EVA_UnitSpeedUpgraded'],
]);

export class SoundHandler {
    // Loop reports belong to the shooter and expire unless actual shots refresh them.
    private weaponLoops = new Map<any, { key: string; handle: any; owner: any; untilTick: number }>();
    private lastAvailableObjectNames: string[] = [];
    private lastQueueStatuses = new Map();
    private triggerSoundHandles = new Map();
    private disposables = new CompositeDisposable();
    private lastFeedbackTime?: number;
    constructor(private game: any, private worldSound: any, private eva: any, private sound: any, private gameEvents: any, private messageList: any, private strings: any, private player: any, private renderer?: any) { }
    init(): void {
        this.disposables.add(this.gameEvents.subscribe((event: any) => this.handleGameEvent(event)));
        if (this.renderer) {
            this.renderer.onFrame.subscribe(this.updateWeaponLoops);
            this.disposables.add(() => this.renderer.onFrame.unsubscribe(this.updateWeaponLoops));
        }
    }
    dispose(): void {
        for (const loop of this.weaponLoops.values()) loop.handle.stop();
        this.weaponLoops.clear();
        this.disposables.dispose();
    }
    private updateWeaponLoops = (): void => {
        for (const [object, loop] of this.weaponLoops) {
            if (object.isDestroyed || !object.isSpawned || object.owner !== loop.owner
                || object.attackTrait?.isIdle() || object.attackTrait?.isDisabled()
                || this.game.currentTick > loop.untilTick || !loop.handle.isPlaying()) {
                loop.handle.stop();
                this.weaponLoops.delete(object);
            }
        }
    };
    private handleGameEvent(event: any): void {
        switch (event.type) {
            case EventType.TriggerSoundFx:
                if (event.tile) this.worldSound.playEffect(event.soundId,
                    Coords.tile3dToWorld(event.tile.rx + .5, event.tile.ry + .5, event.tile.z), this.player);
                else this.sound.play(event.soundId, ChannelType.Effect);
                break;
            case EventType.Cheer:
                this.sound.play(SoundKey.CheerSound, ChannelType.Effect);
                break;
            case EventType.UnitDeployUndeploy:
                const isUndeploy = event.deployType === 'undeploy';
                const unit = event.unit;
                const deploySound = isUndeploy ? unit.rules.undeploySound : unit.rules.deploySound;
                if (deploySound) {
                    this.worldSound.playEffect(deploySound, unit, unit.owner);
                }
                break;
            case EventType.WeaponFire:
                this.handleWeaponFireSound(event);
                break;
            case EventType.InflictDamage:
                this.handleDamageSound(event);
                break;
            case EventType.RadarEvent:
                this.handleRadarEventSound(event);
                break;
            case EventType.SuperWeaponReady:
                this.handleSuperWeaponReadySound(event);
                break;
            case EventType.SuperWeaponActivate:
                this.handleSuperWeaponActivateSound(event);
                break;
            case EventType.LightningStormManifest:
                this.handleLightningStormManifestSound(event);
                break;
            case EventType.WarheadDetonate:
                this.handleWarheadDetonateSound(event);
                break;
            case EventType.ObjectDestroy:
                this.handleObjectDestroySound(event);
                break;
            case EventType.FactoryProduceUnit:
                this.handleFactoryProduceUnitSound(event);
                break;
            case EventType.ObjectMorph:
                this.handleObjectMorphSound(event);
                break;
            case EventType.ObjectSpawn:
                this.handleObjectSpawnSound(event);
                break;
            case EventType.BuildingPlace:
                this.handleBuildingPlaceSound(event);
                break;
            case EventType.PlayerDefeated:
                this.handlePlayerDefeatedSound(event);
                break;
            case EventType.UnitPromote:
                this.handleUnitPromoteSound(event);
                break;
            case EventType.CratePickup:
                this.handleCratePickupSound(event);
                break;
            default:
                break;
        }
    }
    private handleWeaponFireSound(event: any): void {
        const weapon = event.weapon;
        const gameObject = event.gameObject;
        if (weapon.rules.report?.length) {
            const volume = weapon.warhead.rules.electricAssault ? 0.25 : 1;
            const soundIndex = Math.floor(Math.random() * weapon.rules.report.length);
            const key = weapon.rules.report[soundIndex];
            if (this.worldSound.isLoopingEffect(key)) {
                const previous = this.weaponLoops.get(gameObject);
                const untilTick = this.game.currentTick + Math.max(1, weapon.rof) + 1;
                if (previous?.key === key && previous.handle.isPlaying() && previous.owner === gameObject.owner) {
                    previous.untilTick = untilTick;
                    return;
                }
                previous?.handle.stop();
                this.weaponLoops.delete(gameObject);
                const handle = this.worldSound.playEffect(key, gameObject, gameObject.owner, volume);
                if (handle) this.weaponLoops.set(gameObject, { key, handle, owner: gameObject.owner, untilTick });
            } else {
                const previous = this.weaponLoops.get(gameObject);
                previous?.handle.stop();
                this.weaponLoops.delete(gameObject);
                this.worldSound.playEffect(key, gameObject.position.worldPosition, gameObject.owner, volume);
            }
        }
    }
    private handleDamageSound(event: any): void {
        if (event.target.isBuilding() && !event.target.wallTrait) {
            const damagePercent = (event.damageHitPoints / event.target.healthTrait.maxHitPoints) * 100;
            const rules = this.game.rules.audioVisual;
            const redThreshold = 100 * rules.conditionRed;
            const yellowThreshold = 100 * rules.conditionYellow;
            const health = event.target.healthTrait.health;
            if ((health <= yellowThreshold && yellowThreshold < health + damagePercent) ||
                (health <= redThreshold && redThreshold < health + damagePercent)) {
                this.worldSound.playEffect(SoundKey.BuildingDamageSound, event.target, event.target.owner);
            }
        }
    }
    private handleRadarEventSound(event: any): void {
        if (event.radarEventType === RadarEventType.BaseUnderAttack || event.radarEventType === 'BaseUnderAttack') {
            if (event.target === this.player) {
                this.eva.play('EVA_OurBaseIsUnderAttack');
                this.sound.play(SoundKey.BaseUnderAttackSound, ChannelType.Effect);
            }
            else if (this.player && this.game.alliances.areAllied(this.player, event.target)) {
                this.eva.play('EVA_OurAllyIsUnderAttack');
                this.sound.play(SoundKey.BaseUnderAttackSound, ChannelType.Effect);
            }
        }
        else if (event.radarEventType === RadarEventType.HarvesterUnderAttack || event.radarEventType === 'HarvesterUnderAttack') {
            if (event.target === this.player) {
                this.eva.play('EVA_OreMinerUnderAttack');
            }
        }
        else if ((event.radarEventType === RadarEventType.EnemyObjectSensed || event.radarEventType === 'EnemyObjectSensed') && event.target === this.player) {
            const building = this.game.map.getGroundObjectsOnTile(event.tile).find((object: any) => object.isBuilding() && object.superWeaponTrait);
            const superWeaponType = building?.superWeaponTrait?.getSuperWeapon(building)?.rules.type;
            const eva = detectedSuperWeaponEvaByType.get(superWeaponType);
            if (eva) {
                this.eva.play(eva);
            }
        }
    }
    private handleSuperWeaponReadySound(event: any): void {
        if (event.target.owner === this.player) {
            const eva = event.target.rules?.type !== undefined
                ? superWeaponReadyEvaByType.get(event.target.rules.type)
                : undefined;
            if (eva) {
                this.eva.play(eva);
            }
        }
    }
    private handleSuperWeaponActivateSound(event: any): void {
        if (!event.noSfxWarning) {
            const eva = superWeaponActivateEvaByType.get(event.target);
            if (eva) {
                this.eva.play(eva, true);
            }
            const sound = superWeaponActivateSoundByType.get(event.target);
            if (sound) {
                this.worldSound.playEffect(sound, Coords.tile3dToWorld(event.atTile.rx, event.atTile.ry, event.atTile.z), event.owner);
            }
        }
        const message = superWeaponActivateMessageByType.get(event.target);
        if (message) {
            this.messageList.addSystemMessage(this.strings.get(message), this.player ?? 'grey');
        }
    }
    private handleLightningStormManifestSound(event: any): void {
        this.messageList.addSystemMessage(this.strings.get('TXT_LIGHTNING_STORM'), this.player ?? 'grey');
        this.worldSound.playEffect(SoundKey.StormSound, Coords.tile3dToWorld(event.target.rx, event.target.ry, event.target.z));
    }
    private handleWarheadDetonateSound(event: any): void {
        if (event.isLightningStrike) {
            this.worldSound.playEffect(SoundKey.LightningSounds, event.position);
        }
    }
    private handleObjectDestroySound(event: any): void {
        const target = event.target;
        let sound: string | undefined;
        if (target.isTechno()) {
            sound = target.rules.dieSound;
            if (!sound && target.isBuilding()) {
                sound = SoundKey.BuildingDieSound as any;
            }
        }
        if (sound) {
            this.worldSound.playEffect(sound, target.position.worldPosition, target.owner);
        }
        if (target.isUnit() && !target.rules.spawned && target.owner === this.player) {
            this.eva.play('EVA_UnitLost');
        }
    }
    private handleObjectSpawnSound(event: any): void {
        const gameObject = event.gameObject;
        if (gameObject.isTechno() && gameObject.rules.createSound) {
            this.worldSound.playEffect(gameObject.rules.createSound, gameObject, gameObject.owner);
        }
    }
    private handleFactoryProduceUnitSound(event: any): void {
        const unit = event.target;
        if (event.factory?.rules.createUnitSound) {
            this.worldSound.playEffect(event.factory.rules.createUnitSound, event.factory, unit.owner);
        }
        // Dedicated creation sounds already play through ObjectSpawn. Use the
        // unit's original acknowledgement only for our actual factory deliveries.
        if (unit.owner === this.player && !unit.rules.createSound && unit.rules.voiceSelect) {
            this.sound.play(unit.rules.voiceSelect, ChannelType.Effect);
        }
    }
    private handleObjectMorphSound(event: any): void {
        const { from, to } = event;
        if (from.isVehicle() && to.isBuilding()) {
            this.worldSound.playEffect(from.rules.deploySound || SoundKey.BuildingSlam, to, to.owner);
        }
        else if (from.isBuilding() && to.isVehicle() && (from.rules.undeploySound || from.rules.deploySound)) {
            this.worldSound.playEffect(from.rules.undeploySound || from.rules.deploySound, to, to.owner);
        }
    }
    private handleBuildingPlaceSound(event: any): void {
        const building = event.target;
        this.worldSound.playEffect(SoundKey.BuildingSlam, building, building.owner);
    }
    private handlePlayerDefeatedSound(event: any): void {
        const player = event.target;
        if (player === this.player && !this.player.isObserver) {
            return;
        }
        const playerName = player.isAi
            ? `${this.strings.get(aiUiNames.get(player.aiDifficulty) || 'GUI:AIDummy')} (${this.game.getPlayerNumber(player) + 1})`
            : player.name;
        this.eva.play(player !== this.player ? 'EVA_PlayerDefeated' : 'EVA_YouHaveLost', true);
        this.messageList.addSystemMessage(this.strings.get('TXT_PLAYER_DEFEATED', playerName), player);
    }
    private handleUnitPromoteSound(event: any): void {
        if (event.target.owner === this.player) {
            const isElite = event.target.veteranLevel === 'Elite';
            this.sound.play(isElite ? SoundKey.UpgradeEliteSound : SoundKey.UpgradeVeteranSound, ChannelType.Effect);
            this.eva.play('EVA_UnitPromoted', true);
        }
    }
    private handleCratePickupSound(event: any): void {
        const crateType = event.target?.type;
        let sound = crateSoundByType.get(crateType);
        if (!sound && crateType === PowerupType.HealBase) {
            sound = this.game.rules.crateRules.healCrateSound;
        }
        const eva = crateEvaByType.get(crateType);
        const isHostilePickup = this.player &&
            !this.player.isObserver &&
            event.player !== this.player &&
            !this.game.alliances.areAllied(event.player, this.player);
        if (isHostilePickup) {
            return;
        }
        if (sound) {
            const position = Coords.tile3dToWorld(event.tile.rx, event.tile.ry, event.tile.z);
            this.worldSound.playEffect(sound, position, event.player);
        }
        if (eva) {
            this.eva.play(eva);
        }
    }
    handleOrderPushed(unit: any, orderType: any, feedbackType: any): void {
        const now = Date.now();
        if (!this.lastFeedbackTime || now - this.lastFeedbackTime >= 250) {
            let sound: string | undefined;
            switch (feedbackType) {
                case OrderFeedbackType.Attack:
                    sound = unit.rules.voiceAttack;
                    break;
                case OrderFeedbackType.Move:
                    sound = unit.rules.voiceMove;
                    break;
                case OrderFeedbackType.Capture:
                    sound = unit.rules.voiceCapture || unit.rules.voiceSpecialAttack;
                    break;
                case OrderFeedbackType.SpecialAttack:
                    sound = unit.rules.voiceSpecialAttack;
                    break;
            }
            if (sound) {
                this.sound.play(sound, ChannelType.Effect);
                this.lastFeedbackTime = now;
            }
        }
    }
    handleSelectionChangeEvent(event: any): void {
        if (event.selection.length && event.selection[0].owner === this.player) {
            const now = Date.now();
            const canPlayFeedback = !this.lastFeedbackTime || now - this.lastFeedbackTime >= 250;
            if (canPlayFeedback) {
                this.lastFeedbackTime = now;
                event.selection.forEach((unit: any) => {
                    if (unit.rules.voiceSelect) {
                        this.sound.play(unit.rules.voiceSelect, ChannelType.Effect);
                    }
                });
            }
        }
    }
}

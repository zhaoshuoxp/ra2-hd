import { SuperWeaponType } from '@/game/type/SuperWeaponType';
import { PlacementGrid } from './placementMode/PlacementGrid';
import { globalRules } from '@/game/rules/globalRules';

export function superWeaponRange(type: SuperWeaponType, rules: any, weaponType?: string) {
    const global = () => globalRules(rules);
    if (type === SuperWeaponType.ForceShield) return { radius: global().getNumber('ForceShieldRadius'), tileRadius: undefined };
    if (type === SuperWeaponType.PsychicReveal) return { radius: global().getNumber('PsychicRevealRadius'), tileRadius: undefined };
    if (type === SuperWeaponType.GeneticConverter) return { radius: rules.getWarhead(global().getString('MutateExplosionWarhead')).cellSpread, tileRadius: undefined };
    if (type === SuperWeaponType.PsychicDominator) return { radius: global().getNumber('DominatorCaptureRange'), tileRadius: undefined };
    if ([SuperWeaponType.IronCurtain, SuperWeaponType.ChronoSphere, SuperWeaponType.ChronoWarp].includes(type)) {
        // These native effects select nine tiles, not a radial distance test.
        // Retain the enclosing radius without painting the affected tiles.
        return { radius: 1.5 * Math.SQRT2, tileRadius: 1 };
    }
    if (type === SuperWeaponType.MultiMissile && weaponType) {
        const launch = rules.getWarhead(rules.getWeapon(weaponType).warhead);
        const payload = launch.nukeMaker ? rules.getWarhead(rules.getWeapon('NukePayload').warhead) : launch;
        return { radius: Math.max(0.5, payload.cellSpread), tileRadius: undefined };
    }
    if (type === SuperWeaponType.LightningStorm) {
        const storm = rules.general.lightningStorm;
        // Random strike centers occupy a square; the ring bounds the possible
        // damage envelope, not a guarantee that every point will be struck.
        return { radius: Math.floor(storm.cellSpread / 2) * Math.SQRT2 + rules.getWarhead(storm.warhead).cellSpread,
            tileRadius: undefined };
    }
    if ([SuperWeaponType.ParaDrop, SuperWeaponType.AmerParaDrop].includes(type)) {
        return { radius: 0.5, tileRadius: 0 };
    }
    return undefined;
}

export class SuperWeaponRangePreview {
    readonly model: any = { tiles: [], visible: false, rangeIndicator: undefined, rangeIndicatorColor: 0x70dfff, tileOpacity: 0.2 };
    private grid: PlacementGrid;
    private attached = false;
    constructor(private game: any, private worldScene: any, private weaponType?: string) {
        this.grid = new PlacementGrid(this.model, worldScene.camera, game.map.tiles);
    }
    hover(tile: any, type: SuperWeaponType) {
        const range = tile ? superWeaponRange(type, this.game.rules, this.weaponType) : undefined;
        this.model.visible = !!range;
        if (!range) return;
        if (!this.attached) { this.worldScene.add(this.grid); this.attached = true; }
        this.model.rangeIndicatorColor = type === SuperWeaponType.IronCurtain ? 0xee2020
            : type === SuperWeaponType.MultiMissile ? 0xe6bd28 : 0x70dfff;
        this.model.rangeIndicator = { center: { x: tile.rx + 0.5, y: tile.ry + 0.5 }, radius: range.radius, concentric: true };
        this.model.tiles = [];
    }
    dispose() {
        this.model.visible = false;
        if (this.attached) { this.worldScene.remove(this.grid); this.grid.dispose(); this.attached = false; }
    }
}

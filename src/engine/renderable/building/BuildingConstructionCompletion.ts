import { AnimationType } from '../entity/building/AnimationType';

type Sprite = {
    builder: { frameOffset?: number; hdOverride?: { constructionCompletionFrame?: number;
        constructionCompletionFrames?: ReadonlyMap<number, number> }; getFrame(): number };
    get3DObject(): { visible: boolean };
    setFrame(frame: number): void;
};
type Snapshot = { sprites: { sprite: Sprite; visible: boolean; frame?: number }[];
    turretVisible?: boolean };
const snapshots = new WeakMap<object, Snapshot>();

// Publish retained idle artwork at a declared completed construction frame.
// Animation clocks, game state and animation sounds are never switched here.
export function updateBuildingConstructionCompletion(building: any): void {
    const assembling = building.currentAnimType === AnimationType.BUILDUP
        || building.currentAnimType === AnimationType.UNBUILD;
    const assembly: Sprite | undefined = building.animObjects.get(building.currentAnimType)?.[0];
    const override = assembly?.builder.hdOverride;
    const frame = override?.constructionCompletionFrames?.get(assembly?.builder.frameOffset ?? 0)
        ?? override?.constructionCompletionFrame;
    const enabled = assembling && frame !== undefined && !!building.mainObj?.builder.hdOverride;
    const complete = enabled && building.gameObject.healthTrait.health > 0
        && assembly?.builder.getFrame() === frame;
    const previous = snapshots.get(building);
    if (!complete && previous) {
        if (assembling) {
            for (const state of previous.sprites) {
                state.sprite.get3DObject().visible = state.visible;
                if (state.frame !== undefined) state.sprite.setFrame(state.frame);
            }
            if (building.turret) building.turret.visible = previous.turretVisible;
        }
        snapshots.delete(building);
    }
    if (!enabled) return;
    const all: Sprite[] = [...building.animObjects.values()].flat();
    if (!complete) {
        for (const sprite of [building.mainObj, building.bib].filter(Boolean)) sprite.get3DObject().visible = false;
        if (building.turret) building.turret.visible = false;
        for (const sprite of building.animObjects.get(building.currentAnimType) ?? []) sprite.get3DObject().visible = true;
        return;
    }
    const nativeAssembly: Sprite[] = [...building.animObjects.get(AnimationType.BUILDUP) ?? [],
        ...building.animObjects.get(AnimationType.UNBUILD) ?? []];
    if (!previous) snapshots.set(building, {
        sprites: [building.mainObj, building.bib, ...all].filter(Boolean).map(sprite => ({
            sprite, visible: sprite.get3DObject().visible,
            frame: nativeAssembly.includes(sprite) || sprite === building.mainObj || sprite === building.bib
                ? undefined : sprite.builder.getFrame(),
        })), turretVisible: building.turret?.visible,
    });
    for (const sprite of all) sprite.get3DObject().visible = false;
    for (const sprite of [building.mainObj, building.bib].filter(Boolean)) sprite.get3DObject().visible = true;
    if (building.turret) building.turret.visible = true;
    const idle = building.objectRules.superWeapon && building.animObjects.get(AnimationType.SUPER)?.length
        ? building.animObjects.get(AnimationType.SUPER).slice(0, 1)
        : building.animObjects.get(AnimationType.IDLE) ?? [];
    for (const sprite of idle) {
        sprite.get3DObject().visible = true;
        sprite.setFrame(building.animations.get(sprite).props.start);
    }
    const active = building.animObjects.get(AnimationType.ACTIVE) ?? [];
    const properties = building.animArtProps.getByType(AnimationType.ACTIVE);
    active.forEach((sprite: Sprite, index: number) => {
        const occupied = !!building.gameObject.absorberTrait?.units.length;
        const selected = !building.gameObject.absorberTrait || index > 1 || index === (occupied ? 1 : 0);
        const visible = (!building.objectRules.refinery || index === 0) && selected
            && (building.powered || properties[index]?.showWhenUnpowered);
        sprite.get3DObject().visible = !!visible;
        if (visible) sprite.setFrame(building.animations.get(sprite).props.start);
    });
}

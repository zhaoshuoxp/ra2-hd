export class ObjectCloakPlugin {
    private gameObject: any;
    private localPlayer: any;
    private alliances: any;
    private renderable: any;
    private lastCanSeeThroughCloak: boolean = false;
    private lastCloaked?: boolean;
    constructor(gameObject: any, localPlayer: any, alliances: any, renderable: any) {
        this.gameObject = gameObject;
        this.localPlayer = localPlayer;
        this.alliances = alliances;
        this.renderable = renderable;
    }
    onCreate(): void { }
    update(time: number): void {
        const isCloaked = !!this.gameObject.cloakableTrait?.isCloaked() && !this.gameObject.isDestroyed;
        const cloakChanged = isCloaked !== this.lastCloaked;
        // Normal matches pass the Player directly; diagnostic/replay callers
        // may pass a boxed selection. Neither form should reveal enemy cloak.
        const player = this.localPlayer && 'value' in this.localPlayer ? this.localPlayer.value : this.localPlayer;
        const canSeeThroughCloak = isCloaked && (!player ||
            this.alliances.haveSharedIntel(player, this.gameObject.owner));
        const visibilityChanged = canSeeThroughCloak !== this.lastCanSeeThroughCloak;
        if (cloakChanged || visibilityChanged) {
            this.lastCloaked = isCloaked;
            this.lastCanSeeThroughCloak = canSeeThroughCloak;
            this.renderable.get3DObject().visible = !isCloaked || canSeeThroughCloak;
        }
    }
    onRemove(): void { }
    dispose(): void { }
}

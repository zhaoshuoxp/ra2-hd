import { fnv32a } from '@/util/math';
import { NotifyOwnerChange } from './interface/NotifyOwnerChange';
import { NotifyUnspawn } from './interface/NotifyUnspawn';
import { GameObject } from '@/game/gameobject/GameObject';
import { World } from '@/game/World';
export class MindControllableTrait {
    private gameObject: GameObject;
    private controller?: GameObject;
    private prevOwner?: any;
    private permanent = false;
    constructor(gameObject: GameObject) {
        this.gameObject = gameObject;
    }
    getOriginalOwner(): any {
        return this.prevOwner;
    }
    isActive(): boolean {
        return !!this.controller || this.permanent;
    }
    getController(): GameObject | undefined {
        return this.controller;
    }
    controlBy(controller: GameObject, world: World): void {
        if (this.controller) {
            throw new Error(`Object "${this.gameObject?.name}" is already mind controlled by "${controller.name}"`);
        }
        this.controller = controller;
        this.prevOwner = this.gameObject.owner;
        world.changeObjectOwner(this.gameObject, controller.owner);
    }
    controlPermanently(owner: any, world: World): void {
        if (this.permanent) return;
        this.restore(world);
        world.changeObjectOwner(this.gameObject, owner);
        this.permanent = true;
    }
    restore(world: World): void {
        if (this.prevOwner) {
            const owner = this.prevOwner;
            this.controller?.mindControllerTrait?.cleanTarget(this.gameObject);
            this.prevOwner = undefined;
            this.controller = undefined;
            world.changeObjectOwner(this.gameObject, owner);
        }
    }
    [NotifyOwnerChange.onChange](object: any, _oldOwner: any, _world: any): void {
        if (this.controller && object.owner !== this.controller.owner) {
            this.controller.mindControllerTrait?.cleanTarget(object);
            this.controller = undefined;
            this.prevOwner = undefined;
        }
    }
    [NotifyUnspawn.onUnspawn](gameObject: GameObject, world: World): void {
        if (this.controller) {
            this.controller.mindControllerTrait.cleanTarget(gameObject);
            if ((gameObject as any).absorbedBy) {
                this.controller = undefined;
                this.prevOwner = undefined;
                return;
            }
            if (!gameObject.isDestroyed && gameObject.limboData) {
                this.restore(world);
            }
        }
    }
    getHash(): number { return fnv32a([this.controller?.id ?? 0, Number(this.permanent)]); }
    dispose(): void {
        this.gameObject = undefined as any;
    }
}

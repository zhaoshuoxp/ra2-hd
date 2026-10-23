import { CompositeDisposable } from '@/util/disposable/CompositeDisposable';
import { Coords } from '@/game/Coords';
import { EventType } from '@/game/event/EventType';
interface Game {
    events: {
        subscribe: (handler: (event: any) => void) => {
            dispose: () => void;
        };
    };
}
interface RenderableManager {
    createTransientAnim: (name: string, callback: (anim: any) => void) => any;
}
interface TriggerAnimEvent {
    reverse?: boolean;
    artOverrides?: Record<string, string>;
    attachment?: { position: any; active: boolean };
    unitAppearance?: { identity: string; color: any };
    type: EventType;
    name: string;
    tile: {
        rx: number;
        ry: number;
        z: number;
    };
}
export class TriggerActionFxHandler {
    private game: Game;
    private renderableManager: RenderableManager;
    private disposables: CompositeDisposable;
    private handleEvent: (event: TriggerAnimEvent) => void;
    constructor(game: Game, renderableManager: RenderableManager) {
        this.game = game;
        this.renderableManager = renderableManager;
        this.disposables = new CompositeDisposable();
        this.handleEvent = (event: TriggerAnimEvent) => {
            switch (event.type) {
                case EventType.TriggerAnim: {
                    const animName = event.name;
                    this.renderableManager.createTransientAnim(animName, (anim) => {
                        anim.attachment = event.attachment;
                        if (event.unitAppearance) {
                            anim.setUnitHdIdentity(event.unitAppearance.identity);
                            anim.remapColor(event.unitAppearance.color);
                        }
                        if (event.reverse || event.artOverrides) {
                            anim.setArtOverrides({ ...event.artOverrides, ...(event.reverse ? { Reverse: 'yes' } : {}) });
                        }
                        const position = Coords.tile3dToWorld(event.tile.rx + 0.5, event.tile.ry + 0.5, event.tile.z);
                        anim.setPosition(event.attachment?.position ?? position);
                    });
                    break;
                }
            }
        };
    }
    init(): void {
        this.disposables.add(this.game.events.subscribe(this.handleEvent));
    }
    dispose(): void {
        this.disposables.dispose();
    }
}

import { CompositeDisposable } from '@/util/disposable/CompositeDisposable';
import { Coords } from '@/game/Coords';
import { EventType } from '@/game/event/EventType';
import { CampaignSparkFx } from '../CampaignSparkFx';
import type { TriggerParticleEvent } from '@/game/event/TriggerParticleEvent';
interface Game {
    events: {
        subscribe: (handler: (event: any) => void) => {
            dispose: () => void;
        };
    };
}
interface RenderableManager {
    createTransientAnim: (name: string, callback: (anim: any) => void) => any;
    addEffect: (effect: any) => void;
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
    private readonly particles = new Set<CampaignSparkFx>();
    private handleEvent: (event: TriggerAnimEvent | TriggerParticleEvent) => void;
    constructor(game: Game, renderableManager: RenderableManager) {
        this.game = game;
        this.renderableManager = renderableManager;
        this.disposables = new CompositeDisposable();
        this.handleEvent = (event: TriggerAnimEvent | TriggerParticleEvent) => {
            switch (event.type) {
                case EventType.TriggerParticle: {
                    const particle = event as TriggerParticleEvent;
                    const effect = new CampaignSparkFx(particle.visual, particle.name, () => this.particles.delete(effect));
                    this.particles.add(effect); this.renderableManager.addEffect(effect);
                    break;
                }
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
                        // Retail mission arrows declare Layer=Top and must clear world depth.
                        const layer = event.artOverrides?.Layer ?? anim.objectArt.art.getString('Layer');
                        if (layer.toLowerCase() === 'top') anim.setRenderOrder(1000000);
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
        for (const effect of this.particles) effect.dispose();
        this.particles.clear();
    }
}

import { expect, test } from 'bun:test';
import { retailIni } from '../test-support/resources';
import { campaignWorldRegistration, paintCampaignBackdrop } from '../../src/gui/campaign/CampaignBackdrop';
import { TriggerActionFxHandler } from '../../src/engine/renderable/fx/handler/TriggerActionFxHandler';
import { EventType } from '../../src/game/event/EventType';
import { Coords } from '../../src/game/Coords';

test('all aspect ratios retain one undistorted world and exclude the wrapped Alaska seam', () => {
    for (const [width, height] of [[800, 600], [1066.67, 600], [1400, 600], [2400, 600], [800, 1000]]) {
        const map = campaignWorldRegistration(width, height), draws: any[][] = [];
        const context = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
            drawImage: (...args: any[]) => draws.push(args) } as unknown as CanvasRenderingContext2D;
        paintCampaignBackdrop(context, { image: {} as HTMLImageElement,
            revision: 'campaign-backdrop-world-r2a.png', dispose() {} }, width, height);
        expect(draws).toHaveLength(1);
        const [, sx, sy, sw, sh, x, y, w, h] = draws[0];
        expect([sx, sy]).toEqual([0, 0]);
        expect(sw).toBeLessThan(1790);
        expect(w / sw).toBeCloseTo(h / sh, 8);
        expect(x + 520 * w / sw).toBeCloseTo(map.locatorX, 8);
        expect(y + 248 * h / sh).toBeCloseTo(map.locatorY, 8);
    }
});

test('retail Top-layer mission arrows clear world depth without elevating ordinary trigger effects', () => {
    const art = retailIni('ra2', 'art');
    let listener: (event: any) => void = () => {}, disposed = false;
    const animations: any[] = [];
    const handler = new TriggerActionFxHandler({ events: { subscribe(callback) {
        listener = callback; return { dispose: () => { disposed = true; } };
    } } }, { createTransientAnim(name, callback) {
        const animation = { name, objectArt: { art: art.getSection(name) }, order: 0, position: undefined as any,
            setRenderOrder(order: number) { this.order = order; }, setPosition(position: any) { this.position = position; } };
        callback(animation); animations.push(animation); return animation;
    } });
    handler.init();
    const tile = { rx: 91, ry: 97, z: 0 };
    for (const name of ['ARRWSE', 'FLAMEGUY']) listener({ type: EventType.TriggerAnim, name, tile });
    expect(art.getSection('ARRWSE')?.getString('Layer')).toBe('Top');
    expect(animations[0].order).toBeGreaterThan(999999);
    expect(animations[1].order).toBe(0);
    for (const animation of animations) expect(animation.position).toEqual(Coords.tile3dToWorld(91.5, 97.5, 0));
    handler.dispose(); expect(disposed).toBe(true);
});

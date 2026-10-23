import { test, expect } from 'bun:test';
import { MainMenuController } from '../../src/gui/screen/mainMenu/MainMenuController';
import { loadingLayout } from '../../src/gui/screen/game/loadingScreen/loadingLayout';
import { savedSoloSpeed, selectedGameSpeed, DEFAULT_SOLO_SPEED } from '../../src/gui/screen/game/gameMenu/gameSpeedControl';

test('repeated display notifications preserve the current menu screen instead of replaying navigation', async () => {
    let enters = 0, leaves = 0, layouts = 0;
    const controller = new MainMenuController({});
    const screen = { onEnter: () => { enters++; }, onLeave: () => { leaves++; }, onViewportChange: () => { layouts++; } };
    controller.addScreen(1, screen);
    await controller.pushScreen(1);
    for (let i = 0; i < 100; i++) controller.rerenderCurrentScreen(true);
    await Promise.resolve();
    expect(controller.getCurrentScreen()).toBe(screen);
    expect(enters).toBe(1); expect(leaves).toBe(0); expect(layouts).toBe(100);
});
test('country artwork and live labels share a complete, uniformly scaled safe area', () => {
    for (const [w, h] of [[1600, 900], [1440, 900], [1200, 900], [900, 1200]]) {
        const l = loadingLayout(w, h);
        expect(l.contentX).toBe(0); expect(l.y).toBe(l.contentY);
        expect(l.cover).toBe(l.contentScale);
        expect(l.x + 800 * l.cover).toBeLessThanOrEqual(w);
        expect(l.y + 600 * l.cover).toBeLessThanOrEqual(h);
        expect(l.contentX).toBeGreaterThanOrEqual(0); expect(l.contentY).toBeGreaterThanOrEqual(0);
        expect(l.contentWidth * l.contentScale).toBeCloseTo(w);
        expect(l.contentY + 600 * l.contentScale).toBeLessThanOrEqual(h);
    }
});
test('new solo preferences default to the midpoint and cannot misread a legacy seven-tier value', () => {
    expect(DEFAULT_SOLO_SPEED).toBe(2);
    for (const value of [undefined, '', '6', '-1', 'NaN', '0.5']) expect(savedSoloSpeed(value)).toBe(2);
    expect([0, 1, 2, 3, 4].map(i => savedSoloSpeed(String(i)))).toEqual([0, 1, 2, 3, 4]);
    expect(selectedGameSpeed(savedSoloSpeed()) * 15).toBe((45 + 90) / 2);
});

import { expect, test } from 'bun:test';
import { UiObject } from '../../src/gui/UiObject';
import { GameMenuContentArea } from '../../src/gui/screen/game/component/hud/GameMenuContentArea';

test('leaving the game menu releases its owned mask geometry and material', () => {
    const owner = new UiObject();
    const component = Object.create(GameMenuContentArea.prototype);
    component.uiObject = owner;
    const mask = component.createMask({ width: 1000, height: 900 });
    let geometryDisposals = 0, materialDisposals = 0;
    mask.geometry.addEventListener('dispose', () => geometryDisposals++);
    mask.material.addEventListener('dispose', () => materialDisposals++);
    owner.destroy();
    expect(geometryDisposals).toBe(1);
    expect(materialDisposals).toBe(1);
});

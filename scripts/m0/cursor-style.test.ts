import { expect, test } from 'bun:test';
import { PointerSprite } from '../../src/gui/PointerSprite';
import { PointerType } from '../../src/engine/type/PointerType';

test('native cursor caches frame zero without changing the active gameplay frame', () => {
    const draws: unknown[][] = [];
    let created = 0, encoded = 0;
    const canvas = { width: 0, height: 0,
        getContext: () => ({ drawImage: (...args: unknown[]) => draws.push(args) }),
        toDataURL: (type: string) => { expect(type).toBe('image/png'); encoded++; return 'data:image/png;base64,TEST'; } };
    const sheet = { ownerDocument: { createElement: (tag: string) => {
        expect(tag).toBe('canvas'); created++; return canvas;
    } } };
    const sprite = new PointerSprite(sheet as any, { width: 55, height: 43 }, 436);
    sprite.setFrame(PointerType.AttackRange);
    const css = sprite.getDefaultCursorCss();
    expect(sprite.getFrame()).toBe(PointerType.AttackRange);
    sprite.setFrame(PointerType.Move);
    expect(sprite.getDefaultCursorCss()).toBe(css);
    expect(sprite.getFrame()).toBe(PointerType.Move);
    expect([created, encoded]).toEqual([1, 1]);
    expect(draws).toEqual([[sheet, 0, 0, 55, 43, 0, 0, 55, 43]]);
    expect(css).toBe('url("data:image/png;base64,TEST") 0 0, default');
});

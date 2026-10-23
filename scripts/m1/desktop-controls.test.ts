import { test, expect } from 'bun:test';
import { installControls, pointerScreenPoint } from '../../desktop/controls.mjs';

test('menu cursor maps normalized client coordinates without multiplying Retina density', () => {
    const bounds = { x: -1400, y: 40, width: 1280, height: 900 };
    expect(pointerScreenPoint(bounds, { x: 0.25, y: 0.75 })).toEqual({ x: -1080, y: 715 });
    expect(pointerScreenPoint(bounds, { x: 1, y: 1 })).toEqual({ x: -121, y: 939 });
    for (const point of [null, { x: NaN, y: 0 }, { x: -1, y: 0 }, { x: 0, y: Infinity }])
        expect(() => pointerScreenPoint(bounds, point)).toThrow();
});
test('desktop exit accepts only the trusted main frame and closes the application', async () => {
    const handlers = new Map<string, Function>();
    const mainFrame = { url: 'ra2://game/' }, contents = { mainFrame };
    let quits = 0;
    installControls({ app: { quit: () => quits++ }, ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
        getWindow: () => ({ webContents: contents }), isGameURL: url => url === 'ra2://game/', cursorHelper: '/unused' });
    const quit = handlers.get('desktop:quit')!;
    expect(() => quit({ sender: {}, senderFrame: mainFrame })).toThrow();
    expect(() => quit({ sender: contents, senderFrame: { url: 'ra2://game/' } })).toThrow();
    quit({ sender: contents, senderFrame: mainFrame });
    await new Promise(resolve => setImmediate(resolve));
    expect(quits).toBe(1);
});

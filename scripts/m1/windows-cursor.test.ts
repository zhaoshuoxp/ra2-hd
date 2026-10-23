import { expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { WindowsCursor, cursorScript } from '../../desktop/windows-cursor.mjs';
import { installControls } from '../../desktop/controls.mjs';

function fixture() {
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(),
        stderr: new PassThrough(), kill: () => kills++ });
    let calls = 0, kills = 0, command: any[] = [], input = '';
    child.stdin.on('data', bytes => { input += bytes; });
    const cursor = new WindowsCursor({ systemRoot: 'C:\\Windows', launch: (...args: any[]) => {
        calls++; command = args; return child;
    } });
    return { cursor, child, state: () => ({ calls, kills, command, input }) };
}
test('Windows cursor shares one hidden helper and acknowledges numeric physical coordinates', async () => {
    const f = fixture(), first = f.cursor.prepare();
    expect(f.cursor.prepare()).toBe(first);
    f.child.stdout.write('ready\n'); await first;
    const request = f.cursor.restore({ x: -1200, y: 850 });
    await Promise.resolve();
    expect(f.state().input).toBe('1,-1200,850\n');
    f.child.stdout.write('1:1\n'); expect(await request).toBe(true);
    const { command, calls } = f.state();
    expect(calls).toBe(1); expect(command[0]).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    expect(command[2].windowsHide).toBe(true);
    expect(Buffer.from(command[1].at(-1), 'base64').toString('utf16le')).toBe(cursorScript);
    await expect(f.cursor.restore({ x: 1.5, y: 0 })).rejects.toThrow('Invalid physical');
    expect(await f.cursor.restore({ x: 0, y: 0 }, () => false)).toBe(false);
    expect(f.state().input).toBe('1,-1200,850\n');
    f.cursor.dispose(); expect(f.state().kills).toBe(1);
});
test('closing or losing the helper settles pending cursor requests', async () => {
    const f = fixture(), ready = f.cursor.prepare();
    f.child.stdout.write('ready\n'); await ready;
    const request = f.cursor.restore({ x: 10, y: 20 }); await Promise.resolve();
    f.child.emit('exit', 1); expect(await request).toBe(false);
    expect(f.state().kills).toBe(1);
    await expect(f.cursor.prepare()).rejects.toThrow('disposed');
    const g = fixture(), startup = g.cursor.prepare();
    g.cursor.dispose(); await expect(startup).rejects.toThrow('disposed');
});
test('Windows handoff converts DIP to physical pixels and cancels stale or unfocused requests', async () => {
    const handlers = new Map<string, Function>(), events = new Map<string, Function>();
    const mainFrame = { url: 'ra2://game/' }, contents = { mainFrame };
    let focused = true, prepared = 0, restored: any[] = [], finish!: () => void;
    const window = { webContents: contents, isFocused: () => focused, isDestroyed: () => false,
        getContentBounds: () => ({ x: -1000, y: 40, width: 1000, height: 800 }) };
    const event = { sender: contents, senderFrame: mainFrame };
    installControls({ platform: 'win32', app: { once: (name, fn) => events.set(name, fn) },
        ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, getWindow: () => window,
        isGameURL: url => url === 'ra2://game/', screen: { dipToScreenPoint: p => ({ x: p.x * 1.5, y: p.y * 1.5 }) },
        windowsCursor: { prepare: async () => { prepared++; }, dispose: () => prepared--,
            restore: async (point, allowed) => { await new Promise<void>(resolve => { finish = resolve; });
                if (!allowed()) return false; restored.push(point); return true; } } });
    const prepare = handlers.get('desktop:prepare-pointer')!, restore = handlers.get('desktop:restore-pointer')!;
    expect(() => prepare({ sender: {}, senderFrame: mainFrame })).toThrow('denied');
    prepare(event); expect(prepared).toBe(1);
    const request = restore(event, { x: 0.5, y: 0.5 }); finish();
    expect(await request).toEqual({ restored: true }); expect(restored).toEqual([{ x: -750, y: 660 }]);
    const stale = restore(event, { x: 0, y: 0 }); prepare(event); finish();
    expect(await stale).toEqual({ restored: false }); expect(restored.length).toBe(1);
    focused = false; expect(await restore(event, { x: 0, y: 0 })).toEqual({ restored: false });
    events.get('will-quit')!(); expect(prepared).toBe(1);
});

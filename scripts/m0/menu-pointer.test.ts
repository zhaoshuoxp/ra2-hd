import { expect, test } from 'bun:test';
import { Pointer } from '../../src/gui/Pointer';
import { CanvasMetrics } from '../../src/gui/CanvasMetrics';
import { PointerLock } from '../../src/util/PointerLock';
import { EventDispatcher } from '../../src/util/event';

class Events {
    listeners = new Map<string, Map<Function, boolean>>();
    addEventListener(type: string, fn: Function, options?: any) {
        const group = this.listeners.get(type) ?? new Map();
        if (!group.has(fn)) group.set(fn, !!options?.once);
        this.listeners.set(type, group);
    }
    removeEventListener(type: string, fn: Function) { this.listeners.get(type)?.delete(fn); }
    emit(type: string, data: any = {}) {
        for (const [fn, once] of [...(this.listeners.get(type) ?? [])]) {
            if (once) this.removeEventListener(type, fn);
            fn({ type, ...data });
        }
    }
    count(type: string) { return this.listeners.get(type)?.size ?? 0; }
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture() {
    const doc = new Events(), canvas = new Events();
    let rect = { left: 128, top: 848, width: 1024, height: 768 }, reads = 0;
    Object.assign(canvas, { width: 1024, height: 768, getBoundingClientRect: () => { reads++; return rect; } });
    const win = Object.assign(new Events(), { scrollX: 0, scrollY: 0 });
    const metrics = new CanvasMetrics(canvas as any, win as any); metrics.init();
    const change = new EventDispatcher<any, boolean>();
    const lock = {
        onChange: change.asEvent(), active: false, denied: false, requests: 0,
        isActive() { return this.active; },
        async request() {
            this.requests++;
            if (this.denied) throw new Error('Test-only lock denial');
            this.active = true; change.dispatch(this, true);
        },
        async exit() { this.active = false; change.dispatch(this, false); },
    };
    const sprite = { visible: false, position: {}, setVisible(v: boolean) { this.visible = v; },
        getSize: () => ({ width: 16, height: 16 }), setPosition(x: number, y: number) { this.position = { x, y }; } };
    const pointer = new Pointer(lock as any, sprite as any, doc as any, canvas as any, metrics, { value: true } as any);
    pointer.init();
    return { doc, canvas, lock, change, pointer, sprite, metrics,
        place: (value: typeof rect) => { rect = value; }, reads: () => reads };
}

test('menu absolute movement uses current canvas bounds; lock retains the final menu coordinate', async () => {
    const f = fixture();
    // Reproduce layout movement without any window resize notification.
    f.place({ left: 128, top: 80, width: 1024, height: 768 });
    f.doc.emit('mousemove', { pageX: 630, pageY: 310 });
    expect(f.pointer.getPosition()).toEqual({ x: 502, y: 230 });
    f.pointer.lock(); f.canvas.emit('click'); await settle();
    expect(f.sprite.visible).toBe(true);
    expect(f.pointer.getPosition()).toEqual({ x: 502, y: 230 });
    const reads = f.reads();
    f.doc.emit('mousemove', { movementX: 8, movementY: -4 });
    expect(f.pointer.getPosition()).toEqual({ x: 510, y: 226 });
    expect(f.reads()).toBe(reads); // No new layout read in locked gameplay.
    f.pointer.unlock(); await settle();
    f.place({ left: 20, top: 30, width: 512, height: 384 });
    f.doc.emit('mousemove', { pageX: 220, pageY: 180 });
    expect(f.pointer.getPosition()).toEqual({ x: 400, y: 300 });
    f.pointer.lock(); await settle();
    expect(f.pointer.getPosition()).toEqual({ x: 400, y: 300 });
    f.doc.emit('mousemove', { movementX: 10, movementY: -5 });
    expect(f.pointer.getPosition()).toEqual({ x: 420, y: 290 });
    f.pointer.dispose(); f.metrics.dispose();
});

test('menu cycles and repeated lock loss retain at most one recovery click listener', async () => {
    const f = fixture(); f.pointer.lock(); f.canvas.emit('click'); await settle();
    for (let i = 0; i < 20; i++) {
        f.pointer.unlock(); await settle();
        expect(f.canvas.count('click')).toBe(0);
        expect(f.sprite.visible).toBe(false);
        f.pointer.lock(); await settle();
        expect(f.canvas.count('click')).toBe(0);
        expect(f.sprite.visible).toBe(true);
    }
    f.lock.active = false;
    for (let i = 0; i < 10; i++) f.change.dispatch(f.lock, false);
    expect(f.canvas.count('click')).toBe(1);
    const requests = f.lock.requests; f.canvas.emit('click'); await settle();
    expect(f.lock.requests).toBe(requests + 1);
    expect(f.canvas.count('click')).toBe(0);
    f.pointer.dispose(); f.metrics.dispose();
    expect(f.doc.count('mousemove')).toBe(0);
    f.change.dispatch(f.lock, false);
    expect(f.canvas.count('click')).toBe(0);
});

test('denial leaves the system cursor available and one retry; menu opening cancels retry', async () => {
    const f = fixture(); f.pointer.lock(); f.canvas.emit('click'); await settle();
    f.pointer.unlock(); await settle(); f.lock.denied = true;
    f.pointer.lock(); await settle();
    expect(f.sprite.visible).toBe(false);
    expect(f.canvas.count('click')).toBe(1);
    f.canvas.emit('click'); await settle();
    expect(f.canvas.count('click')).toBe(1);
    f.pointer.unlock(); await settle();
    expect(f.canvas.count('click')).toBe(0);
    f.lock.denied = false; f.pointer.lock(); f.canvas.emit('click'); await settle();
    expect(f.sprite.visible).toBe(true);
    f.pointer.unlock(); f.lock.denied = true;
    f.pointer.lock(); f.pointer.unlock(); await settle();
    expect(f.canvas.count('click')).toBe(0); // A late rejection must not arm a menu click.
    f.pointer.lock(); f.pointer.dispose(); await settle();
    expect(f.canvas.count('click')).toBe(0);
    f.metrics.dispose();
});

test('promise-only and synchronous lock failures remove temporary DOM listeners', async () => {
    const doc = Object.assign(new Events(), { pointerLockElement: null });
    const canvas = { requestPointerLock: () => Promise.reject(new Error('Denied without DOM event')) };
    const lock = new PointerLock(canvas as any, doc as any);
    for (let i = 0; i < 5; i++) {
        await expect(lock.request()).rejects.toThrow('Denied without DOM event');
        expect(doc.count('pointerlockerror')).toBe(0);
        expect(doc.count('pointerlockchange')).toBe(1); // Permanent state observer only.
    }
    canvas.requestPointerLock = () => { throw new Error('Synchronous denial'); };
    await expect(lock.request()).rejects.toThrow('Synchronous denial');
    expect(doc.count('pointerlockerror')).toBe(0);
    expect(doc.count('pointerlockchange')).toBe(1);
    lock.dispose();
    expect(doc.count('pointerlockchange')).toBe(0);
    expect(doc.count('touchstart')).toBe(0);
});


test('unsupported raw movement falls back without retaining failed request listeners', async () => {
    const doc = Object.assign(new Events(), { pointerLockElement: null as any });
    const requested: any[] = [];
    const canvas = { requestPointerLock: (options?: any) => {
        requested.push(options);
        if (options?.unadjustedMovement) return Promise.reject(new DOMException('Unsupported', 'NotSupportedError'));
        doc.pointerLockElement = canvas;
        doc.emit('pointerlockchange');
        return Promise.resolve();
    } };
    const lock = new PointerLock(canvas as any, doc as any);
    await lock.request({ unadjustedMovement: true });
    expect(requested).toEqual([{ unadjustedMovement: true }, undefined]);
    expect(lock.isActive()).toBe(true);
    expect(doc.count('pointerlockerror')).toBe(0);
    expect(doc.count('pointerlockchange')).toBe(1);
    lock.dispose();
});

test('pause hands the final logical cursor to the desktop after unlock and ignores stale center events', async () => {
    const f = fixture();
    f.place({ left: 0, top: 0, width: 512, height: 384 });
    f.metrics.notifyViewportChange();
    let restore: ((value: { restored: boolean }) => void) | undefined;
    const positions: any[] = [];
    Object.assign(f.doc, { defaultView: { innerWidth: 512, innerHeight: 384, desktopApp: {
        preparePointer: async () => {},
        restorePointer: (p: any) => { positions.push(p); return new Promise(resolve => { restore = resolve; }); },
    } } });
    f.doc.emit('mousemove', { pageX: 100, pageY: 80 });
    f.pointer.lock(); f.canvas.emit('click'); await settle();
    f.doc.emit('mousemove', { movementX: 50, movementY: 40 });
    const saved = { ...f.pointer.getPosition() };
    f.pointer.unlock(true);
    f.doc.emit('mousemove', { pageX: 256, pageY: 192 });
    await settle();
    expect(positions).toEqual([{ x: 150 / 512, y: 120 / 384 }]);
    expect(f.pointer.getPosition()).toEqual(saved);
    restore!({ restored: true }); await settle();
    expect(f.pointer.getPosition()).toEqual(saved);
    f.doc.emit('mousemove', { pageX: 160, pageY: 130 });
    expect(f.pointer.getPosition()).toEqual({ x: 320, y: 260 });
    f.pointer.dispose(); f.metrics.dispose();
});

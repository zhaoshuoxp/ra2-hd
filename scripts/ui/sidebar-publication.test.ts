import { test, expect } from 'bun:test';
import { SidebarCard } from '../../src/gui/screen/game/component/hud/SidebarCard';
import { UiObjectSprite } from '../../src/gui/UiObjectSprite';

test('a model switch before the next UI frame rejects an old ready callback', () => {
    const item = (cameo: string) => ({ cameo, target: { rules: { name: cameo } } });
    const old = item('old'), next = item('next');
    const model = { activeTab: { items: [old] } };
    const ready: (() => void)[] = [], published: any[][] = [];
    // Exercise the real publication method without creating renderer objects.
    const card: any = Object.create(SidebarCard.prototype);
    Object.assign(card, {
        props: { sidebarModel: model, cameoImages: {}, slots: 1,
            cameoNameToIdMap: new Map([['old.shp', 1], ['next.shp', 2]]) },
        pagingOffset: 0, pageRequest: 0, disposed: false,
        artworkPages: { prepare: (_: any, callback: () => void) => { ready.push(callback); return () => {}; } },
        publishSlots: (items: any[]) => published.push(items),
    });
    card.updateSlots([old], 1);
    model.activeTab = { items: [next] };
    ready[0](); expect(published).toEqual([]);
    card.updateSlots([next], 1);
    ready[0](); expect(published).toEqual([]);
    ready[1](); expect(published).toEqual([[next]]);
});

test('hover requests the displayed identity and releases its preparation on exit', () => {
    const calls: string[] = [];
    const card: any = Object.create(SidebarCard.prototype);
    card.props = { slots: 1, cameoImages: {}, cameoPalette: '', strings: {},
        textColor: '#fff', cameoNameToIdMap: new Map(), sidebarModel: {
            focusArtwork: (name: string) => { calls.push(name); return () => calls.push('release ' + name); },
        } };
    card.visible = true;
    card.publishedItems = [{ target: { type: 0, rules: { name: 'NAMISL' } }, disabled: false }];
    card.slotOutline = { setPosition() {}, setVisible() {} };
    const slot = card.defineChildren()[0];
    slot.props.onMouseEnter(); slot.props.onMouseLeave();
    expect(calls).toEqual(['NAMISL', 'release NAMISL']);
    card.publishedItems[0].disabled = true;
    slot.props.onMouseEnter(); slot.props.onMouseLeave();
    expect(calls).toEqual(['NAMISL', 'release NAMISL']);
});


test('stationary hover follows a newly published page after asynchronous cameo preparation', () => {
    const calls: string[] = [];
    const card: any = Object.create(SidebarCard.prototype);
    Object.assign(card, { visible: true, publishedItems: [], pointerSlotIndex: 0,
        props: { slotSize: { width: 60, height: 48 }, sidebarModel: {
            focusArtwork: (name: string) => { calls.push(name); return () => calls.push('release ' + name); },
        } }, slotOutline: { setPosition() {}, setVisible() {} } });
    card.updateHover(); expect(calls).toEqual([]);
    card.publishedItems = [{ target: { type: 0, rules: { name: 'NAMISL' } }, disabled: false }];
    card.updateHover(); card.updateHover(); expect(calls).toEqual(['NAMISL']);
    card.publishedItems = [{ target: { type: 0, rules: { name: 'NAINDP' } }, disabled: false }];
    card.updateHover(); expect(calls).toEqual(['NAMISL', 'release NAMISL', 'NAINDP']);
    Object.assign(card, { pageRequest: 0, artworkPages: { dispose() {} }, slotObjects: [], previewLeases: new Map() });
    card.hide(); expect(calls.at(-1)).toBe('release NAINDP');
});

test('hidden sidebar releases display and cached leases, rejects stale readiness and prepares the current page on return', () => {
    const calls: string[] = [], ready: (() => void)[] = [];
    const item = { cameo: 'tank', target: { rules: { name: 'MTNK' } } };
    const card: any = Object.create(SidebarCard.prototype);
    Object.assign(card, { visible: true, disposed: false, pageRequest: 0, pagingOffset: 0,
        props: { sidebarModel: { activeTab: { items: [item] } }, cameoImages: {}, slots: 1,
            cameoNameToIdMap: new Map([['tank.shp', 1]]) },
        updateHover() {}, slotObjects: [{ setVisible: (v: boolean) => calls.push('visible-' + v) }],
        previewLeases: new Map([['MTNK', () => calls.push('preview-release')]]),
        artworkPages: { dispose: () => calls.push('pages-release'),
            prepare: (_: any, callback: () => void) => { ready.push(callback); return () => calls.push('cancel'); } },
        publishSlots: () => calls.push('publish'),
    });
    card.updateSlots([item], 1); card.hide(); ready[0]();
    expect(calls).toEqual(['cancel', 'pages-release', 'visible-false', 'preview-release']);
    card.updateSlots([item], 1); expect(ready.length).toBe(1);
    card.show(); ready[1](); expect(calls.at(-1)).toBe('publish');
});

test('empty publication and production clocks retain visibility before sprite meshes exist', () => {
    const visible: boolean[] = [];
    const sprite = () => new UiObjectSprite({ setVisible: (value: boolean) => visible.push(value),
        setFrame() {}, frameCount: 54 });
    const cameo = sprite(), clock = sprite(), tag = sprite();
    const text = { getUiObject: () => ({ setVisible() {} }) };
    const card: any = Object.create(SidebarCard.prototype);
    Object.assign(card, { disposed: false, visible: true, publishedItems: [], previewLeases: new Map(),
        props: { sidebarModel: {} }, slotObjects: [cameo], progressOverlays: [clock], tagObjects: [tag],
        labelObjects: [text], quantityObjects: [text], nameObjects: [text],
        slotContainers: [{ setTooltip() {} }] });
    expect(clock.get3DObject()).toBeUndefined();
    card.publishSlots([], 1);
    expect(cameo.isVisible()).toBe(false);
    expect(clock.isVisible()).toBe(false);
    expect(tag.isVisible()).toBe(false);
    card.updateProgressOverlay({ status: 0, disabled: false }, clock);
    expect(clock.isVisible()).toBe(false);
    expect(visible).toEqual([false, false, false, false]);
});

test('a disposed sidebar rejects synchronous artwork notifications before page preparation', () => {
    const card: any = Object.create(SidebarCard.prototype);
    Object.assign(card, { disposed: true, visible: true, props: {},
        artworkPages: { prepare() { throw Error('Disposed card must not prepare'); } } });
    expect(() => card.updateSlots([], 1)).not.toThrow();
    expect(() => card.publishSlots([], 1)).not.toThrow();
});

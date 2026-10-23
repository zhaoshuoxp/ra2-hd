import { test, expect, spyOn } from 'bun:test';
import * as THREE from 'three';
import { uiArt } from '../../src/gui/hd/UiArt';
import { UiArtSpriteBuilder } from '../../src/gui/hd/UiArtSpriteBuilder';
import { SpriteUtils } from '../../src/engine/gfx/SpriteUtils';
import { Strings } from '../../src/data/Strings';
import locale from '../../public/res/locale/zh-CN.json';
import { resolveSidebarItemTooltipText, resolveUiNameText } from '../../src/gui/screen/game/TooltipTextResolver';

test('production frames hand off atomically; stale loads, failures, HD Off and teardown release leases', () => {
    const savedManifest = (uiArt as any).manifest, savedEnabled = (uiArt as any).readEnabled;
    const entries = Array.from({ length: 4 }, (_, i) => ({ id: `clock-${i}`, width: 60, height: 48, sequence: 'clock' }));
    (uiArt as any).manifest = { revision: 'test', assets: entries.map(e => ({ ...e, logicalWidth: 60, logicalHeight: 48 })) };
    let enabled = true;
    (uiArt as any).readEnabled = () => enabled;
    const texture = new THREE.Texture({ width: 240, height: 192 } as any);
    const options = { camera: new THREE.PerspectiveCamera(), texture,
        textureArea: { x: 0, y: 0, width: 60, height: 48 }, align: { x: 0, y: -1 }, offset: { x: 0, y: 0 } };
    const original = new THREE.Mesh(SpriteUtils.createSpriteGeometry(options), new THREE.MeshBasicMaterial());
    let frame = 0;
    const callbacks: any[] = [], releases: number[] = [];
    const acquire = spyOn(uiArt, 'acquire').mockImplementation((_id, callback) => {
        const i = callbacks.push(callback) - 1; releases[i] = 0;
        return () => { releases[i]++; };
    });
    const asset = { bitmap: { width: 240, height: 192 } as ImageBitmap, texture, bytes: 184320 };
    const native = { build: () => original, getFrame: () => frame, setFrame: (v: number) => { frame = v; },
        getSpriteGeometryOptions: () => options, dispose: () => {} };
    const builder = new UiArtSpriteBuilder(native, entries, { getImage: () => ({ x: 0, y: 0 }) });
    try {
        const group = builder.build(); callbacks[0](asset);
        const first = group.children[1];
        builder.setFrame(1);
        expect(builder.isHdActive).toBe(true); expect(original.visible).toBe(false);
        expect(group.children[1]).toBe(first); expect(releases[0]).toBe(0);
        builder.setFrame(1); expect(group.children[1]).toBe(first); expect(callbacks.length).toBe(2);
        builder.setFrame(2); callbacks[1](asset); // Cancelled decode must not replace the displayed frame.
        expect(group.children[1]).toBe(first); expect(releases[1]).toBe(1);
        callbacks[2](asset);
        expect(group.children[1]).not.toBe(first); expect(releases[0]).toBe(1);
        expect(releases[2]).toBe(0); expect(original.visible).toBe(false);
        builder.setFrame(3); callbacks[3](undefined); // Failed optional artwork still falls back.
        expect(builder.isHdActive).toBe(false); expect(original.visible).toBe(true);
        expect(releases[2]).toBe(1); expect(releases[3]).toBe(1);
        builder.setFrame(0); callbacks[4](asset); builder.setFrame(1);
        enabled = false; builder.setFrame(1); callbacks[5](asset);
        expect(builder.isHdActive).toBe(false); expect(releases[4]).toBe(1); expect(releases[5]).toBe(1);
        enabled = true; builder.setFrame(2); builder.dispose(); callbacks[6](asset);
        expect(releases[6]).toBe(1); expect(builder.isHdActive).toBe(false);
        expect(releases.every(n => n === 1)).toBe(true);
    } finally {
        builder.dispose(); acquire.mockRestore(); texture.dispose(); original.geometry.dispose(); original.material.dispose();
        (uiArt as any).manifest = savedManifest; (uiArt as any).readEnabled = savedEnabled;
    }
});

test('explicit factionless locale names are shared by labels and world/sidebar tooltips', () => {
    const strings = new Strings({ 'Name:YURI': 'Yuri', 'GUI:Soviet': 'Soviet', 'Name:NAHAND': 'Soviet Barracks' });
    strings.fromJson(locale);
    for (const [a, b] of [['GAREFN', 'NAREFN'], ['GAPILE', 'NAHAND'], ['AMCV', 'SMCV'], ['GACNST', 'NACNST']]) {
        const key = `Name:${a}`, text = strings.get(key);
        expect(text).toBe(strings.get(`Name:${b}`));
        expect(resolveUiNameText(key, strings)).toBe(text);
        expect(resolveSidebarItemTooltipText({ target: { rules: { uiName: key, cost: 500 } } }, {}, strings)).toBe(`${text}\n$500`);
    }
    expect(strings.get('Name:YURI')).toBe('Yuri');
    expect(strings.get('GUI:Soviet')).toBe('Soviet');
});

import { expect, test, spyOn } from 'bun:test';
import * as THREE from 'three';
import { uiArt } from '../../src/gui/hd/UiArt';
import { UiArtSpriteBuilder } from '../../src/gui/hd/UiArtSpriteBuilder';
import { SpriteUtils } from '../../src/engine/gfx/SpriteUtils';

for (const frame of [{ x: 0, y: 0, width: 60, height: 48 }, { x: 2, y: 3, width: 56, height: 43 }]) {
    test(`60px cameo in a 64px aggregate preserves geometry and UVs (${frame.width}px trim)`, () => {
        const oldManifest = (uiArt as any).manifest, oldEnabled = (uiArt as any).readEnabled;
        (uiArt as any).manifest = { revision: 'geometry', assets: [{ id: 'test.shp', logicalWidth: 60, logicalHeight: 48 }] };
        (uiArt as any).readEnabled = () => true;
        const originalTexture = new THREE.Texture({ width: 512, height: 512 } as any);
        const texture = new THREE.Texture({ width: 240, height: 192 } as any);
        const options = { camera: new THREE.PerspectiveCamera(), texture: originalTexture,
            textureArea: { x: 120, y: 160, width: frame.width, height: frame.height },
            align: { x: 0, y: -1 }, offset: { x: frame.x, y: frame.y } };
        const original = new THREE.Mesh(SpriteUtils.createSpriteGeometry(options), new THREE.MeshBasicMaterial());
        let currentFrame = 0, releases = 0;
        const acquire = spyOn(uiArt, 'acquire').mockImplementation((_id, ready) => {
            ready({ bitmap: { width: 240, height: 192 } as ImageBitmap, texture, bytes: 240 * 192 * 4 });
            return () => { releases++; };
        });
        const native = { build: () => original, getFrame: () => currentFrame,
            setFrame: (value: number) => { currentFrame = value; }, getSpriteGeometryOptions: () => options,
            dispose: () => {}, getSize: () => ({ width: 64, height: 48 }) };
        const builder = new UiArtSpriteBuilder(native,
            [{ id: 'test.shp', width: 60, height: 48 }, { id: 'test.shp', width: 64, height: 48 }],
            { width: 64, height: 48, getImage: () => frame });
        try {
            const group = builder.build();
            expect(builder.isHdActive).toBe(true);
            const overlay = group.children[1] as THREE.Mesh;
            expect(Array.from(overlay.geometry.getAttribute('position').array))
                .toEqual(Array.from(original.geometry.getAttribute('position').array));
            const uv = overlay.geometry.getAttribute('uv');
            const u = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
            const v = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
            expect(Math.min(...u)).toBeCloseTo(frame.x / 60);
            expect(Math.max(...u)).toBeCloseTo((frame.x + frame.width) / 60);
            expect(Math.min(...v)).toBeCloseTo(frame.y / 48);
            expect(Math.max(...v)).toBeCloseTo((frame.y + frame.height) / 48);
            builder.setFrame(1);
            expect(builder.isHdActive).toBe(false);
            expect(original.visible).toBe(true);
            expect(releases).toBe(1);
        } finally {
            builder.dispose(); acquire.mockRestore();
            original.geometry.dispose(); original.material.dispose(); originalTexture.dispose(); texture.dispose();
            (uiArt as any).manifest = oldManifest; (uiArt as any).readEnabled = oldEnabled;
        }
    });
}

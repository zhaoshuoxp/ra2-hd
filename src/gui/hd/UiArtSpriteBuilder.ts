import * as THREE from 'three';
import { SpriteUtils } from '@/engine/gfx/SpriteUtils';
import { uiArt, type UiCameoSource } from './UiArt';
import { UiRadarTransition } from './UiRadarTransition';
import type { Palette } from '@/data/Palette';
type Artwork = { bitmap: ImageBitmap; texture: THREE.Texture; overlayTexture?: THREE.Texture };
// Modest exposure correction for these two dark HD construction cameos only.
const cameoLightGain: Readonly<Record<string, number>> = { 'npwricon.shp': 1.3, 'asaticon.shp': 1.3 };
// UI-only RGB sampling; the original builder supplies geometry and frame semantics.
export class UiArtSpriteBuilder {
    private root?: THREE.Group;
    private original?: THREE.Object3D;
    private overlay?: THREE.Mesh;
    private release?: () => void;
    private pendingRelease?: () => void;
    private request = 0;
    private drawnSequence?: string;
    private unsubscribe?: () => void;
    private activeKey?: string;
    private asset?: Artwork;
    private transition?: UiRadarTransition;
    private drawnFrame = -1;
    private light = 1;
    private opacity = 1;
    private visible = true;
    constructor(private native: any, private frames: UiCameoSource[], private source: any, private palette?: Palette) {}
    build() {
        this.original = this.native.build();
        this.root = new THREE.Group(); this.root.add(this.original!);
        this.unsubscribe = uiArt.subscribe(() => this.refresh());
        this.refresh(); return this.root;
    }
    private clear() {
        this.pendingRelease?.(); this.pendingRelease = undefined;
        this.release?.(); this.release = undefined;
        this.drawnSequence = undefined;
        this.asset = undefined;
        this.transition?.dispose(); this.transition = undefined; this.drawnFrame = -1;
        this.clearOverlay();
    }
    private clearOverlay() {
        if (this.overlay) {
            this.root?.remove(this.overlay); this.overlay.geometry.dispose();
            (this.overlay.material as THREE.Material).dispose(); this.overlay = undefined;
        }
        if (this.original) this.original.visible = true;
    }
    private refresh() {
        // Widgets often select their initial state before creating the native mesh.
        // Do not cache that key until there is a root to receive the decoded asset.
        if (!this.root) return;
        const entry = this.frames[this.native.getFrame()];
        const key = this.visible && entry && uiArt.enabled && uiArt.has(entry.id, entry.atlas?.width ?? entry.width, entry.atlas?.height ?? entry.height)
            ? `${uiArt.revision}/${entry.id}` : undefined;
        if (key === this.activeKey) {
            if (this.asset && !this.pendingRelease && this.drawnFrame !== this.native.getFrame()) this.draw(this.asset);
            return;
        }
        const request = ++this.request;
        this.pendingRelease?.(); this.pendingRelease = undefined;
        // Keep the last decoded frame only within an explicitly registered animation.
        // Unrelated cameos, missing assets and HD Off still fall back immediately.
        const retain = key && entry.sequence && entry.sequence === this.drawnSequence && this.asset;
        this.activeKey = key;
        if (!retain) this.clear();
        if (!key) return;
        const overlayId = uiArt.overlayId(entry.id);
        let base: Artwork | undefined, overlayTexture: THREE.Texture | undefined;
        let baseReady = false, overlayReady = !overlayId, completed = false;
        let releaseNew: (() => void) | undefined;
        const drawReady = () => {
            if (!baseReady || !overlayReady || !this.root || this.request !== request) return;
            this.pendingRelease = undefined;
            this.clear();
            completed = true;
            if (!base || (overlayId && !overlayTexture)) { releaseNew?.(); return; }
            this.release = releaseNew;
            this.asset = { ...base, overlayTexture }; this.draw(this.asset);
        };
        const releaseBase = uiArt.acquire(entry.id, asset => { base = asset; baseReady = true; drawReady(); }, true);
        const releaseOverlay = overlayId ? uiArt.acquire(overlayId, asset => {
            overlayTexture = asset?.texture; overlayReady = true; drawReady();
        }, true) : undefined;
        releaseNew = () => { releaseBase(); releaseOverlay?.(); };
        if (completed) {
            if (this.asset) this.release = releaseNew;
            else releaseNew();
        } else this.pendingRelease = releaseNew;
    }

    private draw(asset: Artwork) {
        this.clearOverlay();
        const entry = this.frames[this.native.getFrame()];
        let texture = asset.texture;
        if (entry.transitionBase !== undefined) {
            if (!this.palette) return;
            try {
                this.transition ??= new UiRadarTransition(asset.bitmap, this.source, this.palette);
                if (this.native.getFrame() !== entry.transitionBase)
                    texture = this.transition.update(this.native.getFrame(), entry.transitionBase);
            } catch { return; }
        }
        const options = this.native.getSpriteGeometryOptions(this.native.getFrame());
        const nativeSize = options.textureArea;
        // Cameos are full-canvas art; preserve the original trimmed rectangle exactly.
        // Aggregate SHP dimensions come from its first member (often 64px).
        // Validate and sample using this frame's original canvas, e.g. 60px.
        const sx = asset.bitmap.width / (entry.atlas?.width ?? entry.width);
        const sy = asset.bitmap.height / (entry.atlas?.height ?? entry.height);
        const frame = this.source.getImage(this.native.getFrame());
        const commandBackground = entry.id === 'allied-bttnbkgd';
        const geometry = SpriteUtils.createSpriteGeometry({ ...options, texture,
            logicalSize: { width: nativeSize.width, height: nativeSize.height },
            // The repeat artwork's outer columns contain authored vertical edges.
            // A central strip preserves its horizontal chrome without tile seams.
            textureArea: { x: ((entry.atlas?.x ?? 0) + (commandBackground ? entry.width / 2 : frame.x)) * sx,
                y: ((entry.atlas?.y ?? 0) + frame.y) * sy,
                width: (commandBackground ? 1 : nativeSize.width) * sx, height: nativeSize.height * sy } });
        // ImageBitmap uploads ignore Texture.flipY; correct only the UI sample coordinates.
        const uv = geometry.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true,
            opacity: this.opacity, color: new THREE.Color().setScalar(this.artworkLight()), toneMapped: false });
        if (entry.sequence?.endsWith('-gclock2')) material.depthWrite = false;
        if (/^allied-button\d+$/.test(entry.id) && this.palette) {
            let left = frame.width, top = frame.height, right = 0, bottom = 0;
            // Native blue icon bounds exclude the full-canvas black background
            // and rails embedded in each authored button state.
            for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
                const color = this.palette.getColor(frame.imageData[y * frame.width + x]);
                if (color.b > color.r + 24 && color.b >= color.g && color.b > 64) {
                    left = Math.min(left, x); top = Math.min(top, y);
                    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
                }
            }
            if (right > left && bottom > top) {
                const clip = new THREE.Vector4(
                    ((entry.atlas?.x ?? 0) + frame.x + Math.max(0, left - 1)) * sx / asset.bitmap.width,
                    ((entry.atlas?.y ?? 0) + frame.y + Math.max(0, top - 1)) * sy / asset.bitmap.height,
                    ((entry.atlas?.x ?? 0) + frame.x + Math.min(frame.width, right + 1)) * sx / asset.bitmap.width,
                    ((entry.atlas?.y ?? 0) + frame.y + Math.min(frame.height, bottom + 1)) * sy / asset.bitmap.height);
                material.customProgramCacheKey = () => 'ui-allied-command-icon-v1';
                material.onBeforeCompile = shader => {
                    shader.uniforms.commandIconClip = { value: clip };
                    shader.fragmentShader = 'uniform vec4 commandIconClip;\n' + shader.fragmentShader;
                    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
                        if (vMapUv.x < commandIconClip.x || vMapUv.y < commandIconClip.y
                            || vMapUv.x > commandIconClip.z || vMapUv.y > commandIconClip.w) discard;
                        vec4 icon = texture2D(map, vMapUv);
                        float high = max(icon.r, max(icon.g, icon.b));
                        float low = min(icon.r, min(icon.g, icon.b));
                        if (high < 0.2 && high - low < 0.08) discard;
                        diffuseColor *= icon;
                    `);
                };
            }
        }
        if (asset.overlayTexture) {
            // Blend a shared rank layer in the same draw, before lighting/opacity.
            // Both maps use the original cameo UVs; no extra geometry or hit area.
            material.customProgramCacheKey = () => 'ui-cameo-overlay-v1';
            material.onBeforeCompile = shader => {
                shader.uniforms.cameoOverlay = { value: asset.overlayTexture };
                shader.fragmentShader = 'uniform sampler2D cameoOverlay;\n' + shader.fragmentShader;
                shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
                    vec4 cameoBase = texture2D(map, vMapUv);
                    vec4 cameoRank = texture2D(cameoOverlay, vMapUv);
                    float cameoAlpha = cameoRank.a + cameoBase.a * (1.0 - cameoRank.a);
                    vec3 cameoColor = (cameoRank.rgb * cameoRank.a
                        + cameoBase.rgb * cameoBase.a * (1.0 - cameoRank.a)) / max(cameoAlpha, 0.00001);
                    diffuseColor *= vec4(cameoColor, cameoAlpha);
                `);
            };
        }
        this.overlay = new THREE.Mesh(geometry, material); this.overlay.frustumCulled = false;
        // The Allied white/red rails are two native rows above their retail
        // registration. Keep the native top inset under this UI-only overlay.
        if (commandBackground) this.overlay.position.y = 2;
        this.root!.add(this.overlay); this.original!.visible = commandBackground;
        this.drawnFrame = this.native.getFrame();
        this.drawnSequence = entry.sequence;
    }
    setVisible(value: boolean) { this.visible = value; this.refresh(); }
    setFrame(frame: number) { this.native.setFrame(frame); this.refresh(); }
    get isHdActive() { return !!this.overlay; }
    getFrame() { return this.native.getFrame(); }
    get frameCount() { return this.native.frameCount; }
    getSize() { return this.native.getSize(); }
    setOffset(v: any) { this.native.setOffset(v); }
    setAlign(x: number, y: number) { this.native.setAlign(x,y); }
    setForceTransparent(v: boolean) { this.native.setForceTransparent(v); }
    setOpacity(v: number) { this.opacity = v; this.native.setOpacity(v); if (this.overlay) (this.overlay.material as THREE.MeshBasicMaterial).opacity = v; }
    private artworkLight(): number {
        const id = this.frames[this.native.getFrame()]?.id;
        return this.light * (cameoLightGain[id] ?? 1);
    }
    setExtraLight(v: THREE.Vector3) {
        this.native.setExtraLight(v); this.light = 1 + v.x;
        if (this.overlay) (this.overlay.material as THREE.MeshBasicMaterial).color.setScalar(this.artworkLight());
    }
    dispose() { this.request++; this.unsubscribe?.(); this.clear(); this.native.dispose(); this.root = undefined; }
}

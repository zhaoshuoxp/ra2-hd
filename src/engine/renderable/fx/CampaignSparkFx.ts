import * as THREE from 'three';
import { Coords } from '@/game/Coords';
import type { CampaignSparkSystemVisual, CampaignSparkVisual } from '@/game/event/TriggerParticleEvent';
import { campaignSparkLightCacheIndex, campaignSparkLightFragment } from './campaignSparkLight';

// A source-colored native point follows simulation state. Rendering never
// creates particles, advances their lifetime or consumes the game's RNG.
export class CampaignSparkFx {
    private container?: any;
    private group?: THREE.Group;
    private points = new Map<CampaignSparkVisual, THREE.Sprite>();
    private flash?: THREE.Sprite;
    private flashRadius = { value: 0 };
    private disposed = false;
    constructor(private state: CampaignSparkSystemVisual, private name: string, private onDispose?: () => void) {}
    setContainer(container: any): void { this.container = container; }
    get3DObject(): THREE.Group | undefined { return this.group; }
    private sprite(): THREE.Sprite {
        const material = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(material); sprite.scale.setScalar(Coords.ISO_WORLD_SCALE);
        return sprite;
    }
    create3DObject(): void {
        if (this.group || this.disposed) return;
        this.group = new THREE.Group(); this.group.name = 'fx_campaign_sparks'; this.group.userData.source = this.name;
        this.flash = this.sprite();
        if (this.state.oneFrameLight) {
            const material = this.flash.material;
            material.depthTest = false; material.blending = THREE.AdditiveBlending; material.toneMapped = false;
            material.customProgramCacheKey = () => 'campaign-source-one-frame-light-v1';
            material.onBeforeCompile = shader => {
                shader.uniforms.campaignFlashRadius = this.flashRadius;
                shader.vertexShader = 'varying vec2 campaignFlashUv;\n' + shader.vertexShader.replace(
                    '#include <uv_vertex>', '#include <uv_vertex>\ncampaignFlashUv = uv;');
                shader.fragmentShader = 'varying vec2 campaignFlashUv;\nuniform float campaignFlashRadius;\n'
                    + shader.fragmentShader.replace('#include <alphamap_fragment>',
                        '#include <alphamap_fragment>\n' + campaignSparkLightFragment);
            };
            // Flash the world beneath the existing multiplicative shroud. Top
            // mission markers retain their higher source layer.
            this.flash.renderOrder = 999998;
        }
        this.flash.visible = false; this.group.add(this.flash);
    }
    update(): void {
        if (this.disposed) return;
        if (!this.state.active) { this.dispose(); return; }
        if (!this.group) return;
        for (const [state, sprite] of this.points) if (!state.active || !this.state.sparks.includes(state)) {
            this.group.remove(sprite); sprite.material.dispose(); this.points.delete(state);
        }
        for (const state of this.state.sparks) {
            let sprite = this.points.get(state);
            if (!sprite) { sprite = this.sprite(); this.points.set(state, sprite); this.group.add(sprite); }
            sprite.position.copy(state.position);
            sprite.material.color.setRGB(state.color[0] / 255, state.color[1] / 255, state.color[2] / 255, THREE.SRGBColorSpace);
        }
        this.flash!.position.copy(this.state.position);
        if (this.state.oneFrameLight) {
            const index = campaignSparkLightCacheIndex(this.state.lightSize, this.state.particleCap, this.points.size);
            const radius = index < 0 ? 0 : 1 + 2 * index;
            this.flashRadius.value = radius; this.flash!.visible = radius > 0;
            const pixelScale = Coords.ISO_WORLD_SCALE * Coords.COS_ISO_CAMERA_BETA;
            this.flash!.scale.set((radius + 1) * 2 * pixelScale, (radius + 1) * pixelScale, 1);
            this.group.userData.lightCacheIndex = index;
            this.group.userData.lightRadius = radius;
            this.group.userData.lightPhasePolicy = 'SOURCE_INITIAL_PHASE29_NATIVE_RANDOM_PHASE_QUALIFIED';
        } else {
            this.flash!.visible = this.state.flash && this.state.lightSize > 0;
            this.flash!.scale.setScalar(Coords.ISO_WORLD_SCALE * 2); this.flash!.material.opacity = .25;
        }
        this.group.userData.sourcePoints = this.points.size; this.group.userData.lightSize = this.state.lightSize;
    }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true; this.container?.remove(this);
        for (const sprite of this.points.values()) sprite.material.dispose();
        this.points.clear(); this.flash?.material.dispose(); this.group = undefined; this.flash = undefined;
        this.container = undefined; this.onDispose?.(); this.onDispose = undefined;
    }
}

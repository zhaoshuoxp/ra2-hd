import * as THREE from 'three';
import type { CampaignChronoScreenState } from '../../game/campaign/CampaignYrRuntime';
import { MAX_RENDER_PIXELS } from './RenderResolution';

// One frozen RGBA framebuffer at the existing maximum render allocation.
// Reserve this within the world cap before terrain and actor publication.
export const CHRONO_SCREEN_RESERVED_BYTES = MAX_RENDER_PIXELS * 4;
export function campaignChronoScreenBytes(game: any): number {
    return game.campaign?.yr && [...game.campaign.definition.triggers.values()].some((trigger: any) =>
        trigger.actions.some((action: any) => action.opcode === 127)) ? CHRONO_SCREEN_RESERVED_BYTES : 0;
}

export class CampaignChronoScreenFx {
    private texture?: THREE.FramebufferTexture;
    private captureKey?: string;
    private viewport = new THREE.Vector4();
    private sourcePosition = new THREE.Vector2();
    private scene = new THREE.Scene();
    private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    private geometry = new THREE.PlaneGeometry(2, 2);
    private material = new THREE.RawShaderMaterial({
        depthTest: false, depthWrite: false, blending: THREE.NoBlending,
        uniforms: { source: { value: null }, size: { value: new THREE.Vector2(1, 1) },
            white: { value: 0 }, warp: { value: 0 } },
        vertexShader: `precision highp float;
            attribute vec3 position;
            attribute vec2 uv;
            varying vec2 sourceUv;
            void main() { sourceUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: `precision highp float;
            uniform sampler2D source;
            uniform vec2 size;
            uniform float white;
            uniform float warp;
            varying vec2 sourceUv;
            void main() {
                vec2 p = (sourceUv - 0.5) * size * vec2(1.0, -1.0);
                float radius = dot(p, p) / dot(size * 0.5, size * 0.5);
                float radial = (1.0 - radius) * 5.0;
                float angle = radial * radial * warp;
                float c = cos(angle), s = sin(angle);
                vec2 q = vec2(c * p.x + s * p.y, c * p.y - s * p.x);
                vec2 sampleUv = q * vec2(1.0, -1.0) / size + 0.5;
                vec3 color = texture2D(source, clamp(sampleUv, 0.5 / size, 1.0 - 0.5 / size)).rgb;
                gl_FragColor = vec4(mix(color, vec3(1.0), white), 1.0);
            }`,
    });
    private current?: CampaignChronoScreenState;
    constructor(private state: () => CampaignChronoScreenState | undefined) {
        const mesh = new THREE.Mesh(this.geometry, this.material);
        mesh.frustumCulled = false;
        this.scene.add(mesh);
    }
    async prepare(renderer: THREE.WebGLRenderer): Promise<void> {
        await renderer.compileAsync(this.scene, this.camera);
    }
    render(renderer: THREE.WebGLRenderer): void {
        const state = this.current = this.state();
        if (!state) { this.releaseTexture(); return; }
        renderer.getCurrentViewport(this.viewport);
        const width = Math.max(1, Math.floor(this.viewport.z)), height = Math.max(1, Math.floor(this.viewport.w));
        if (width * height * 4 > CHRONO_SCREEN_RESERVED_BYTES) throw Error('Chrono screen exceeds the reserved render allocation');
        const key = state.key + (state.phase === 'in' ? '/in' : '/out');
        if (!this.texture || this.texture.image.width !== width || this.texture.image.height !== height) {
            this.releaseTexture();
            this.texture = new THREE.FramebufferTexture(width, height);
            this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
            this.material.uniforms.source.value = this.texture;
            this.material.uniforms.size.value.set(width, height);
        }
        if (this.captureKey !== key) {
            renderer.copyFramebufferToTexture(this.texture, this.sourcePosition.set(this.viewport.x, this.viewport.y));
            this.captureKey = key;
        }
        this.material.uniforms.white.value = state.white;
        this.material.uniforms.warp.value = state.warp;
        renderer.render(this.scene, this.camera);
    }
    debugGetState(): unknown {
        return { state: this.current, gpuBytes: this.texture ? this.texture.image.width * this.texture.image.height * 4 : 0,
            reservedBytes: CHRONO_SCREEN_RESERVED_BYTES, captureKey: this.captureKey };
    }
    private releaseTexture(): void {
        this.texture?.dispose(); this.texture = undefined; this.captureKey = undefined;
        this.material.uniforms.source.value = null;
    }
    dispose(): void {
        this.releaseTexture(); this.geometry.dispose(); this.material.dispose(); this.scene.clear();
    }
}

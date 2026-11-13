import * as THREE from 'three';
import Stats from 'stats.js';
import { EventDispatcher } from '../../util/event';
import { RendererError } from './RendererError';
import { renderOutput, type RenderResolution } from './RenderResolution';
import { HdSpriteProgramWarmup } from './batch/HdSpriteProgramWarmup';
import { PaletteSpriteProgramWarmup } from './batch/PaletteSpriteProgramWarmup';
import { CombatProgramWarmup } from './batch/CombatProgramWarmup';
import { installShadowOnlyPass } from './ShadowOnlyMaterials';
import { VehicleShadowBatcher, supportsNativeInstancing } from './batch/VehicleShadowBatcher';
export class Renderer {
    private width: number;
    private height: number;
    private displayScale = 1;
    private lastDeviceRatio = 0;
    public outputMetrics?: ReturnType<typeof renderOutput>;
    private renderer!: THREE.WebGLRenderer;
    private scenes: Set<any> = new Set();
    private preparingScenes = new Set<any>();
    private hdProgramWarmups = new Map<any, HdSpriteProgramWarmup>();
    private paletteProgramWarmups = new Map<any, PaletteSpriteProgramWarmup>();
    private combatProgramWarmups = new Map<any, CombatProgramWarmup>();
    private isContextLost: boolean = false;
    private renderResolution: RenderResolution = 'original';
    private stats?: Stats;
    private vehicleShadows?: VehicleShadowBatcher;
    private vehicleShadowInstancing = false;
    private _onFrame = new EventDispatcher<string, number>();
    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
    }
    get onFrame() {
        return this._onFrame.asEvent();
    }
    getCanvas(): HTMLCanvasElement {
        return this.renderer.domElement;
    }
    getStats(): Stats | undefined {
        return this.stats;
    }
    supportsInstancing(): boolean {
        if (!this.renderer) {
            throw new Error('Renderer not yet initialized');
        }
        return supportsNativeInstancing(this.renderer);
    }
    usesLegacyInstancing(): boolean { return false; }
    setVehicleShadowInstancing(enabled: boolean): void {
        this.vehicleShadowInstancing = enabled;
        if (this.vehicleShadows) {
            this.vehicleShadows.enabled = enabled;
            if (!enabled) this.vehicleShadows.clear();
        }
    }
    setVehicleShadowDiagnosticTiming(enabled: boolean): void {
        if (this.vehicleShadows) this.vehicleShadows.diagnosticTiming = enabled;
    }
    vehicleShadowDiagnostics() { return this.vehicleShadows?.diagnostics(); }
    initStats(container: HTMLElement): void {
        if (!this.stats) {
            this.stats = new Stats();
            this.stats.showPanel(0);
            this.stats.dom.style.top = 'auto';
            this.stats.dom.style.bottom = '0px';
            this.stats.dom.classList.add('stats-layer');
            container.appendChild(this.stats.dom);
        }
    }
    destroyStats(): void {
        if (this.stats) {
            if (this.stats.dom.parentNode) {
                this.stats.dom.parentNode.removeChild(this.stats.dom);
            }
            this.stats = undefined;
        }
    }
    init(container: HTMLElement): void {
        const renderer = this.createGlRenderer();
        container.appendChild(renderer.domElement);
        renderer.domElement.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
        renderer.domElement.addEventListener('mousedown', (event) => {
            event.preventDefault();
        });
        renderer.domElement.addEventListener('wheel', (event) => {
            event.stopPropagation();
        }, { passive: true });
        renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
        renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);
        this.renderer = renderer;
    }
    createGlRenderer(canvas?: HTMLCanvasElement): THREE.WebGLRenderer {
        let renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                preserveDrawingBuffer: true,
                powerPreference: 'high-performance',
            });
        }
        catch (error) {
            throw new RendererError('Failed to initialize WebGL renderer');
        }
        this.applyRenderSize(renderer);
        renderer.autoClear = false;
        renderer.autoClearDepth = false;
        renderer.shadowMap.enabled = true;
        installShadowOnlyPass(renderer);
        this.vehicleShadows = new VehicleShadowBatcher(renderer);
        this.vehicleShadows.enabled = this.vehicleShadowInstancing;
        renderer.localClippingEnabled = true;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.outputColorSpace = (THREE as any).SRGBColorSpace ?? THREE.LinearSRGBColorSpace;
        return renderer;
    }
    setSize(width: number, height: number, displayScale = 1): void {
        this.displayScale = displayScale;
        this.width = width;
        this.height = height;
        if (this.renderer) {
            this.applyRenderSize(this.renderer);
        }
    }
    setRenderResolution(resolution: RenderResolution): void {
        this.renderResolution = resolution;
        if (this.renderer) this.applyRenderSize(this.renderer);
    }
    private applyRenderSize(renderer: THREE.WebGLRenderer): void {
        const gl = renderer.getContext();
        const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
        const side = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
        this.lastDeviceRatio = window.devicePixelRatio;
        const output = renderOutput(this.width * this.displayScale, this.height * this.displayScale, this.renderResolution,
            window.devicePixelRatio, Math.min(side, viewport[0]), Math.min(side, viewport[1]));
        const ratio = this.displayScale * output.ratio;
        renderer.setDrawingBufferSize(this.width, this.height, ratio);
        // Three floors floating-point products (e.g. 3456 becomes 3455.999999).
        // Allocate the policy's integer dimensions exactly; viewports still use one ratio.
        if (renderer.domElement.width !== output.effective[0]) renderer.domElement.width = output.effective[0];
        if (renderer.domElement.height !== output.effective[1]) renderer.domElement.height = output.effective[1];
        // Report measured allocation, including integer rounding by WebGL/Three.
        this.outputMetrics = { ...output, effective: [gl.drawingBufferWidth, gl.drawingBufferHeight] };
        const canvas = renderer.domElement;
        canvas.style.width = `${this.width}px`;
        canvas.style.height = `${this.height}px`;
        canvas.dataset.logicalWidth = String(this.width);
        canvas.dataset.logicalHeight = String(this.height);
        canvas.dataset.renderOutput = JSON.stringify(this.outputMetrics);
        window.dispatchEvent(new Event('ra2-render-output'));
    }
    addScene(scene: any): void {
        this.scenes.add(scene);
        scene.create3DObject();
    }
    removeScene(scene: any): void {
        this.vehicleShadows?.removeScene(scene.scene);
        this.hdProgramWarmups.get(scene)?.dispose();
        this.hdProgramWarmups.delete(scene);
        this.paletteProgramWarmups.get(scene)?.dispose();
        this.paletteProgramWarmups.delete(scene);
        this.combatProgramWarmups.get(scene)?.dispose();
        this.combatProgramWarmups.delete(scene);
        this.scenes.delete(scene);
    }
    getScenes(): any[] {
        return [...this.scenes];
    }
    update(deltaTime: number, ...args: any[]): void {
        this.scenes.forEach((scene) => {
            if (this.preparingScenes?.has(scene)) return;
            scene.update(deltaTime, ...args);
        });
        this._onFrame.dispatch('frame', deltaTime);
    }
    render(): void {
        // Monitor migration may change backing density without a CSS resize event.
        if (this.lastDeviceRatio !== window.devicePixelRatio) this.applyRenderSize(this.renderer);
        if (this.isContextLost)
            return;
        this.renderer.state.buffers.depth.setMask(true);
        this.renderer.clear();
        this.scenes.forEach((scene) => {
            if (this.preparingScenes?.has(scene)) return;
            // A transparent pass may disable depth writes; gl.clear respects that mask.
            this.renderer.state.buffers.depth.setMask(true);
            this.renderer.clearDepth();
            const viewportY = this.height - scene.viewport.y - scene.viewport.height;
            this.renderer.setViewport(scene.viewport.x, viewportY, scene.viewport.width, scene.viewport.height);
            this.renderer.render(scene.scene, scene.camera);
            scene.screenEffect?.render(this.renderer);
        });
    }
    flush(): void {
        this.renderer.renderLists.dispose();
    }
    async prepareScene(scene: any, isCancelled: () => boolean = () => false,
        settleResources?: () => Promise<void>): Promise<void> {
        const preparing = this.preparingScenes ??= new Set();
        if (preparing.has(scene)) throw new Error('Scene preparation is already running');
        preparing.add(scene);
        try { await this.prepareScenePrograms(scene, isCancelled, settleResources); }
        finally { preparing.delete(scene); }
    }
    private async prepareScenePrograms(scene: any, isCancelled: () => boolean,
        settleResources?: () => Promise<void>): Promise<void> {
        // The loading UI keeps rendering while parallel compilation waits.
        // Freeze this scene so batch replacement cannot dispose its pending programs.
        scene.update(0);
        if (settleResources) {
            // First updates bind actual unit and building renderers. Their async
            // HD callbacks can replace materials even while scene updates stop.
            await settleResources();
            if (isCancelled()) return;
            // Publish settled materials into batches before compiling them.
            scene.update(0);
        }
        await this.renderer.compileAsync(scene.scene, scene.camera);
        if (!isCancelled()) await scene.screenEffect?.prepare(this.renderer);
        if (isCancelled()) return;
        if (!this.hdProgramWarmups.has(scene)) {
            const warmup = HdSpriteProgramWarmup.create(scene.scene);
            if (warmup) {
                try {
                    await warmup.prepare(this.renderer, scene.camera, scene.scene);
                    if (isCancelled()) warmup.dispose();
                    else this.hdProgramWarmups.set(scene, warmup);
                } catch (error) {
                    warmup.dispose();
                    throw error;
                }
            }
        }
        if (isCancelled()) return;
        if (this.hdProgramWarmups.has(scene) && !this.paletteProgramWarmups.has(scene)) {
            const warmup = PaletteSpriteProgramWarmup.create(scene.scene);
            if (warmup) {
                try {
                    await warmup.prepare(this.renderer, scene.camera, scene.scene);
                    if (isCancelled()) warmup.dispose();
                    else this.paletteProgramWarmups.set(scene, warmup);
                } catch (error) {
                    warmup.dispose();
                    throw error;
                }
            }
        }
        if (isCancelled()) return;
        if (this.hdProgramWarmups.has(scene) && !this.combatProgramWarmups.has(scene)) {
            const warmup = CombatProgramWarmup.create(scene.scene);
            if (warmup) {
                try {
                    await warmup.prepare(this.renderer, scene.camera, scene.scene);
                    if (isCancelled()) warmup.dispose();
                    else this.combatProgramWarmups.set(scene, warmup);
                } catch (error) {
                    warmup.dispose();
                    throw error;
                }
            }
        }
    }
    private releaseHdProgramWarmups(): void {
        for (const warmup of this.hdProgramWarmups.values()) warmup.dispose();
        this.hdProgramWarmups.clear();
        for (const warmup of this.paletteProgramWarmups.values()) warmup.dispose();
        this.paletteProgramWarmups.clear();
        for (const warmup of this.combatProgramWarmups.values()) warmup.dispose();
        this.combatProgramWarmups.clear();
    }
    dispose(): void {
        this.vehicleShadows?.dispose();
        this.releaseHdProgramWarmups();
        this.renderer.domElement.remove();
        this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
        this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
        this.renderer.dispose();
        this.destroyStats();
    }
    private handleContextLost = (event: Event): void => {
        event.preventDefault();
        this.isContextLost = true;
    };
    private handleContextRestored = (): void => {
        const canvas = this.renderer.domElement;
        this.vehicleShadows?.dispose();
        this.releaseHdProgramWarmups();
        this.renderer.dispose();
        this.renderer = this.createGlRenderer(canvas);
        this.isContextLost = false;
    };
}

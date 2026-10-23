import * as THREE from 'three';
import Stats from 'stats.js';
import { EventDispatcher } from '../../util/event';
import { RendererError } from './RendererError';
import { renderOutput, type RenderResolution } from './RenderResolution';
import { HdSpriteProgramWarmup } from './batch/HdSpriteProgramWarmup';
import { PaletteSpriteProgramWarmup } from './batch/PaletteSpriteProgramWarmup';
import { CombatProgramWarmup } from './batch/CombatProgramWarmup';
export class Renderer {
    private width: number;
    private height: number;
    private displayScale = 1;
    private lastDeviceRatio = 0;
    public outputMetrics?: ReturnType<typeof renderOutput>;
    private renderer!: THREE.WebGLRenderer;
    private scenes: Set<any> = new Set();
    private hdProgramWarmups = new Map<any, HdSpriteProgramWarmup>();
    private paletteProgramWarmups = new Map<any, PaletteSpriteProgramWarmup>();
    private combatProgramWarmups = new Map<any, CombatProgramWarmup>();
    private isContextLost: boolean = false;
    private renderResolution: RenderResolution = 'original';
    private stats?: Stats;
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
        return !!this.renderer.extensions.get('ANGLE_instanced_arrays');
    }
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
            // A transparent pass may disable depth writes; gl.clear respects that mask.
            this.renderer.state.buffers.depth.setMask(true);
            this.renderer.clearDepth();
            const viewportY = this.height - scene.viewport.y - scene.viewport.height;
            this.renderer.setViewport(scene.viewport.x, viewportY, scene.viewport.width, scene.viewport.height);
            this.renderer.render(scene.scene, scene.camera);
        });
    }
    flush(): void {
        this.renderer.renderLists.dispose();
    }
    async prepareScene(scene: any, isCancelled: () => boolean = () => false): Promise<void> {
        scene.update(0);
        await this.renderer.compileAsync(scene.scene, scene.camera);
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
        this.releaseHdProgramWarmups();
        this.renderer.dispose();
        this.renderer = this.createGlRenderer(canvas);
        this.isContextLost = false;
    };
}

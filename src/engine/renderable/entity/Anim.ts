import { uiArt } from '@/gui/hd/UiArt';
import { acquireCommandMarkerHd } from './CommandMarkerHd';
import { acquireOcclusionMarkerHd } from './OcclusionMarkerHd';
import { WithPosition } from "@/engine/renderable/WithPosition";
import { AnimProps } from "@/engine/AnimProps";
import { Animation, AnimationState } from "@/engine/Animation";
import { ShpRenderable } from "@/engine/renderable/ShpRenderable";
import { ImageFinder } from "@/engine/ImageFinder";
import { DebugUtils } from "@/engine/gfx/DebugUtils";
import { MapSpriteTranslation } from "@/engine/renderable/MapSpriteTranslation";
import { SimpleRunner } from "@/engine/animation/SimpleRunner";
import { MathUtils } from "@/engine/gfx/MathUtils";
import { Coords } from "@/game/Coords";
import * as THREE from 'three';
import { ChaosGasMotion } from './ChaosGasMotion';
interface ObjectArt {
    paletteType: string;
    customPaletteName?: string;
    startSound?: string;
    report?: string;
    translucent: boolean;
    translucency: number;
    zAdjust?: number;
    flat: boolean;
    art: any;
    getDrawOffset(): {
        x: number;
        y: number;
    };
}
interface Theater {
    getPalette(paletteType: string, customPaletteName?: string): any;
}
interface Camera {
}
interface DebugFrame {
    value: boolean;
}
interface WorldSound {
    playEffect(sound: string, position: THREE.Vector3, param3?: any, param4?: number, param5?: number): SoundHandle;
}
interface SoundHandle {
    isLoop: boolean;
    stop(): void;
}
interface Palette {
    clone(): Palette;
    remap(colorMap: any): void;
}
export class Anim {
    public objectArt: ObjectArt;
    public extraOffset: {
        x: number;
        y: number;
    };
    public imageFinder: ImageFinder;
    public theater: Theater;
    public camera: Camera;
    public debugFrame: DebugFrame;
    public gameSpeed: number;
    public useSpriteBatching: boolean;
    public extraLight: THREE.Vector3;
    public worldSound?: WorldSound;
    public renderOrder: number = 0;
    public name: string;
    public palette: Palette;
    public withPosition: WithPosition;
    private target?: THREE.Object3D;
    private mainObj?: ShpRenderable;
    private animation?: Animation;
    private animationRunner?: SimpleRunner;
    private shpFile?: any;
    private soundHandle?: SoundHandle;
    private unitHdIdentity?: string;
    private animationArt?: any;
    private gasMotion?: ChaosGasMotion;
    private commandHd?: ReturnType<typeof acquireCommandMarkerHd>;
    private occlusionHd?: ReturnType<typeof acquireOcclusionMarkerHd>;
    constructor(name: string, objectArt: ObjectArt, extraOffset: {
        x: number;
        y: number;
    }, imageFinder: ImageFinder, theater: Theater, camera: Camera, debugFrame: DebugFrame, gameSpeed: number, useSpriteBatching: boolean, extraLight: THREE.Vector3 = new THREE.Vector3(0, 0, 0), worldSound?: WorldSound, palette?: Palette) {
        this.objectArt = objectArt;
        this.extraOffset = extraOffset;
        this.imageFinder = imageFinder;
        this.theater = theater;
        this.camera = camera;
        this.debugFrame = debugFrame;
        this.gameSpeed = gameSpeed;
        this.useSpriteBatching = useSpriteBatching;
        this.extraLight = extraLight;
        this.worldSound = worldSound;
        this.name = name;
        this.palette = palette ?? this.theater.getPalette(this.objectArt.paletteType, this.objectArt.customPaletteName);
        this.withPosition = new WithPosition();
    }
    get3DObject(): THREE.Object3D | undefined {
        return this.target;
    }
    create3DObject(): void {
        let obj = this.get3DObject();
        if (!obj) {
            obj = new THREE.Object3D();
            obj.name = "anim_" + this.name;
            this.target = obj;
            obj.matrixAutoUpdate = false;
            this.withPosition.matrixUpdate = true;
            this.withPosition.applyTo(this);
            this.createObjects(obj);
        }
    }
    setPosition(position: {
        x: number;
        y: number;
        z: number;
    }): void {
        this.withPosition.setPosition(position.x, position.y, position.z);
    }
    getPosition(): THREE.Vector3 {
        return this.withPosition.getPosition();
    }
    update(deltaTime: number): void {
        this.syncOcclusionMarkerHd();
        if (this.animationRunner && this.animation && this.mainObj) {
            const sound = this.objectArt.startSound ?? this.objectArt.report;
            if (sound && !this.soundHandle &&
                this.animation.getState() === AnimationState.NOT_STARTED) {
                this.soundHandle = this.worldSound?.playEffect(sound, this.withPosition.getPosition(), undefined, 1, 0.25);
            }
            this.animationRunner.tick(deltaTime);
            const obj = this.mainObj.get3DObject();
            if (obj) {
                obj.visible = this.animation.getState() !== AnimationState.DELAYED;
            }
            // Some retail effects declare End beyond their resolved SHP. Keep
            // native animation timing while bounding only the rendered sample.
            const frame = Math.min(this.mainObj.frameCount - 1,
                Math.max(0, this.animationRunner.getCurrentFrame()));
            this.mainObj.setFrame(frame);
            if (this.gasMotion) {
                this.gasMotion.update(frame, this.animation.getFrameFraction(deltaTime));
                this.gasMotion.mesh.visible = this.animation.getState() !== AnimationState.DELAYED;
                this.mainObj.get3DObject()!.visible = false;
            }
            const isTranslucent = this.objectArt.translucent;
            const translucency = this.objectArt.translucency;
            if (isTranslucent || translucency > 0) {
                let opacity: number;
                if (isTranslucent) {
                    const props = this.animation.props;
                    opacity = 1 - this.animationRunner.getCurrentFrame() / (props.end - props.start);
                }
                else {
                    opacity = 1 - translucency;
                }
                this.mainObj.setOpacity(opacity);
            }
        }
    }
    private createObjects(parentObj: THREE.Object3D): void {
        const dimensions = { width: 1, height: 1 };
        if (this.debugFrame.value) {
            const wireframe = DebugUtils.createWireframe(dimensions, 0);
            parentObj.add(wireframe);
        }
        const spriteTranslation = new MapSpriteTranslation(dimensions.width, dimensions.height);
        const { spriteOffset, anchorPointWorld } = spriteTranslation.compute();
        const anchorOffset = this.computeSpriteAnchorOffset(spriteOffset);
        const container = new THREE.Object3D();
        container.matrixAutoUpdate = false;
        this.mainObj = this.createMainObject(anchorOffset);
        if (this.mainObj) {
            this.mainObj.setExtraLight(this.extraLight);
            const shouldBatch = this.useSpriteBatching && !this.renderOrder;
            this.mainObj.setBatched(shouldBatch);
            if (shouldBatch) {
                this.mainObj.setBatchPalettes([this.palette]);
            }
            const isTranslucent = this.objectArt.translucent;
            const translucency = this.objectArt.translucency;
            if (isTranslucent || translucency > 0) {
                this.mainObj.setForceTransparent(true);
            }
            this.mainObj.create3DObject();
            if (this.renderOrder) {
                if (shouldBatch) {
                    throw new Error("Render order not supported with batching");
                }
                const shapeMesh = this.mainObj.getShapeMesh();
                shapeMesh.renderOrder = this.renderOrder;
                (shapeMesh as any).material.depthTest = !this.renderOrder;
                (shapeMesh as any).material.transparent = !!this.renderOrder;
            }
            const mainObj3D = this.mainObj.get3DObject();
            if (mainObj3D) {
                container.add(mainObj3D);
            }
            if (this.name === 'CDGAS' && this.imageFinder.hasUnitVxlHd('CAOS')) {
                this.gasMotion = new ChaosGasMotion(this.shpFile, this.palette, this.camera as THREE.Camera,
                    anchorOffset, this.objectArt.flat);
                this.gasMotion.mesh.material.extraLight.copy(this.extraLight);
                container.add(this.gasMotion.mesh);
                mainObj3D!.visible = false;
            }
            container.position.x = anchorPointWorld.x;
            container.position.z = anchorPointWorld.y;
            if (this.objectArt.zAdjust) {
                MathUtils.translateTowardsCamera(container, this.camera as any, -this.objectArt.zAdjust * Coords.ISO_WORLD_SCALE);
            }
            container.updateMatrix();
            parentObj.add(container);
        }
    }
    setExtraLight(light: THREE.Vector3): void {
        this.extraLight = light;
        this.mainObj?.setExtraLight(this.extraLight);
        this.gasMotion?.mesh.material.extraLight.copy(this.extraLight);
    }
    setUnitHdIdentity(identity: string): void {
        if (this.mainObj) throw new Error("Unit HD identity must precede animation creation");
        this.unitHdIdentity = identity;
    }
    setArtOverrides(overrides: Record<string, string>): void {
        if (this.mainObj) throw new Error("Animation art must precede object creation");
        this.animationArt = (this.animationArt ?? this.objectArt.art).clone();
        for (const [key, value] of Object.entries(overrides)) this.animationArt.set(key, value);
    }
    setRenderOrder(order: number): void {
        if (this.mainObj) {
            throw new Error("Render order must be set before 3DObject is created");
        }
        this.renderOrder = order;
    }
    private computeSpriteAnchorOffset(spriteOffset: {
        x: number;
        y: number;
    }): {
        x: number;
        y: number;
    } {
        const drawOffset = this.objectArt.getDrawOffset();
        return {
            x: spriteOffset.x + drawOffset.x + this.extraOffset.x,
            y: spriteOffset.y + drawOffset.y + this.extraOffset.y
        };
    }
    private createMainObject(offset: {
        x: number;
        y: number;
    }): ShpRenderable | undefined {
        let shpFile: any;
        try {
            shpFile = this.shpFile = this.imageFinder.findByObjectArt(this.objectArt as any);
        }
        catch (error) {
            if (error instanceof ImageFinder.MissingImageError) {
                console.warn(error.message);
                return undefined;
            }
            throw error;
        }
        const animProps = new AnimProps(this.animationArt ?? this.objectArt.art, shpFile);
        const renderable = ShpRenderable.factory(shpFile, this.palette, this.camera, offset, animProps.shadow);
        const environment = this.imageFinder.getHdOverride(shpFile);
        if (environment) renderable.setHdOverride(environment);
        if (this.name === 'RING' && shpFile.filename === 'ring.shp' && uiArt.enabled) {
            this.commandHd = acquireCommandMarkerHd(shpFile, this.palette);
            renderable.setHdOverride(this.commandHd.override);
        }
        this.syncOcclusionMarkerHd(renderable);
        if (this.unitHdIdentity) {
            renderable.setHdLease(this.imageFinder.bindUnitAnimationHd(this.unitHdIdentity, this.name,
                shpFile, override => renderable.setHdOverride(override)));
        }
        renderable.setFlat(this.objectArt.flat);
        this.animation = new Animation(animProps, this.gameSpeed as any);
        this.animationRunner = new SimpleRunner();
        this.animationRunner.animation = this.animation;
        return renderable;
    }
    private syncOcclusionMarkerHd(renderable = this.mainObj): void {
        if (this.name !== 'BEHIND' || this.shpFile?.filename !== 'behind.shp' || !renderable
            || Boolean(this.occlusionHd) === uiArt.enabled) return;
        renderable.setForceTransparent(true);
        if (uiArt.enabled) {
            this.occlusionHd = acquireOcclusionMarkerHd(this.shpFile, this.palette);
            renderable.setHdOverride(this.occlusionHd.override);
        } else {
            renderable.setHdOverride(undefined);
            this.occlusionHd?.release(); this.occlusionHd = undefined;
        }
        const mesh = renderable.getShapeMesh() as THREE.Mesh | undefined;
        if (mesh && this.renderOrder) {
            const material = mesh.material as THREE.Material;
            material.depthTest = false; material.transparent = true;
        }
    }
    getAnimProps(): AnimProps | undefined {
        return this.animation?.props;
    }
    getShpFile(): any {
        return this.shpFile;
    }
    remapColor(colorMap: any): void {
        if (this.mainObj) {
            throw new Error("Palette can only be remapped before creating 3DObject");
        }
        const clonedPalette = this.palette.clone();
        clonedPalette.remap(colorMap);
        this.palette = clonedPalette;
    }
    isAnimFinished(): boolean {
        return this.animation?.getState() === AnimationState.STOPPED;
    }
    isAnimNotStarted(): boolean {
        return this.animation?.getState() === AnimationState.NOT_STARTED;
    }
    endAnimationLoop(): void {
        this.animation?.endLoopAndPlayToEnd();
    }
    reset(): void {
        this.animation?.reset();
    }
    dispose(): void {
        this.gasMotion?.dispose();
        this.mainObj?.dispose();
        this.commandHd?.release();
        this.commandHd = undefined;
        this.occlusionHd?.release();
        this.occlusionHd = undefined;
        if (this.soundHandle?.isLoop) {
            this.soundHandle.stop();
        }
    }
}

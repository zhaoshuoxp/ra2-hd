import { UiObject } from "./UiObject";
import { ImageUtils } from "../engine/gfx/ImageUtils";
import { HtmlContainer } from "./HtmlContainer";
import * as THREE from "three";
import { nativeUiCanvas } from './NativeUiImage';
interface Size {
    width: number;
    height: number;
}
export class PointerSprite extends UiObject {
    private hdEnabled: () => boolean = () => false;
    private lastHd = false;
    setHdEnabled(read: () => boolean): void { this.hdEnabled = read; }
    private images: HTMLCanvasElement;
    private size: Size;
    private frameCount: number;
    private currentFrame: number = 0;
    private animationRunner?: any;
    private targetContext?: CanvasRenderingContext2D;
    private defaultCursorCss?: string;
    private defaultCursorScale?: number;
    private defaultCursorHd?: boolean;
    private hdFrames = new Map<number, HTMLCanvasElement>();
    static readonly HTML_ZINDEX = 100;
    static fromShpFile(shpFile: any, palette: any): PointerSprite {
        return new PointerSprite(ImageUtils.convertShpToCanvas(shpFile, palette), { width: shpFile.width, height: shpFile.height }, shpFile.numImages);
    }
    constructor(images: HTMLCanvasElement, size: Size, frameCount: number) {
        super(new THREE.Object3D(), new HtmlContainer());
        this.images = images;
        this.size = size;
        this.frameCount = frameCount;
    }
    setAnimationRunner(animationRunner: any): void {
        this.animationRunner = animationRunner;
    }
    getAnimationRunner(): any {
        return this.animationRunner;
    }
    update(deltaTime: number): void {
        super.update(deltaTime);
        if (this.lastHd !== this.hdEnabled()) this.drawFrame(this.currentFrame);
        if (this.animationRunner) {
            this.animationRunner.tick(deltaTime);
            if (this.animationRunner.shouldUpdate()) {
                this.setFrame(this.animationRunner.getCurrentFrame());
            }
        }
    }
    getSize(): Size {
        return this.size;
    }
    getDefaultCursorCss(scale = 1): string {
        // Native cursors ignore ancestor CSS transforms. Match the sprite display size.
        scale = Math.min(scale, 128 / Math.max(this.size.width, this.size.height));
        if (!this.defaultCursorCss || this.defaultCursorScale !== scale || this.defaultCursorHd !== this.hdEnabled()) {
            this.defaultCursorScale = scale;
            this.defaultCursorHd = this.hdEnabled();
            const canvas = this.images.ownerDocument.createElement("canvas");
            canvas.width = Math.max(1, Math.round(this.size.width * scale));
            canvas.height = Math.max(1, Math.round(this.size.height * scale));
            const context = canvas.getContext("2d", { alpha: true });
            if (!context) throw new Error("Couldn't create native cursor image");
            // Frame 0's tip is at (0, 0), matching Pointer's Default positioning.
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            if (this.hdEnabled()) context.drawImage(this.getHdFrame(0), 0, 0, canvas.width, canvas.height);
            else context.drawImage(this.images, 0, 0, this.size.width, this.size.height, 0, 0, canvas.width, canvas.height);
            this.defaultCursorCss = `url("${canvas.toDataURL("image/png")}") 0 0, default`;
        }
        return this.defaultCursorCss;
    }
    setFrame(frameIndex: number): void {
        if (frameIndex !== this.currentFrame) {
            if (frameIndex < 0 || this.frameCount <= frameIndex) {
                throw new RangeError(`Pointer frame index out of bounds (index=${frameIndex}, length=${this.frameCount})`);
            }
            this.currentFrame = frameIndex;
            this.drawFrame(frameIndex);
        }
    }
    private getHdFrame(frame: number): HTMLCanvasElement {
        let canvas = this.hdFrames.get(frame);
        if (!canvas) {
            const source = this.images.ownerDocument.createElement('canvas');
            source.width = this.size.width; source.height = this.size.height;
            source.getContext('2d')!.drawImage(this.images, frame * this.size.width, 0,
                this.size.width, this.size.height, 0, 0, this.size.width, this.size.height);
            canvas = nativeUiCanvas(source);
            if (this.hdFrames.size >= 64) this.hdFrames.delete(this.hdFrames.keys().next().value!);
            this.hdFrames.set(frame, canvas);
        }
        return canvas;
    }
    private drawFrame(frameIndex: number): void {
        if (this.targetContext) {
            const hd = this.hdEnabled();
            this.lastHd = this.hdEnabled();
            const density = hd ? 4 : 1;
            const canvas = this.targetContext.canvas;
            canvas.width = this.size.width * density; canvas.height = this.size.height * density;
            canvas.style.width = `${this.size.width}px`; canvas.style.height = `${this.size.height}px`;
            canvas.dataset.nativeCursorFrame = String(frameIndex);
            if (hd) this.targetContext.drawImage(this.getHdFrame(frameIndex), 0, 0);
            else this.targetContext.drawImage(this.images, frameIndex * this.size.width, 0,
                this.size.width, this.size.height, 0, 0, this.size.width, this.size.height);
        }
    }
    getFrame(): number {
        return this.currentFrame;
    }
    getFrameCount(): number {
        return this.frameCount;
    }
    create3DObject(): void {
        super.create3DObject();
        if (!this.targetContext) {
            const canvas = document.createElement("canvas");
            const htmlContainer = this.getHtmlContainer();
            htmlContainer.setTranslateMode(true);
            const element = htmlContainer.getElement();
            element.appendChild(canvas);
            element.style.zIndex = String(PointerSprite.HTML_ZINDEX);
            const context = canvas.getContext("2d", { alpha: true });
            if (!context) {
                throw new Error("Couldn't create pointer canvas context");
            }
            this.targetContext = context;
            this.drawFrame(this.currentFrame);
        }
    }
    destroy(): void {
        this.hdFrames.clear();
        super.destroy();
    }
}

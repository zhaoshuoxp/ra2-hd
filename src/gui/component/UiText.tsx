import * as THREE from "three";
import { jsx } from "@/gui/jsx/jsx";
import { UiObject } from "@/gui/UiObject";
import { UiComponent, UiComponentProps } from "@/gui/jsx/UiComponent";
import { HtmlContainer } from "@/gui/HtmlContainer";
import { SpriteUtils } from "@/engine/gfx/SpriteUtils";
import { CanvasUtils } from "@/engine/gfx/CanvasUtils";
import { UI_FONT_FAMILY, UI_FONT_WEIGHT } from "@/engine/gfx/UiTypography";
export type UiTextProps = UiComponentProps & {
    value: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    paddingTop?: number;
    background?: string;
    outlineColor?: string;
    outlineWidth?: number;
    fitText?: boolean;
    textAlign?: CanvasTextAlign;
    textColor: string;
    width: number;
    height: number;
    zIndex?: number;
    onClick?: () => void;
    x?: number;
    y?: number;
};
export class UiText extends UiComponent<UiTextProps> {
    declare ctx: CanvasRenderingContext2D | null;
    declare texture: THREE.Texture;
    declare mesh: THREE.Mesh;
    declare value: string;
    declare textAlign?: CanvasTextAlign;
    private readonly onRenderOutput: () => void;
    constructor(props: UiTextProps) {
        super(props);
        this.value = props.value;
        this.textAlign = props.textAlign;
        this.onRenderOutput = () => this.refreshResolution();
        window.addEventListener('ra2-render-output', this.onRenderOutput);
        this.refreshResolution();
    }
    private refreshResolution() {
        if (!this.ctx) return;
        const output = document.querySelector<HTMLCanvasElement>('canvas[data-render-output]');
        const logicalHeight = Number(output?.dataset.logicalHeight);
        const ratio = output && logicalHeight > 0 ? output.height / logicalHeight : 1;
        const width = Math.max(1, Math.ceil(this.props.width * ratio));
        const height = Math.max(1, Math.ceil(this.props.height * ratio));
        if (this.ctx.canvas.width !== width || this.ctx.canvas.height !== height) {
            // WebGL texture storage has immutable dimensions. Release the old
            // allocation before uploading a larger or smaller glyph canvas.
            this.texture.dispose();
            this.ctx.canvas.width = width;
            this.ctx.canvas.height = height;
            this.updateTexture(this.value, this.textAlign, this.props.textColor);
        }
    }
    createUiObject(): UiObject {
        const obj = new UiObject(new THREE.Object3D(), new HtmlContainer());
        obj.setPosition(this.props.x || 0, this.props.y || 0);
        const width = this.props.width;
        const height = this.props.height;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        this.ctx = canvas.getContext("2d", { alpha: true });
        this.texture = this.createTexture(canvas);
        this.updateTexture(this.props.value, this.props.textAlign, this.props.textColor);
        this.mesh = this.createMesh(width, height);
        return obj;
    }
    createTexture(canvas: HTMLCanvasElement): THREE.Texture {
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        texture.flipY = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        return texture;
    }
    createMesh(width: number, height: number): THREE.Mesh {
        const geometry = SpriteUtils.createRectGeometry(width, height);
        SpriteUtils.addRectUvs(geometry, { x: 0, y: 0, width, height }, { width, height });
        geometry.translate(width / 2, height / 2, 0);
        const material = new THREE.MeshBasicMaterial({
            map: this.texture,
            side: THREE.DoubleSide,
            transparent: true,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        return mesh;
    }
    defineChildren() {
        return jsx("mesh", { zIndex: this.props.zIndex, onClick: this.props.onClick }, this.mesh);
    }
    updateTexture(value: string, textAlign: CanvasTextAlign | undefined, textColor: string) {
        if (!this.ctx)
            return;
        // Rasterize glyphs at the actual output density while preserving logical
        // font metrics, hit boxes and HUD layout. Never upscale a fixed 1x bitmap.
        this.ctx.setTransform(this.ctx.canvas.width / this.props.width, 0, 0,
            this.ctx.canvas.height / this.props.height, 0, 0);
        this.ctx.clearRect(0, 0, this.props.width, this.props.height);
        if (this.props.background) {
            this.ctx.fillStyle = this.props.background;
            this.ctx.fillRect(0, 0, this.props.width, this.props.height);
        }
        let fontSize = this.props.fontSize ?? 12;
        const fontFamily = this.props.fontFamily ?? UI_FONT_FAMILY;
        const fontWeight = this.props.fontWeight ?? UI_FONT_WEIGHT;
        if (this.props.fitText) {
            this.ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
            const measured = this.ctx.measureText(value).width;
            if (measured > this.props.width - 2) fontSize *= (this.props.width - 2) / measured;
        }
        CanvasUtils.drawText(this.ctx, value, 0, 0, {
            color: textColor,
            outlineColor: this.props.outlineColor,
            outlineWidth: this.props.outlineWidth,
            fontFamily,
            fontSize,
            fontWeight,
            paddingTop: this.props.paddingTop ?? 6,
            textAlign: textAlign ?? "center",
            width: this.props.width,
            height: this.props.height,
        });
        this.texture.needsUpdate = true;
    }
    setValue(value: string) {
        if (this.value !== value) {
            this.value = value;
            this.updateTexture(value, this.textAlign, this.props.textColor);
        }
    }
    setTextAlign(textAlign: CanvasTextAlign) {
        if (textAlign !== this.textAlign) {
            this.textAlign = textAlign;
            this.updateTexture(this.value, textAlign, this.props.textColor);
        }
    }
    onDispose() {
        window.removeEventListener('ra2-render-output', this.onRenderOutput);
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
        this.texture.dispose();
    }
}

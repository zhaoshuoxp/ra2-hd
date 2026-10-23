import { UI_FONT_FAMILY, UI_FONT_WEIGHT } from "@/engine/gfx/UiTypography";
import { UiObject } from '@/gui/UiObject';
import { SpriteUtils } from '@/engine/gfx/SpriteUtils';
import * as THREE from 'three';
export class Tooltip extends UiObject {
    private texture?: THREE.Texture;
    private mesh?: THREE.Mesh;
    constructor(private readonly text: string, private readonly color: string, private readonly pointer: any, private readonly viewport: {
        x: number;
        y: number;
        width: number;
        height: number;
    }, private readonly rasterScale = 2) {
        super(new THREE.Object3D());
    }
    override create3DObject(): void {
        if (!this.mesh) {
            const root = this.get3DObject();
            if (!root) {
                throw new Error('Tooltip root object was not created');
            }
            const texture = (this.texture = this.createTexture(this.text, this.color));
            const size = {
                width: texture.userData.logicalWidth,
                height: texture.userData.logicalHeight,
            };
            const mesh = (this.mesh = this.createMesh(texture, size.width, size.height));
            const position = this.computePosition(this.pointer, this.viewport, size);
            mesh.position.x = position.x;
            mesh.position.y = position.y;
            root.add(mesh);
            mesh.updateMatrix();
        }
        super.create3DObject();
    }
    private createMesh(texture: THREE.Texture, width: number, height: number): THREE.Mesh {
        const geometry = SpriteUtils.createRectGeometry(width, height);
        SpriteUtils.addRectUvs(geometry, { x: 0, y: 0, width, height }, { width, height });
        geometry.translate(width / 2, height / 2, 0);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        return mesh;
    }
    private createTexture(text: string, color: string): THREE.Texture {
        const scale = Math.max(2, Math.min(4, Math.ceil(this.rasterScale)));
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { alpha: true });
        if (!context) throw new Error('Failed to create tooltip canvas context');
        context.font = `${UI_FONT_WEIGHT} 12px ${UI_FONT_FAMILY}`;
        const lines = text.split('\n');
        const metrics = lines.map(line => context.measureText(line));
        const cap = context.measureText('A');
        // Measure logically, then rasterize real glyphs at output density.
        // Pointer offsets, box size and hover timing are independent of texture density.
        const lineHeight = cap.actualBoundingBoxAscent + cap.actualBoundingBoxDescent + 10;
        const width = Math.ceil(Math.max(...metrics.map(metric => Math.max(metric.width,
            Math.abs(metric.actualBoundingBoxLeft || 0) + Math.abs(metric.actualBoundingBoxRight || 0))))) + 7;
        const height = Math.floor(lineHeight * lines.length) + 1;
        canvas.width = width * scale;
        canvas.height = height * scale;
        context.scale(scale, scale);
        context.fillStyle = 'black';
        context.fillRect(0, 0, width, height);
        context.font = `${UI_FONT_WEIGHT} 12px ${UI_FONT_FAMILY}`;
        context.fillStyle = color;
        lines.forEach((line, index) => context.fillText(line, 3,
            1 + index * lineHeight + 5 + (metrics[index].actualBoundingBoxAscent || 12 * 0.8)));
        context.strokeStyle = color;
        context.strokeRect(0.5, 0.5, width - 1, height - 1);
        const texture = new THREE.Texture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.userData = { logicalWidth: width, logicalHeight: height, rasterScale: scale };
        texture.needsUpdate = true;
        texture.flipY = false;
        return texture;
    }
    private computePosition(pointer: any, viewport: {
        x: number;
        y: number;
        width: number;
        height: number;
    }, size: {
        width: number;
        height: number;
    }): {
        x: number;
        y: number;
    } {
        const position = { ...pointer.getPosition() };
        if (position.x + 20 + size.width > viewport.x + viewport.width) {
            position.x -= 20 + size.width;
        }
        else {
            position.x += 20;
        }
        if (position.y + 20 + size.height > viewport.y + viewport.height) {
            position.y -= 20 + size.height;
        }
        else {
            position.y += 20;
        }
        return position;
    }
    override destroy(): void {
        super.destroy();
        this.texture?.dispose();
        if (this.mesh) {
            (this.mesh.material as THREE.Material).dispose();
            this.mesh.geometry.dispose();
        }
    }
}

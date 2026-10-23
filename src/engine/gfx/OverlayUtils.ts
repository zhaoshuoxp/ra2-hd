import * as THREE from 'three';
import { Coords } from '@/game/Coords';
import { CanvasUtils } from './CanvasUtils';
import { BufferGeometryUtils } from './BufferGeometryUtils';
export class OverlayUtils {
    static createGroundTarget(radius: number, color: THREE.ColorRepresentation): THREE.Mesh {
        const rings = [1 / 3, 2 / 3, 1].map(scale => this.createGroundCircle(radius * scale, color));
        const ink = new THREE.Color(color).convertSRGBToLinear();
        for (const ring of rings) {
            const colors = ring.geometry.getAttribute('color');
            for (let i = 129; i < 3 * 129; i++) colors.setXYZ(i, ink.r, ink.g, ink.b);
        }
        const target = rings[0];
        const geometry = BufferGeometryUtils.mergeBufferGeometries(rings.map(ring => ring.geometry));
        for (const ring of rings) {
            ring.geometry.dispose();
            if (ring !== target) (ring.material as THREE.Material).dispose();
        }
        target.geometry = geometry;
        target.userData.ringCount = 3;
        return target;
    }
    static createGroundCircle(radius: number, color: THREE.ColorRepresentation): THREE.Mesh {
        // A mesh band has stable logical thickness at every output density.
        // WebGL basic lines remain one drawing-buffer pixel even at 4K.
        const width = 4 * Coords.ISO_WORLD_SCALE;
        const geometry = new THREE.RingGeometry(Math.max(0, radius - width / 2), radius + width / 2, 128, 3);
        const bright = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45);
        const dark = new THREE.Color(0x101820);
        const colors: number[] = [];
        for (let row = 0; row < 4; row++) {
            const shade = row === 0 || row === 3 ? dark : bright;
            for (let i = 0; i <= 128; i++) colors.push(shade.r, shade.g, shade.b);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true,
            depthTest: false, depthWrite: false });
        const ring = new THREE.Mesh(geometry, material);
        ring.rotation.x = Math.PI / 2;
        ring.renderOrder = 1000002;
        ring.frustumCulled = false;
        return ring;
    }
    static createTextBox(text: string, options: any): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 0;
        const context = canvas.getContext('2d', {
            alpha: !options.backgroundColor || !!options.backgroundColor.match(/^rgba/),
        });
        CanvasUtils.drawText(context, text, 0, 0, {
            ...options,
            autoEnlargeCanvas: true,
        });
        return canvas;
    }
}

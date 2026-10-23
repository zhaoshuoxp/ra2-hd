import * as THREE from 'three';
import { ShpBuilder } from '../builder/ShpBuilder';
import { PaletteBasicMaterial } from '../../gfx/material/PaletteBasicMaterial';
import { paletteShaderLib } from '../../gfx/material/paletteShaderLib';
import { textureFromPalette } from '../../gfx/TextureUtils';
import { createSpriteGeometry } from '../../gfx/SpriteUtils';
import { Coords } from '../../../game/Coords';

// Sample the real 40-frame CDGAS animation in its common canvas. Interpolating
// palette colors, not palette indices, preserves expanding/fading cloud edges.
export class ChaosGasMotion {
    readonly mesh: THREE.Mesh<THREE.BufferGeometry, PaletteBasicMaterial>;
    frame = 0;
    fraction = 0;
    private atlas: any;
    constructor(private shp: any, palette: any, camera: THREE.Camera,
        offset: { x: number; y: number }, flat: boolean) {
        ShpBuilder.prepareTexture(shp);
        this.atlas = ShpBuilder.textureCache.get(shp);
        const map = this.atlas.getTexture();
        const geometry = createSpriteGeometry({ camera, texture: map,
            textureArea: { x: 0, y: 0, width: map.image.width, height: map.image.height },
            logicalSize: { width: shp.width, height: shp.height },
            offset: { x: -Math.floor(shp.width / 2) + Math.floor(offset.x),
                y: -Math.floor(shp.height / 2) + Math.floor(offset.y) },
            align: { x: 1, y: -1 }, scale: Coords.ISO_WORLD_SCALE, flat });
        const material = new PaletteBasicMaterial({ map, palette: textureFromPalette(palette),
            transparent: true, depthWrite: false, alphaTest: .01 });
        Object.assign(material.uniforms, {
            gasCanvas: { value: new THREE.Vector2(shp.width, shp.height) },
            gasAtlasSize: { value: new THREE.Vector2(map.image.width, map.image.height) },
            gasRects: { value: [new THREE.Vector4(), new THREE.Vector4()] },
            gasTrims: { value: [new THREE.Vector4(), new THREE.Vector4()] },
            gasBlend: { value: 0 }, gasPhase: { value: 0 },
        });
        const sampling = `
            uniform vec2 gasCanvas, gasAtlasSize;
            uniform vec4 gasRects[2], gasTrims[2];
            uniform float gasBlend, gasPhase;
            vec4 gasColor(vec2 pixel) {
                float index = texture2D(map, vec2((pixel.x + .5) / gasAtlasSize.x,
                    1.0 - (pixel.y + .5) / gasAtlasSize.y)).a;
                return texture2D(palette, vec2(index, .5));
            }
            vec4 gasSample(vec2 pixel, vec4 rect, vec4 trim) {
                vec2 local = pixel - trim.xy;
                if (local.x < 0.0 || local.y < 0.0 || local.x >= trim.z || local.y >= trim.w)
                    return vec4(0.0);
                vec2 p = local - .5, f = fract(p), lo = floor(p);
                vec2 a = clamp(lo, vec2(0.0), trim.zw - 1.0);
                vec2 b = clamp(lo + 1.0, vec2(0.0), trim.zw - 1.0);
                vec4 c00 = gasColor(rect.xy + a), c10 = gasColor(rect.xy + vec2(b.x, a.y));
                vec4 c01 = gasColor(rect.xy + vec2(a.x, b.y)), c11 = gasColor(rect.xy + b);
                c00.rgb *= c00.a; c10.rgb *= c10.a; c01.rgb *= c01.a; c11.rgb *= c11.a;
                return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
            }
        `;
        material.fragmentShader = material.fragmentShader.replace('void main() {', sampling + '\nvoid main() {');
        material.fragmentShader = material.fragmentShader.replace(paletteShaderLib.paletteColorFrag, `
            vec2 pixel = vec2(vMapUv.x, 1.0 - vMapUv.y) * gasCanvas;
            float envelope = sin(clamp(gasPhase / 39.0, 0.0, 1.0) * 3.14159265);
            pixel += envelope * vec2(1.6 * sin(pixel.y * .15 + gasPhase * .65),
                1.2 * cos(pixel.x * .12 - gasPhase * .55));
            vec4 smoke = mix(gasSample(pixel, gasRects[0], gasTrims[0]),
                gasSample(pixel, gasRects[1], gasTrims[1]), gasBlend);
            diffuseColor = vec4(smoke.rgb / max(smoke.a, .001), smoke.a * opacity);
        `);
        material.customProgramCacheKey = () => 'cdgas-native-continuous-motion-v1';
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.name = 'cdgas-continuous-native-cloud';
        this.mesh.matrixAutoUpdate = false; this.mesh.frustumCulled = false;
        this.update(0, 0);
    }
    update(frame: number, fraction: number): void {
        this.frame = Math.min(this.shp.numImages - 1, Math.max(0, frame));
        this.fraction = THREE.MathUtils.clamp(fraction, 0, 1);
        const uniforms = this.mesh.material.uniforms;
        for (let i = 0; i < 2; i++) {
            const index = Math.min(this.shp.numImages - 1, this.frame + i);
            const image = this.shp.getImage(index), area = this.atlas.getTextureArea(index);
            uniforms.gasRects.value[i].set(area.x, area.y, area.width, area.height);
            uniforms.gasTrims.value[i].set(image.x, image.y, image.width, image.height);
        }
        uniforms.gasBlend.value = this.fraction;
        uniforms.gasPhase.value = this.frame + this.fraction;
    }
    dispose(): void {
        this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose();
        // Atlas and palette textures belong to the shared native caches.
    }
}

import * as THREE from 'three';
import { paletteShaderLib } from './paletteShaderLib';

export class TerrainHdMaterial extends THREE.MeshBasicMaterial {
    constructor(texture: THREE.Texture) {
        super({ map: texture, side: THREE.DoubleSide, alphaTest: .5 });
        this.onBeforeCompile = shader => {
            shader.vertexShader = shader.vertexShader.replace('#include <common>',
                '#include <common>\n' + paletteShaderLib.vertexColorMultParsVertex)
                .replace('void main() {', 'void main() {\n' + paletteShaderLib.vertexColorMultVertex);
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
                '#include <common>\n' + paletteShaderLib.vertexColorMultParsFrag)
                .replace('#include <color_fragment>', '#include <color_fragment>\n' + paletteShaderLib.vertexColorMultFrag);
        };
        this.defines = { USE_VERTEX_COLOR_MULT: '' };
    }
    customProgramCacheKey() { return 'tmp-terrain-hd-v1'; }
}

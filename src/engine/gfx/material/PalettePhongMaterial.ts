import * as THREE from 'three';
import { paletteShaderLib } from '@/engine/gfx/material/paletteShaderLib';
import { voxelPaletteParsFragment, voxelPaletteFragment } from './voxelPaletteShader';
interface PalettePhongMaterialParameters extends THREE.MeshPhongMaterialParameters {
    palette?: THREE.Texture;
    paletteCount?: number;
    paletteOffset?: number;
    extraLight?: THREE.Vector3;
    voxelLookup?: THREE.Texture;
}
interface ShaderMaterial {
    uniforms: {
        [uniform: string]: THREE.IUniform;
    };
    vertexShader: string;
    fragmentShader: string;
}
const shaderMaterial: ShaderMaterial = {
    uniforms: THREE.UniformsUtils.merge([
        THREE.ShaderLib.phong.uniforms,
        paletteShaderLib.uniforms,
        { voxelLookup: { value: null }, useVoxelLookup: { value: false } },
    ]),
    vertexShader: THREE.ShaderChunk.meshphong_vert
        .replace("#include <common>", "#include <common>\n" + paletteShaderLib.instanceParsVertex)
        .replace("void main() {", "void main() {\n" + paletteShaderLib.instanceVertex),
    fragmentShader: THREE.ShaderChunk.meshphong_frag
        .replace("#include <common>", "#include <common>\n" + paletteShaderLib.paletteColorParsFrag + voxelPaletteParsFragment)
        .replace("#include <color_fragment>", "#include <color_fragment>\n" + paletteShaderLib.paletteColorFrag)
        .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n" + paletteShaderLib.paletteFullLightFragment)
        .replace("#include <opaque_fragment>", voxelPaletteFragment + "\n#include <opaque_fragment>"),
};
export class PalettePhongMaterial extends THREE.MeshPhongMaterial {
    public uniforms: {
        [uniform: string]: THREE.IUniform;
    };
    public vertexShader: string;
    public fragmentShader: string;
    constructor(parameters: PalettePhongMaterialParameters = {}) {
        const { palette, paletteCount, paletteOffset, extraLight, voxelLookup, ...materialParams } = parameters;
        super(materialParams);
        this.uniforms = THREE.UniformsUtils.clone(shaderMaterial.uniforms);
        this.uniforms.voxelLookup.value = voxelLookup ?? null;
        this.uniforms.useVoxelLookup.value = !!voxelLookup;
        if (palette) {
            this.palette = palette;
        }
        if (paletteCount !== undefined) {
            this.paletteCount = paletteCount;
        }
        if (paletteOffset !== undefined) {
            this.paletteOffset = paletteOffset;
        }
        if (extraLight) {
            this.extraLight.copy(extraLight);
        }
        this.vertexShader = shaderMaterial.vertexShader;
        this.fragmentShader = shaderMaterial.fragmentShader;
        this.type = "PalettePhongMaterial";
    }
    get palette(): THREE.Texture {
        return this.uniforms.palette.value;
    }
    set palette(value: THREE.Texture) {
        this.uniforms.palette.value = value;
    }
    get paletteOffset(): number {
        return this.uniforms.paletteOffsetCount.value[0];
    }
    set paletteOffset(value: number) {
        this.uniforms.paletteOffsetCount.value[0] = value;
    }
    get paletteCount(): number {
        return this.uniforms.paletteOffsetCount.value[1];
    }
    set paletteCount(value: number) {
        this.uniforms.paletteOffsetCount.value[1] = value;
    }
    get extraLight(): THREE.Vector3 {
        return this.uniforms?.extraLight.value;
    }
    set extraLight(value: THREE.Vector3) {
        this.uniforms.extraLight.value = value;
    }
    copy(source: PalettePhongMaterial): this {
        super.copy(source);
        this.fragmentShader = source.fragmentShader;
        this.vertexShader = source.vertexShader;
        this.uniforms = THREE.UniformsUtils.clone(source.uniforms);
        this.palette = source.palette;
        this.uniforms.voxelLookup.value = source.uniforms.voxelLookup.value;
        return this;
    }
}

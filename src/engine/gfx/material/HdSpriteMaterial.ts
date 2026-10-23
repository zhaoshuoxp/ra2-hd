import * as THREE from "three";
import { PaletteBasicMaterial } from "./PaletteBasicMaterial";
import { hdFilterDeclarations, hdFilterFragment } from "./hdSpriteFiltering";
import { paletteShaderLib } from "./paletteShaderLib";
import { hdTileSampling } from './hdTileSampling';

// Preserve the indexed material's light, opacity, alpha-test and batch hooks.
const hdColorFragment = `
  vec4 remapData = texture2D(remapMap, hdRemapUv(vMapUv));
  float remapIndex = (16.0 + floor(remapData.g * 255.0 + 0.5)) / 255.0;
  float paletteRow = paletteOffsetCount.x;
  #ifdef INSTANCE_TRANSFORM
    paletteRow = vInstancePaletteOffset;
  #elif defined(VERTEX_PALETTE_OFFSET)
    paletteRow = vVertexPaletteOffset;
  #endif
  vec3 ownerColor = texture2D(palette, vec2(remapIndex,
      (paletteRow + 0.5) / paletteOffsetCount.y)).rgb;
  #ifdef INDEXED_COVERAGE
  diffuseColor = texture2D(palette, vec2(sampledDiffuseColor.a, (paletteRow + 0.5) / paletteOffsetCount.y));
  diffuseColor.a *= opacity;
  #else
  diffuseColor = vec4(mix(sampledDiffuseColor.rgb, ownerColor, remapData.r),
      sampledDiffuseColor.a * opacity);
  #endif
  #ifdef INSTANCE_OPACITY
    diffuseColor.a *= vInstanceOpacity;
  #endif
  diffuseColor = clamp(diffuseColor, 0.0, 1.0);
`;

export class HdSpriteMaterial extends PaletteBasicMaterial {
    constructor({ remapMap, tiles, indexedCoverage = false, coverageWidth = 1,
        embeddedShadowMap, nearestIndexedBody = false, ...options }: any = {}) {
        super(options);
        this.uniforms.hdMinFootprint = { value: coverageWidth };
        if (indexedCoverage) this.defines = { ...this.defines, INDEXED_COVERAGE: "" };
        if (embeddedShadowMap) {
            this.defines = { ...this.defines, EMBEDDED_SHP_SHADOW: '' };
            if (nearestIndexedBody) this.defines.NEAREST_INDEXED_BODY = '';
            this.uniforms.embeddedShadowMap = { value: embeddedShadowMap };
            this.uniforms.embeddedShadowTextureSize = { value: [embeddedShadowMap.image.width, embeddedShadowMap.image.height] };
            this.uniforms.shadowAntialias = { value: true };
            this.vertexShader = this.vertexShader.replace('void main() {',
                'attribute vec4 shadowFrameRect; varying vec4 vShadowFrameRect;\nvoid main() {\nvShadowFrameRect = shadowFrameRect;');
        }
        this.uniforms.remapMap = { value: remapMap ?? null };
        if (tiles?.dataMap) {
            this.defines = { ...this.defines, HD_REMAP_TILE_POOL: '' };
            this.uniforms.hdRemapTileMap = { value: tiles.dataMap };
            this.uniforms.hdRemapPoolSize = { value: [remapMap.image.width, remapMap.image.height] };
        }
        if (tiles) {
            this.defines = { ...this.defines, HD_TILE_POOL: '' };
            this.uniforms.hdTileMap = { value: tiles.map };
            this.uniforms.hdVirtualSize = { value: tiles.virtualSize };
            this.uniforms.hdPoolSize = { value: [options.map.image.width, options.map.image.height] };
            this.uniforms.hdLookupSize = { value: [tiles.map.image.width, tiles.map.image.height] };
        }
        this.fragmentShader = this.fragmentShader
            .replace(paletteShaderLib.paletteColorParsFrag,
                paletteShaderLib.paletteColorParsFrag + "\nuniform sampler2D remapMap;\n")
            .replace(paletteShaderLib.paletteColorFrag, hdColorFragment)
            .replace('void main() {', hdTileSampling + '\nvoid main() {')
            .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment
                .replace('texture2D( map, vMapUv )', 'texture2D( map, hdSpriteUv(vMapUv) )'));
        this.type = "HdSpriteMaterial";
        // Keep dynamic uniforms live and page textures shared through batch clones.
        this.onBeforeCompile = shader => {
            Object.assign(shader.uniforms, this.uniforms);
            shader.vertexShader = this.vertexShader;
            shader.fragmentShader = this.fragmentShader;
        };
    }

    enableFiltering(pass: "opaque" | "edge" | "full" | "hidden"): void {
        if (!this.uniforms.hdPass) {
            this.vertexShader = this.vertexShader.replace("void main() {",
                "attribute vec4 hdFrameRect; varying vec4 vHdFrameRect;\nvoid main() {\nvHdFrameRect = hdFrameRect;");
            this.fragmentShader = this.fragmentShader.replace("void main() {", hdFilterDeclarations + "\nvoid main() {")
                .replace("  diffuseColor = clamp(diffuseColor, 0.0, 1.0);",
                    hdFilterFragment + "\n  diffuseColor = clamp(diffuseColor, 0.0, 1.0);");
            const image = this.map.image as { width: number; height: number };
            this.uniforms.hdTextureSize = { value: this.uniforms.hdVirtualSize?.value ?? [image.width, image.height] };
            this.uniforms.hdFiltering = { value: true };
        }
        this.uniforms.hdPass = { value: pass === "hidden" ? 0 : pass === "opaque" ? 1 : pass === "edge" ? 2 : 3 };
        if (pass === "edge" || pass === "full") {
            this.transparent = true;
            this.depthWrite = false;
            this.premultipliedAlpha = true;
            this.alphaTest = 0.001;
        }
        this.needsUpdate = true;
    }

    enableBlendedCoverage(): void {
        const { transparent, depthWrite } = this;
        this.enableFiltering('full');
        this.transparent = transparent;
        this.depthWrite = depthWrite;
        this.blending = THREE.CustomBlending;
        this.blendEquation = this.blendEquationAlpha = THREE.AddEquation;
        this.blendSrc = this.blendSrcAlpha = THREE.OneFactor;
        this.blendDst = this.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    }

    customProgramCacheKey(): string {
        return (this.uniforms.hdPass ? "m15-sprite-coverage-v2" : "m1.1-hd-rgba-remap-v1")
            + (this.uniforms.hdRemapTileMap ? '/lossless-remap-tiles-v1' : '')
            + (this.uniforms.hdTileMap ? '/lossless-tiles-v1' : '')
            + (this.uniforms.embeddedShadowMap ? '/embedded-shadow-v1' : '');
    }

    copy(source: this): this {
        super.copy(source);
        this.defines = { ...source.defines };
        this.uniforms.remapMap = { value: source.uniforms.remapMap.value };
        if (source.uniforms.hdRemapTileMap) this.uniforms.hdRemapTileMap = { value: source.uniforms.hdRemapTileMap.value };
        if (source.uniforms.hdTileMap) this.uniforms.hdTileMap = { value: source.uniforms.hdTileMap.value };
        if (source.uniforms.embeddedShadowMap)
            this.uniforms.embeddedShadowMap = { value: source.uniforms.embeddedShadowMap.value };
        return this;
    }
}

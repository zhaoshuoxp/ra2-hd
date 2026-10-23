import * as TextureUtils from "../../gfx/TextureUtils";
import * as SpriteUtils from "../../gfx/SpriteUtils";
import { ShpTextureAtlas } from "./ShpTextureAtlas";
import { PaletteBasicMaterial } from "../../gfx/material/PaletteBasicMaterial";
import { HdSpriteMaterial } from "../../gfx/material/HdSpriteMaterial";
import { ShpShadowMaterial } from "../../gfx/material/ShpShadowMaterial";
import type { HdSpriteOverride } from "./HdSpriteOverride";
import { BatchedMesh, BatchMode } from "../../gfx/batch/BatchedMesh";
import * as THREE from 'three';
export class ShpBuilder {
    static textureCache = new Map();
    static geometryCache = new Map();
    static materialCache = new Map();
    private scale!: number;
    private depth!: boolean;
    private depthOffset!: number;
    public hdDepthOffset?: number;
    private batchPalettes!: any[];
    private useMeshBatching!: boolean;
    private opacity!: number;
    private forceTransparent!: boolean;
    private offset!: {
        x: number;
        y: number;
    };
    private frameOffset!: number;
    public flat!: boolean;
    private uiAnchorCompensation!: boolean;
    private shpFile: any;
    private palette: any;
    private camera: any;
    private shpSize!: {
        width: number;
        height: number;
    };
    private mesh?: any;
    private extraLight?: any;
    private materialCacheKey?: string;
    private atlas: any;
    public smoothCoverage = false;
    public shadowCoverage = false;
    public embeddedShadow = false;
    private hdOverride?: HdSpriteOverride;
    private depthOptions?: { depthTest: boolean; depthWrite: boolean };
    private frameNo?: number;
    private align?: {
        x: number;
        y: number;
    };
    static prepareTexture(shpFile) {
        if (!ShpBuilder.textureCache.has(shpFile)) {
            const atlas = new ShpTextureAtlas().fromShpFile(shpFile);
            ShpBuilder.textureCache.set(shpFile, atlas);
        }
    }
    static clearCaches() {
        ShpBuilder.textureCache.forEach((texture) => texture.dispose());
        ShpBuilder.textureCache.clear();
        ShpBuilder.geometryCache.forEach((cache) => cache.forEach((geometry) => geometry.dispose()));
        ShpBuilder.geometryCache.clear();
    }
    constructor(shpFile, palette, camera, scale = 1, depth = false, depthOffset = 0) {
        this.scale = scale;
        this.depth = depth;
        this.depthOffset = depthOffset;
        this.batchPalettes = [];
        this.useMeshBatching = false;
        this.opacity = 1;
        this.forceTransparent = false;
        this.offset = { x: 0, y: 0 };
        this.frameOffset = 0;
        this.flat = false;
        this.uiAnchorCompensation = false;
        this.shpFile = shpFile;
        this.palette = palette;
        this.camera = camera;
        this.shpSize = { width: shpFile.width, height: shpFile.height };
        this.setFrame(0);
    }
    setUiAnchorCompensation(enabled) {
        if (this.mesh) {
            throw new Error("UI anchor compensation can only be set before calling build()");
        }
        this.uiAnchorCompensation = enabled;
    }
    setHdOverride(override?: HdSpriteOverride) {
        if (this.hdOverride === override) return;
        const oldPage = this.getHdPage();
        this.hdOverride = override;
        // Preserve the absent old page: undefined would invoke the default
        // argument after hdOverride has already changed.
        if (this.mesh) {
            this.setFrame(this.frameNo, true, oldPage ?? null);
            this.updateTransparency();
            this.updateOpacity();
        }
    }
    getVisualOpacity() {
        return this.opacity * (this.hdOverride?.visualOpacity ?? 1);
    }
    getAlphaTest() {
        if (this.hdOverride?.antialias) return .001;
        return (this.hdOverride?.visualOpacity ?? 1) < 1 ? .05 : .5;
    }
    getHdPage(frameNo = this.frameNo) {
        const frame = this.hdOverride?.frames[frameNo + this.frameOffset];
        return frame ? this.hdOverride.pages[frame.page] : undefined;
    }
    setDepthOptions(depthTest: boolean, depthWrite: boolean): void {
        if (this.mesh) throw new Error('Depth options must be set before building a sprite');
        this.depthOptions = { depthTest, depthWrite };
    }
    createMaterial(options) {
        options = { ...options, ...this.depthOptions };
        const page = this.getHdPage();
        const embedded = this.embeddedShadow ? { embeddedShadowMap: this.atlas.getTexture() } : {};
        let material;
        if (this.shadowCoverage) material = new ShpShadowMaterial(options);
        else if (page) material = new HdSpriteMaterial({ ...options, ...embedded, remapMap: page.data, tiles: page.tiles });
        else if (this.embeddedShadow || this.smoothCoverage && this.useMeshBatching)
            material = new HdSpriteMaterial({ ...options, ...embedded, indexedCoverage: true,
                nearestIndexedBody: this.embeddedShadow && !this.smoothCoverage });
        else material = new PaletteBasicMaterial(options);
        if ((this.embeddedShadow || this.hdOverride?.antialias) && !this.useMeshBatching && material instanceof HdSpriteMaterial)
            material.enableBlendedCoverage();
        return material;
    }
    useMaterial(texture, palette, transparent) {
        if (texture.format !== THREE.RGBAFormat) {
            throw new Error("Texture must have format THREE.RGBAFormat");
        }
        this.materialCacheKey = texture.uuid + "_" + palette.uuid + "_" + Number(transparent)
            + "_" + (this.getHdPage()?.data.uuid ?? "indexed") + "_" + this.smoothCoverage
            + "_" + this.shadowCoverage + "_" + this.embeddedShadow;
        if (this.depthOptions) this.materialCacheKey += `_${this.depthOptions.depthTest}_${this.depthOptions.depthWrite}`;
        let cached = ShpBuilder.materialCache.get(this.materialCacheKey);
        let material;
        if (cached) {
            material = cached.material;
            cached.usages++;
        }
        else {
            material = this.createMaterial({
                map: texture,
                palette: palette,
                alphaTest: 0.05,
                paletteCount: this.batchPalettes.length,
                flatShading: true,
                transparent: transparent,
            });
            cached = { material: material, usages: 1 };
            ShpBuilder.materialCache.set(this.materialCacheKey, cached);
        }
        return material;
    }
    freeMaterial() {
        if (!this.materialCacheKey) {
            throw new Error("Material cache key not set");
        }
        let cached = ShpBuilder.materialCache.get(this.materialCacheKey);
        if (cached) {
            if (cached.usages === 1) {
                ShpBuilder.materialCache.delete(this.materialCacheKey);
                cached.material.dispose();
            }
            else {
                cached.usages--;
            }
        }
    }
    setBatched(batched) {
        if (this.mesh) {
            throw new Error("Batching can only be set before calling build()");
        }
        this.useMeshBatching = batched;
    }
    setOffset(offset) {
        if (this.mesh) {
            throw new Error("Offset can only be set before calling build()");
        }
        this.offset = offset;
    }
    setAlign(x, y) {
        if (this.mesh) {
            throw new Error("Align can only be set before calling build()");
        }
        this.align = { x, y };
    }
    setFrameOffset(frameOffset) {
        if (this.mesh) {
            throw new Error("frameOffset can only be set before calling build()");
        }
        this.frameOffset = frameOffset;
    }
    initTexture() {
        ShpBuilder.prepareTexture(this.shpFile);
        this.atlas = ShpBuilder.textureCache.get(this.shpFile);
    }
    getSpriteGeometryOptions(frameNo) {
        frameNo += this.frameOffset;
        const image = this.shpFile.getImage(frameNo);
        const offset = {
            x: image.x - Math.floor(this.shpSize.width / 2) + Math.floor(this.offset.x),
            y: image.y - Math.floor(this.shpSize.height / 2) + Math.floor(this.offset.y),
        };
        const align = this.align ? this.align : (this.uiAnchorCompensation ? { x: 0, y: -1 } : { x: 1, y: -1 });
        const hdFrame = this.hdOverride?.frames[frameNo];
        const hdPage = hdFrame && this.hdOverride.pages[hdFrame.page];
        return {
            texture: hdPage?.base ?? this.atlas.getTexture(),
            textureArea: hdFrame?.sampleRect ?? this.atlas.getTextureArea(frameNo),
            logicalSize: hdFrame ? this.atlas.getTextureArea(frameNo) : undefined,
            textureSize: hdPage?.tiles ? { width: hdPage.tiles.virtualSize[0], height: hdPage.tiles.virtualSize[1] } : undefined,
            flat: this.flat,
            align: align,
            offset: offset,
            camera: this.camera,
            depth: this.depth,
            depthOffset: this.hdOverride ? this.hdDepthOffset ?? this.depthOffset : this.depthOffset,
            scale: this.scale,
        };
    }
    // Every animated sprite rebuilds this key whenever its frame changes. Only
    // the frame varies in play, so reuse the suffix while its inputs match.
    private keySuffix?: string;
    private keyInputs: unknown[] = [];
    getGeometryCacheKey(frameNo) {
        const r = this.camera.rotation, align = this.align, inputs = this.keyInputs;
        const current = [this.shpSize.width, this.shpSize.height, this.offset.x, this.offset.y, this.flat, this.depth,
            this.hdOverride ? this.hdDepthOffset ?? this.depthOffset : this.depthOffset,
            this.scale, align?.x, align?.y, align, this.uiAnchorCompensation, r.x, r.y, r.z, r.order,
            this.hdOverride, this.shadowCoverage, this.embeddedShadow];
        let same = this.keySuffix !== undefined && inputs.length === current.length;
        for (let i = 0; same && i < current.length; i++) same = Object.is(inputs[i], current[i]);
        if (!same) {
            this.keySuffix = this.buildGeometryCacheKey(0).slice(String(this.frameOffset).length);
            this.keyInputs = current;
        }
        return (frameNo + this.frameOffset) + this.keySuffix!;
    }
    private buildGeometryCacheKey(frameNo) {
        return (frameNo +
            this.frameOffset +
            "_" +
            this.shpSize.width +
            "_" +
            this.shpSize.height +
            "_" +
            this.offset.x +
            "_" +
            this.offset.y +
            "_" +
            this.flat +
            "_" +
            this.depth +
            "_" +
            (this.hdOverride ? this.hdDepthOffset ?? this.depthOffset : this.depthOffset) + "_" + this.scale + "_" + JSON.stringify(this.align)
            + "_" + this.uiAnchorCompensation + "_" + this.camera.rotation.toArray().join(",")
            + "_" + (this.hdOverride?.identity ?? "indexed") + "_" + this.shadowCoverage + "_" + this.embeddedShadow);
    }
    createGeometry(frameNo) {
        const geometry = SpriteUtils.createSpriteGeometry(this.getSpriteGeometryOptions(frameNo));
        if (this.hdOverride?.antialias) {
            const uv = geometry.getAttribute('uv'), bounds = [1, 1, 0, 0];
            for (let i = 0; i < uv.count; i++) {
                bounds[0] = Math.min(bounds[0], uv.getX(i)); bounds[1] = Math.min(bounds[1], uv.getY(i));
                bounds[2] = Math.max(bounds[2], uv.getX(i)); bounds[3] = Math.max(bounds[3], uv.getY(i));
            }
            const rect = new THREE.BufferAttribute(new Float32Array(uv.count * 4), 4);
            for (let i = 0; i < uv.count; i++) rect.setXYZW(i, bounds[0], bounds[1], bounds[2], bounds[3]);
            geometry.setAttribute('hdFrameRect', rect);
        }
        if (this.shadowCoverage || this.embeddedShadow) {
            const uv = geometry.getAttribute('uv');
            let left = 1, bottom = 1, right = 0, top = 0;
            for (let i = 0; i < uv.count; i++) {
                left = Math.min(left, uv.getX(i)); right = Math.max(right, uv.getX(i));
                bottom = Math.min(bottom, uv.getY(i)); top = Math.max(top, uv.getY(i));
            }
            if (this.embeddedShadow) {
                const area = this.atlas.getTextureArea(frameNo + this.frameOffset), image = this.atlas.getTexture().image;
                const hdRect = new THREE.BufferAttribute(new Float32Array(uv.count * 4), 4);
                for (let i = 0; i < uv.count; i++) hdRect.setXYZW(i, left, bottom, right, top);
                geometry.setAttribute('hdFrameRect', hdRect);
                left = area.x / image.width; right = (area.x + area.width) / image.width;
                bottom = 1 - (area.y + area.height) / image.height; top = 1 - area.y / image.height;
            }
            const rect = new THREE.BufferAttribute(new Float32Array(uv.count * 4), 4);
            for (let i = 0; i < uv.count; i++) rect.setXYZW(i, left, bottom, right, top);
            geometry.setAttribute('shadowFrameRect', rect);
        }
        return geometry;
    }
    setFrame(frameNo, force = false, oldPage: ReturnType<ShpBuilder['getHdPage']> | null = this.getHdPage()) {
        if (this.frameNo !== frameNo || force) {
            this.frameNo = frameNo;
            if (this.mesh) {
                let geometryCache = this.getGeometryCache();
                const cacheKey = this.getGeometryCacheKey(frameNo);
                let geometry = geometryCache.get(cacheKey);
                if (!geometry) {
                    geometry = this.createGeometry(frameNo);
                    geometryCache.set(cacheKey, geometry);
                }
                this.mesh.geometry = geometry;
                const page = this.getHdPage();
                if (oldPage !== page) {
                    const palette = this.mesh.material.palette;
                    const transparent = this.forceTransparent || this.getVisualOpacity() < 1;
                    const texture = page?.base ?? this.atlas.getTexture();
                    if (this.useMeshBatching) {
                        this.freeMaterial();
                        this.mesh.material = this.useMaterial(texture, palette, transparent);
                    } else {
                        this.mesh.material.dispose();
                        this.mesh.material = this.createMaterial({ map: texture, palette,
                            alphaTest: this.getAlphaTest(), transparent });
                        this.updateOpacity();
                        if (this.extraLight) this.setExtraLight(this.extraLight);
                    }
                }
            }
        }
    }
    getGeometryCache() {
        let cache = ShpBuilder.geometryCache.get(this.shpFile);
        if (!cache) {
            cache = new Map();
            ShpBuilder.geometryCache.set(this.shpFile, cache);
        }
        return cache;
    }
    getFrame() {
        return this.frameNo;
    }
    setSize(size) {
        this.shpSize = { width: size.width, height: size.height };
    }
    getSize() {
        return this.shpSize;
    }
    get frameCount() {
        return this.shpFile.numImages;
    }
    getBatchPaletteIndex(palette) {
        const index = this.batchPalettes.findIndex((p) => p.hash === palette.hash);
        if (index === -1) {
            throw new Error("Provided palette not found in the list of batch palettes. Call setBatchPalettes first.");
        }
        return index;
    }
    setPalette(palette) {
        this.palette = palette;
        if (this.mesh) {
            if (this.useMeshBatching) {
                const paletteIndex = this.getBatchPaletteIndex(palette);
                this.mesh.setPaletteIndex(paletteIndex);
            }
            else {
                const paletteTexture = TextureUtils.textureFromPalette(palette);
                let material = this.mesh.material;
                material.palette = paletteTexture;
            }
        }
    }
    setBatchPalettes(palettes) {
        if (!this.useMeshBatching) {
            throw new Error("Can't use multiple palettes when not batching");
        }
        if (this.mesh) {
            throw new Error("Palettes must be set before creating 3DObject");
        }
        this.batchPalettes = palettes;
    }
    setExtraLight(extraLight) {
        this.extraLight = extraLight;
        if (this.mesh) {
            if (this.useMeshBatching) {
                this.mesh.setExtraLight(extraLight);
            }
            else {
                let material = this.mesh.material;
                material.extraLight = extraLight;
            }
        }
    }
    setOpacity(opacity) {
        const oldOpacity = this.opacity;
        if (oldOpacity !== opacity) {
            this.opacity = opacity;
            this.updateOpacity();
        }
        if (Math.floor(oldOpacity) !== Math.floor(opacity) && !this.forceTransparent) {
            this.updateTransparency();
        }
    }
    setForceTransparent(forceTransparent) {
        if (forceTransparent !== this.forceTransparent) {
            this.forceTransparent = forceTransparent;
            this.updateTransparency();
        }
    }
    updateOpacity() {
        if (this.mesh) {
            if (this.useMeshBatching) {
                this.mesh.setOpacity(this.getVisualOpacity());
            }
            else {
                this.mesh.material.opacity = this.getVisualOpacity();
            }
        }
    }
    updateTransparency() {
        if (this.mesh) {
            const transparent = this.forceTransparent || this.getVisualOpacity() < 1;
            if (this.useMeshBatching) {
                const texture = this.mesh.material.map;
                const palette = this.mesh.material.palette;
                this.freeMaterial();
                this.mesh.material = this.useMaterial(texture, palette, transparent);
            }
            else {
                this.mesh.material.transparent = transparent;
                this.mesh.material.alphaTest = this.getAlphaTest();
            }
        }
    }
    build() {
        if (this.mesh) {
            return this.mesh;
        }
        this.initTexture();
        const texture = this.getHdPage()?.base ?? this.atlas.getTexture();
        const cacheKey = this.getGeometryCacheKey(this.frameNo);
        let geometryCache = this.getGeometryCache();
        let geometry = geometryCache.get(cacheKey);
        if (!geometry) {
            geometry = this.createGeometry(this.frameNo);
            geometryCache.set(cacheKey, geometry);
        }
        else {
        }
        let mesh;
        const transparent = this.getVisualOpacity() < 1 || this.forceTransparent;
        if (this.useMeshBatching) {
            const paletteTexture = TextureUtils.textureFromPalettes(this.batchPalettes);
            const material = this.useMaterial(texture, paletteTexture, transparent);
            mesh = new BatchedMesh(geometry, material, BatchMode.Merging);
            mesh.castShadow = false;
        }
        else {
            const paletteTexture = TextureUtils.textureFromPalette(this.palette);
            const material = this.createMaterial({
                map: texture,
                palette: paletteTexture,
                alphaTest: this.getAlphaTest(),
                flatShading: true,
                transparent: transparent,
            });
            mesh = new THREE.Mesh(geometry, material);
        }
        mesh.matrixAutoUpdate = false;
        this.mesh = mesh;
        this.setPalette(this.palette);
        this.updateOpacity();
        if (this.extraLight) {
            this.setExtraLight(this.extraLight);
        }
        return mesh;
    }
    dispose() {
        if (this.mesh) {
            if (this.useMeshBatching) {
                this.freeMaterial();
            }
            else {
                this.mesh.material.dispose();
            }
            this.mesh = undefined;
        }
    }
}

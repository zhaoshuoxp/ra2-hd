import { Coords } from "@/game/Coords";
import { TextureUtils } from "@/engine/gfx/TextureUtils";
import { TmpDrawable } from "@/engine/gfx/drawable/TmpDrawable";
import { TextureAtlas } from "@/engine/gfx/TextureAtlas";
import { SpriteUtils } from "@/engine/gfx/SpriteUtils";
import { Anim } from "@/engine/renderable/entity/Anim";
import { LightingType } from "@/engine/type/LightingType";
import { CompositeDisposable } from "@/util/disposable/CompositeDisposable";
import { BufferGeometryUtils } from "@/engine/gfx/BufferGeometryUtils";
import { PaletteBasicMaterial } from "@/engine/gfx/material/PaletteBasicMaterial";
import { getRandomInt } from "@/util/math";
import * as THREE from "three";
import { TerrainHdMaterial } from "@/engine/gfx/material/TerrainHdMaterial";
export class MapTileLayer {
    private theater: any;
    private art: any;
    private imageFinder: any;
    private camera: any;
    private debugFrame: any;
    private gameSpeed: any;
    private worldSound: any;
    private lighting: any;
    private useSpriteBatching: any;
    private tileIndexes: Map<any, any>;
    private tileAnimLightMultsByTile: Map<any, any>;
    private disposables: CompositeDisposable;
    private allTiles: any[];
    private target: any;
    private colorMultAttributes: any[] = [];
    private batchTiles: any[][] = [];
    private anims: any[];
    constructor(mapData: any, theater: any, art: any, imageFinder: any, camera: any, debugFrame: any, gameSpeed: any, worldSound: any, lighting: any, useSpriteBatching: any) {
        this.theater = theater;
        this.art = art;
        this.imageFinder = imageFinder;
        this.camera = camera;
        this.debugFrame = debugFrame;
        this.gameSpeed = gameSpeed;
        this.worldSound = worldSound;
        this.lighting = lighting;
        this.useSpriteBatching = useSpriteBatching;
        this.tileIndexes = new Map();
        this.tileAnimLightMultsByTile = new Map();
        this.disposables = new CompositeDisposable();
        this.allTiles = mapData.tiles.getAll();
    }
    get3DObject(): any {
        return this.target;
    }
    create3DObject(): void {
        let object3D = this.get3DObject();
        if (!object3D) {
            object3D = new (THREE as any).Object3D();
            object3D.name = "map_tile_layer";
            object3D.matrixAutoUpdate = false;
            this.target = object3D;
            this.createTileObjects(object3D);
        }
    }
    createTileObjects(parent: any): void {
        try {
            console.log('[MapTileLayer] createTileObjects start');
        }
        catch { }
        const tmpImageMap = new Map();
        const tileImageMap = new Map();
        const isoPalette = this.theater.isoPalette;
        const paletteTexture = TextureUtils.textureFromPalette(isoPalette);
        const tileSets = this.theater.tileSets;
        const validTiles: any[] = [];
        for (const tile of this.allTiles) {
            const tileNum = tile.tileNum;
            const tileData = tileSets.getTile(tileNum);
            if (!tileData) {
                try {
                    console.warn('[MapTileLayer] missing tileData for tile', tile);
                }
                catch { }
                ;
                continue;
            }
            const tmpFile = tileData.getTmpFile(tile.subTile, getRandomInt);
            if (!tmpFile || tile.subTile >= tmpFile.images.length) {
                try {
                    console.warn('[MapTileLayer] bad tmpFile or subTile', { tile, tmpFileExists: !!tmpFile });
                }
                catch { }
                ;
                continue;
            }
            const tmpImage = tmpFile.images[tile.subTile];
            if (!tmpImage) throw Error(`Map references empty TMP slot: ${tmpFile.filename}:${tile.subTile}`);
            tileImageMap.set(tile, tmpImage);
            validTiles.push(tile);
            if (!tmpImageMap.get(tmpImage)) {
                const drawable = new TmpDrawable().draw(tmpImage, tmpFile.blockWidth, tmpFile.blockHeight);
                tmpImageMap.set(tmpImage, drawable);
            }
        }
        const textureAtlas = new TextureAtlas();
        const drawables: any[] = [];
        tmpImageMap.forEach((drawable) => {
            drawables.push(drawable);
        });
        textureAtlas.pack(drawables);
        try {
            console.log('[MapTileLayer] textureAtlas packed', { drawables: drawables.length });
        }
        catch { }
        this.disposables.add(textureAtlas);
        const nativeTexture = textureAtlas.getTexture();
        const batches = new Map<THREE.Texture, { geometries: THREE.BufferGeometry[]; tiles: any[]; hd: boolean }>();
        for (const tile of validTiles) {
            const tmpImage = tileImageMap.get(tile)!;
            const binding = this.theater.terrainHd?.bindings.get(tmpImage);
            const texture = binding?.texture ?? nativeTexture;
            let batch = batches.get(texture);
            if (!batch) batches.set(texture, batch = { geometries: [], tiles: [], hd: !!binding });
            const offsetX = tmpImage.hasExtraData ? Math.max(0, tmpImage.x - tmpImage.extraX) : 0;
            const offsetY = tmpImage.hasExtraData ? Math.max(0, tmpImage.y - tmpImage.extraY) : 0;
            const drawable = tmpImageMap.get(tmpImage);
            const geometry = SpriteUtils.createSpriteGeometry({
                texture, textureArea: binding?.rect ?? textureAtlas.getImageRect(drawable),
                logicalSize: binding?.logical,
                align: { x: 0, y: -1 }, offset: { x: -offsetX, y: -offsetY },
                camera: this.camera, scale: Coords.ISO_WORLD_SCALE,
            });
            const position = Coords.tile3dToWorld(tile.rx, tile.ry, tile.z);
            geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(position.x, position.y, position.z));
            batch.geometries.push(geometry);
            batch.tiles.push(tile);
            if (binding) this.theater.terrainHd.report.placedBindings.push({
                tile: [tile.rx, tile.ry, tile.z, tile.tileNum, tile.subTile],
                group: binding.group, ...binding.source,
            });
        }
        for (const [texture, batch] of batches) {
            const batchIndex = this.batchTiles.length;
            this.batchTiles.push(batch.tiles);
            const geometry = BufferGeometryUtils.mergeBufferGeometries(batch.geometries);
            const lightingData: number[] = [];
            batch.tiles.forEach((tile, index) => {
                const { x, y, z } = this.lighting.compute(LightingType.Full, tile);
                lightingData.push(x, y, z);
                this.tileIndexes.set(tile, { batch: batchIndex, index });
            });
            const colors = new Float32Array(4 * geometry.getAttribute("position").count);
            this.updateColorMultBuffer(lightingData, colors);
            const attribute = new THREE.BufferAttribute(colors, 4);
            geometry.setAttribute("vertexColorMult", attribute);
            this.colorMultAttributes.push(attribute);
            batch.geometries.forEach(part => part.dispose());
            const material = batch.hd ? new TerrainHdMaterial(texture) : new PaletteBasicMaterial({
                map: texture, palette: paletteTexture, alphaTest: .5, flatShading: true, useVertexColorMult: true,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = batch.hd ? "map_tiles_hd" : "map_tiles_original";
            mesh.matrixAutoUpdate = false;
            mesh.frustumCulled = false;
            mesh.renderOrder = -2;
            parent.add(mesh);
            this.disposables.add(geometry, material);
        }
        const animations: any[] = [];
        for (const tile of validTiles) {
            const tileNum = tile.tileNum;
            const tileData = tileSets.getTile(tileNum);
            if (!tileData)
                return;
            const animData = tileData.getAnimation();
            if (animData && tile.subTile === animData.subTile) {
                const lightMult = this.lighting
                    .compute(LightingType.Full, tile)
                    .addScalar(-1);
                this.tileAnimLightMultsByTile.set(tile, lightMult);
                const anim = new Anim(animData.name, this.art.getAnimation(animData.name), {
                    x: animData.offsetX,
                    y: animData.offsetY + (Coords.ISO_TILE_SIZE + 1) / 2,
                }, this.imageFinder, this.theater, this.camera, this.debugFrame, this.gameSpeed, this.useSpriteBatching, lightMult, this.worldSound, isoPalette);
                const worldPos = Coords.tile3dToWorld(tile.rx, tile.ry, tile.z);
                anim.setPosition(worldPos);
                anim.create3DObject();
                animations.push(anim);
                parent.add(anim.get3DObject());
                this.disposables.add(anim);
            }
        }
        this.anims = animations;
    }
    update(deltaTime: number): void {
        for (const anim of this.anims) {
            anim.update(deltaTime);
        }
    }
    updateLighting(tiles?: any[]): void {
        const changed = new Set<any>();
        for (const tile of tiles ?? this.batchTiles.flat()) {
            const entry = this.tileIndexes.get(tile);
            if (entry) {
                const { x, y, z } = this.lighting.compute(LightingType.Full, tile);
                const attribute = this.colorMultAttributes[entry.batch];
                this.updateColorMultBufferAtIndex(entry.index, x, y, z, attribute.array);
                changed.add(attribute);
            }
            const animLightMult = this.tileAnimLightMultsByTile.get(tile);
            if (animLightMult) animLightMult.copy(this.lighting.compute(LightingType.Full, tile));
        }
        changed.forEach(attribute => attribute.needsUpdate = true);
    }
    private updateColorMultBuffer(lightingData: number[], buffer: Float32Array): void {
        const verticesPerSprite = SpriteUtils.VERTICES_PER_SPRITE;
        const tileCount = lightingData.length / 3;
        let bufferIndex = 0;
        for (let i = 0; i < tileCount; i++) {
            const r = lightingData[3 * i];
            const g = lightingData[3 * i + 1];
            const b = lightingData[3 * i + 2];
            for (let j = 0; j < verticesPerSprite; j++) {
                buffer[bufferIndex++] = r;
                buffer[bufferIndex++] = g;
                buffer[bufferIndex++] = b;
                buffer[bufferIndex++] = 1;
            }
        }
    }
    private updateColorMultBufferAtIndex(tileIndex: number, r: number, g: number, b: number, buffer: Float32Array): void {
        const verticesPerSprite = SpriteUtils.VERTICES_PER_SPRITE;
        let bufferIndex = tileIndex * verticesPerSprite * 4;
        for (let i = 0; i < verticesPerSprite; i++) {
            buffer[bufferIndex++] = r;
            buffer[bufferIndex++] = g;
            buffer[bufferIndex++] = b;
            buffer[bufferIndex++] = 1;
        }
    }
    dispose(): void {
        this.disposables.dispose();
    }
}

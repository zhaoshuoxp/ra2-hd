import * as THREE from 'three';
import { BatchedMesh } from '../../gfx/batch/BatchedMesh';
import { MergedSpriteMesh } from '../../gfx/batch/MergedSpriteMesh';
import { setCachedMeshVisibility } from '../../gfx/CachedMeshVisibility';
import { registerShadowOnlyMaterial, unregisterShadowOnlyMaterial } from '../../gfx/ShadowOnlyMaterials';
import { registerVehicleShadowCaster, unregisterVehicleShadowCaster } from '../../gfx/batch/VehicleShadowBatcher';
import { HdSpriteMaterial } from '../../gfx/material/HdSpriteMaterial';
import { componentGeometry, constructionSlopePositions } from './componentGeometry';
import { textureFromPalette } from '../../gfx/TextureUtils';
import { heading } from '../rhino/contract';
import { nativeCoverage } from '../rhino/coverage';
import { RhinoShadow } from '../rhino/RhinoShadow';
import { LightingType } from '../../type/LightingType';
import type { VxlFamily, VxlPart, VxlFrame } from './loadVxlFamily';
import { dockDepthOffset } from './dockDepth';
import { DockableTrait } from '../../../game/gameobject/trait/DockableTrait';
import { RotorMast } from './RotorMast';
import { enableGattlingSpin, gattlingSpinRates, isGattlingBarrel } from './GattlingBarrelSpin';
import { DiscRotation, enableDiscSurfaceSpin } from './DiscSurfaceSpin';
import { Coords } from '../../../game/Coords';
import { groundVolumeCorrection } from './groundVolume';
import { authoredLightReference } from './authoredLightReference';

// Remove only the continuously varying yaw already represented by the authored
// bearing. Native translation, roll/pitch, joint offsets and recoil remain live.
export function componentPose(
    target: THREE.Matrix4,
    current: THREE.Matrix4,
    referenceLinear: number[],
    actualYaw: number,
    authoredYaw: number,
) {
    const flat = new THREE.Matrix4()
        .makeRotationY(THREE.MathUtils.degToRad(actualYaw - authoredYaw))
        .multiply(new THREE.Matrix4().fromArray(referenceLinear));
    flat.setPosition(0, 0, 0);
    return target.copy(current).multiply(flat.invert());
}

// Move the complete authored joint in its native parent's coordinates. The
// offset inherits body attitude, but must never rotate with the blade phase.
export function offsetRotorMount(
    current: THREE.Matrix4,
    parent: THREE.Matrix4,
    offset: [number, number, number],
) {
    const shift = new THREE.Vector3().fromArray(offset)
        .applyMatrix4(parent.clone().setPosition(0, 0, 0));
    current.elements[12] += shift.x;
    current.elements[13] += shift.y;
    current.elements[14] += shift.z;
    return current;
}

class FrameLayer {
    readonly source: BatchedMesh;
    readonly batch: MergedSpriteMesh;
    readonly depth: THREE.Mesh<THREE.BufferGeometry, HdSpriteMaterial>;
    readonly translucent: THREE.Mesh<THREE.BufferGeometry, HdSpriteMaterial>;
    private levelPositions?: Float32Array;
    private slopePositions?: Float32Array;
    private tilted = false;
    constructor(
        readonly part: VxlPart,
        readonly frame: VxlFrame,
        camera: THREE.Camera,
        readonly parent: THREE.Object3D,
        palette: THREE.Texture,
        ground: boolean,
        rotor?: { axis: THREE.Vector3; center: THREE.Vector3 },
        missile = false,
        bodyHeight?: [number, number],
        disc = false,
        readonly rigidSlope = false,
    ) {
        const page = part.override.pages[0];
        const bias = /barl\d*\.vxl$/.test(part.member)
            ? 1
            : /tur\d*\.vxl$/.test(part.member)
              ? 0.5
              : 0;
        const geometry = componentGeometry(part, frame, camera, ground, bias, rotor, missile, bodyHeight);
        if (rigidSlope) {
            // The depth fold used for level sprites is a sorting surface. A
            // pitched ground vehicle needs one rigid plane through its
            // native longitudinal axis; otherwise that fold bends the body.
            const position = geometry.getAttribute('position');
            this.levelPositions = Float32Array.from(position.array);
            this.slopePositions = constructionSlopePositions(position, frame.referenceLinear, camera);
        }
        const material = new HdSpriteMaterial({
            map: page.base,
            remapMap: page.data,
            tiles: page.tiles,
            palette,
            paletteCount: 1,
            alphaTest: 0.05,
            // Every authored family already includes antialiasing. Let screen
            // derivatives select coverage without imposing a native-pixel blur.
            coverageWidth: 1,
        });
        if (rotor || missile) material.side = THREE.DoubleSide;
        this.source = new BatchedMesh(geometry, material);
        this.source.matrixWorld.identity();
        this.batch = new MergedSpriteMesh(geometry, material, 1);
        // Edge coverage is allocated on the first batch update. Include that
        // material before installing the barrel shader on all coverage passes.
        if (isGattlingBarrel(part) || disc) this.batch.updateFromMeshes([this.source]);
        const depthMaterial = (this.batch.material as HdSpriteMaterial).clone();
        depthMaterial.enableFiltering('full');
        depthMaterial.transparent = false;
        depthMaterial.colorWrite = false;
        depthMaterial.depthWrite = true;
        depthMaterial.alphaTest = 0.985;
        this.depth = new THREE.Mesh(this.batch.geometry, depthMaterial);
        const translucentMaterial = (this.batch.material as HdSpriteMaterial).clone();
        translucentMaterial.enableFiltering('full');
        this.translucent = new THREE.Mesh(this.batch.geometry, translucentMaterial);
        if (isGattlingBarrel(part)) {
            for (const material of [this.batch.material, this.depth.material, this.translucent.material,
                ...this.batch.children.map(child => (child as THREE.Mesh).material)])
                enableGattlingSpin(material as HdSpriteMaterial, part, frame);
        }
        if (disc) for (const pass of [this.batch.material, this.depth.material, this.translucent.material,
            ...this.batch.children.map(child => (child as THREE.Mesh).material)])
            enableDiscSurfaceSpin(pass as HdSpriteMaterial, part, frame);
        for (const mesh of [this.batch, this.depth, this.translucent]) {
            mesh.name = `unit-vxl-hd-${part.key}-${frame.heading}`;
            mesh.matrixAutoUpdate = false;
            mesh.frustumCulled = false;
            mesh.visible = false;
            parent.add(mesh);
        }
    }
    setGroundAttitude(tilted: boolean) {
        if (!this.levelPositions || tilted === this.tilted) return;
        this.tilted = tilted;
        const position = this.source.geometry.getAttribute('position') as THREE.BufferAttribute;
        (position.array as Float32Array).set(tilted ? this.slopePositions! : this.levelPositions);
        position.needsUpdate = true;
    }
    update(
        visible: boolean,
        pose: THREE.Matrix4,
        light: THREE.Vector3,
        palette: THREE.Texture,
        order: number,
        clipping: any,
        opacity: number,
    ) {
        setCachedMeshVisibility(this.batch, this.parent, visible && opacity === 1);
        setCachedMeshVisibility(this.depth, this.parent, visible && opacity === 1);
        setCachedMeshVisibility(this.translucent, this.parent, visible && opacity > 0 && opacity < 1);
        if (!visible) return;
        this.source.extraLight.copy(light);
        (this.source.material as HdSpriteMaterial).palette = palette;
        for (const mesh of [this.batch, this.depth, this.translucent]) {
            mesh.matrix.copy(pose);
            mesh.matrixWorldNeedsUpdate = true;
            mesh.renderOrder = order;
            (mesh.material as HdSpriteMaterial).palette = palette;
            (mesh.material as THREE.Material).clippingPlanes = clipping;
        }
        this.translucent.material.opacity = opacity;
        this.batch.updateFromMeshes([this.source]);
        for (const edge of this.batch.children)
            if (edge.name === 'hd-sprite-edge') {
                (edge as THREE.Mesh<any, HdSpriteMaterial>).material.palette = palette;
                nativeCoverage(edge as THREE.Mesh, order);
            }
        nativeCoverage(this.translucent, order);
    }
    dispose() {
        this.depth.removeFromParent();
        this.depth.material.dispose();
        this.translucent.removeFromParent();
        this.translucent.material.dispose();
        this.batch.removeFromParent();
        this.batch.dispose();
        this.source.geometry.dispose();
        (this.source.material as THREE.Material).dispose();
    }
}

// Compile the same coverage and animated-surface programs before a family is
// published. Detached layers are never drawn and allocate no new atlas pages.
export async function warmVxlShaders(family: VxlFamily, renderer: THREE.WebGLRenderer) {
    if (!renderer.compileAsync) return () => {};
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1);
    camera.rotation.set(-Coords.ISO_CAMERA_ALPHA, Coords.ISO_CAMERA_BETA, 0, 'YXZ');
    const palette = new THREE.DataTexture(new Uint8Array(256 * 4), 256, 1);
    const layers: FrameLayer[] = [];
    const dispose = () => { layers.forEach(layer => layer.dispose()); palette.dispose(); };
    try {
        for (const part of family.parts) {
            const frame = part.frames[0];
            const rotor = frame.rotorAnchor ? { axis: new THREE.Vector3(0, 1, 0), center: new THREE.Vector3() } : undefined;
            const missile = ['V3ROCKET', 'DMISL', 'CMISL', 'ASW'].includes(part.actor);
            const layer = new FrameLayer(part, frame, camera, scene, palette, true, rotor, missile,
                undefined, family.identity === 'DISK' && /(?:tur|barl)\d*\.vxl$/.test(part.member));
            layers.push(layer);
            layer.batch.updateFromMeshes([layer.source]);
        }
        await renderer.compileAsync(scene, camera);
        // Retain program references until family disposal. Disposing here would
        // remove freshly compiled programs before the first model uses them.
        return dispose;
    } catch (error) { dispose(); throw error; }
}

// Retail aliases share accepted VXL/HVA pairs. Loading verifies every source
// hash; construction below also checks the complete native component graph.
export function vxlActorIdentity(family: string, actor: string): string {
    if (family === 'HARV' && actor === 'HORV') return 'HARV';
    if (family === 'DTRUCK' && actor === 'TRUCKA') return 'DTRUCK';
    return family === 'PDPLANE' && actor === 'CARGOPLANE' ? 'PDPLANE' : actor;
}

export class VxlUnitRenderer {
    readonly originals: THREE.Material[] = [];
    readonly hidden: THREE.Material[] = [];
    readonly shadowOccluders: THREE.Mesh[] = [];
    readonly meshes: any[] = [];
    readonly layers: { mesh: any; frames: FrameLayer[]; turret: boolean; rotor: boolean;
        mast?: RotorMast; rotorAxis?: THREE.Vector3 }[] = [];
    readonly shadow: RhinoShadow;
    readonly baseLight: THREE.Vector3;
    readonly light = new THREE.Vector3();
    readonly pose = new THREE.Matrix4();
    readonly towardCamera: THREE.Vector3;
    private dockDepthCache?: { key: string; offset: number };
    private gattlingPhase = 0;
    private lastGattlingTime?: number;
    private discRotation = new DiscRotation();
    active = false;
    disposed = false;
    constructor(
        readonly r: any,
        readonly family: VxlFamily,
        private readonly camera: THREE.Camera,
    ) {
        this.towardCamera = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
        // A directly placed HORV has only the native unloading body. Load and
        // validate the complete HARV family, then bind this exact component.
        const expected = family.parts.filter(p => p.actor === vxlActorIdentity(family.identity, r.gameObject.name)
            && !(family.identity === 'HARV' && r.gameObject.name === 'HORV' && p.member !== 'horv.vxl'));
        if (!expected.length || !r.objectArt.isVoxel || !r.posObj)
            throw Error('Unrecognized VXL actor');
        const actual = r.vxlBuilders.flatMap((b: any) =>
            [...b.sections].map(([section, mesh]: any) => ({ b, section, mesh })),
        );
        if (
            actual.length !== expected.length ||
            actual.some(
                (a: any) =>
                    !expected.some(
                        (p) => p.member === a.b.vxlFile.filename && p.section === a.section,
                    ),
            )
        )
            throw Error('Incomplete native VXL component graph');
        this.baseLight = authoredLightReference(r);
        const palette = textureFromPalette(r.palette);
        try {
            for (const part of expected) {
                const { mesh } = actual.find(
                    (a: any) => a.b.vxlFile.filename === part.member && a.section === part.section,
                );
                this.meshes.push(mesh);
                this.originals.push(mesh.material);
                const hidden = mesh.material.clone();
                hidden.colorWrite = hidden.depthWrite = false;
                // The native section remains the shadow caster; it no longer
                // submits an empty colour-pass draw beneath the HD layers.
                registerShadowOnlyMaterial(hidden);
                this.hidden.push(hidden);
                // Native bridge decks do not write depth. Preserve the original
                // voxel depth before the later ground-shadow receiver pass, so
                // a cropped HD surface cannot reveal shadows through the deck.
                const occluder = new THREE.Mesh(
                    mesh.geometry,
                    new THREE.MeshBasicMaterial({
                        colorWrite: false,
                        depthWrite: true,
                        side: mesh.material.side,
                    }),
                );
                occluder.name = 'unit-vxl-native-shadow-depth';
                occluder.matrixAutoUpdate = false;
                occluder.frustumCulled = false;
                occluder.visible = false;
                mesh.parent.add(occluder);
                this.shadowOccluders.push(occluder);

                const rotorIndex = r.rotors?.indexOf(mesh) ?? -1;
                const rotorRule = rotorIndex >= 0 ? r.objectArt.rotors[rotorIndex] : undefined;
                if (rotorRule) mesh.geometry.computeBoundingBox();
                const rotor = rotorRule ? { axis: rotorRule.axis,
                    center: mesh.geometry.boundingBox.getCenter(new THREE.Vector3()) } : undefined;
                let bodyHeight: [number, number] | undefined;
                if (family.identity === 'DISK') {
                    // A flat lower disc and a raised rotating turret must not
                    // share the generic folded sprite's artificial depth.
                    mesh.geometry.computeBoundingBox();
                    const frame = part.frames[0], origin = new THREE.Vector3().fromArray(frame.referenceOrigin ?? [0, 0, 0]);
                    const reference = new THREE.Matrix4().fromArray(frame.referenceLinear).setPosition(origin);
                    const bounds = mesh.geometry.boundingBox.clone().applyMatrix4(reference);
                    bodyHeight = [bounds.min.y, bounds.max.y];
                }
                if (r.rotors?.length && !rotor && part.member === r.bodyVxlBuilder?.vxlFile.filename) {
                    mesh.geometry.computeBoundingBox();
                    const frame = part.frames[0], origin = new THREE.Vector3().fromArray(frame.referenceOrigin ?? [0, 0, 0]);
                    const reference = new THREE.Matrix4().fromArray(frame.referenceLinear).setPosition(origin);
                    const bounds = mesh.geometry.boundingBox.clone().applyMatrix4(reference);
                    bodyHeight = [bounds.min.y, bounds.max.y];
                }
                const layer = {
                    mesh,
                    turret: /(?:tur|barl)\d*\.vxl$/.test(part.member),
                    rotor: !!rotor,
                    rotorAxis: rotor?.axis,
                    mast: rotor && part.rotorMast ? new RotorMast(mesh.parent, part.rotorMast) : undefined,
                    frames: [] as FrameLayer[],
                };
                this.layers.push(layer);
                const disc = family.identity === 'DISK';
                for (const frame of rotor || disc ? part.frames.slice(0, 1) : part.frames)
                    layer.frames.push(
                        new FrameLayer(
                            part,
                            frame,
                            camera,
                            r.posObj,
                            palette,
                            // Keep ground and naval artwork above the reference surface,
                            // including civilian and future hulls. Native pitch and sinking
                            // still apply through the live pose.
                            !r.gameObject.isAircraft() && !r.objectRules.balloonHover,
                            rotor,
                            !!r.objectRules.missileSpawn,
                            bodyHeight,
                            disc,
                            !!r.gameObject.tilterTrait && !r.objectRules.naval && !r.gameObject.isAircraft()
                                && !r.objectRules.balloonHover && !r.objectRules.missileSpawn && !rotor && !bodyHeight,
                        ),
                    );
            }
        } catch (error) {
            this.hidden.forEach((m) => { unregisterShadowOnlyMaterial(m); m.dispose(); });
            this.shadowOccluders.forEach((m) => {
                m.removeFromParent();
                (m.material as THREE.Material).dispose();
            });
            this.layers.forEach((p) => { p.mast?.dispose(); p.frames.forEach((f) => f.dispose()); });
            throw error;
        }
        this.shadow = new RhinoShadow(this.meshes);
        if (r.gameObject.isVehicle?.()) this.meshes.forEach(registerVehicleShadowCaster);
    }
    update() {
        if (this.disposed) return;
        const r = this.r,
            u = r.gameObject;
        const now = performance.now(), elapsed = this.lastGattlingTime === undefined ? 0
            : Math.min(.1, (now - this.lastGattlingTime) / 1000);
        this.lastGattlingTime = now;
        const discPhase = this.family.identity === 'DISK' ? this.discRotation.update(
            u.turretTrait.facing, now, 1000 / (15 * (r.gameSpeed?.value ?? 1))) : 0;
        const gattlingActive = !!u.rules.isGattling && u.armedTrait.gattlingHeat > 0 && !u.attackTrait.isIdle();
        if (gattlingActive) this.gattlingPhase = (this.gattlingPhase
            + elapsed * Math.PI * 2 * gattlingSpinRates[u.armedTrait.getGattlingStage()] * (r.gameSpeed?.value ?? 1)) % (Math.PI * 2);
        r.posObj.updateWorldMatrix(true, true);
        const opacity = this.meshes[0].getOpacity?.() ?? this.originals[0].opacity;
        this.active =
            Number.isFinite(opacity) &&
            opacity >= 0 &&
            opacity <= 1 &&
            !(opacity < 1 && this.meshes.some((m) => m.isBatchedMesh));
        const inversePosition = r.posObj.matrixWorld.clone().invert();
        const bodyYaw = THREE.MathUtils.radToDeg(
            r.tiltObj.rotation.y + (r.dirWrapObj?.rotation.y ?? 0),
        );
        const palette = textureFromPalette(r.palette);
        const dock = ['ORCA', 'BEAG'].includes(u.name) && u.zone === 0
            ? u.traits.find(DockableTrait)?.dock : undefined;
        const dockRenderable = dock?.dockTrait.isDocked(u)
            ? r.renderableManager?.getRenderableByGameObject(dock) : undefined;
        const dockMeshes = dockRenderable ? [dockRenderable.mainObj, dockRenderable.bib,
            ...[...dockRenderable.animObjects.values()].flat()]
            .map(sprite => sprite?.getShapeMesh?.()).filter(Boolean) as THREE.Mesh[] : [];
        dockMeshes.forEach(mesh => mesh.updateWorldMatrix(true, false));
        if (r.shpExtraLight)
            this.light.set(
                (1 + r.shpExtraLight.x) / (1 + this.baseLight.x) - 1,
                (1 + r.shpExtraLight.y) / (1 + this.baseLight.y) - 1,
                (1 + r.shpExtraLight.z) / (1 + this.baseLight.z) - 1,
            );
        if (!r.shpExtraLight) {
            const ambient = r.lighting
                .computeTint(LightingType.Ambient)
                .multiplyScalar(r.lighting.getAmbientIntensity());
            for (const axis of ['x', 'y', 'z'] as const) {
                const base = Math.max(1e-6, ambient[axis] + r.baseExtraLight[axis] - Math.PI * 1.5);
                const current = Math.max(0, ambient[axis] + r.extraLight[axis] - Math.PI * 1.5);
                this.light[axis] = current / base - 1;
            }
        }
        // The SHP multiplier above preserves authored detail during Iron Curtain.
        const tiltedGround = !!u.tilterTrait && !r.objectRules.naval && !u.isAircraft()
            && (Math.abs(r.tiltObj.rotation.x) > .0001 || Math.abs(r.tiltObj.rotation.z) > .0001);
        const volume = tiltedGround ? new THREE.Matrix4() : undefined;
        if (tiltedGround) {
            const hull = this.layers.find(layer => !layer.turret && !layer.rotor && layer.frames[0]?.rigidSlope);
            const selectedHull = hull?.frames.find(layer => layer.frame.heading === heading(bodyYaw));
            if (hull && selectedHull) {
                selectedHull.setGroundAttitude(true);
                const currentHull = inversePosition.clone().multiply(hull.mesh.matrixWorld);
                const hullPose = componentPose(new THREE.Matrix4(), currentHull,
                    selectedHull.frame.referenceLinear, bodyYaw, selectedHull.frame.heading);
                groundVolumeCorrection(volume!, selectedHull.source.geometry, hullPose, this.camera);
            }
        }
        this.layers.forEach(({ mesh, frames, turret, rotor, mast, rotorAxis }, i) => {
            // Flat rotor artwork rotates on its native joint in 3D; it must
            // retain body yaw as well as rotor phase, unlike bearing sprites.
            const yaw = rotor ? 0 : turret ? Math.floor(u.turretTrait.facing) : bodyYaw;
            const selected = heading(yaw);
            const disc = this.family.identity === 'DISK';
            let visible = true;
            for (let parent = mesh; parent && parent !== r.posObj; parent = parent.parent)
                visible &&= parent.visible;
            const current = inversePosition.clone().multiply(mesh.matrixWorld);
            const mountOffset = rotor ? frames[0].part.frames[heading(bodyYaw) / 45].rotorMountOffset : undefined;
            if (mountOffset)
                offsetRotorMount(current, inversePosition.clone().multiply(mesh.parent.matrixWorld),
                    mountOffset);
            mast?.update(mesh, rotorAxis!, mountOffset ?? [0, 0, 0], this.active && visible, opacity, this.light,
                mesh.getClippingPlanes?.() ?? this.originals[i].clippingPlanes);
            const occluder = this.shadowOccluders[i];
            occluder.visible =
                this.active &&
                visible &&
                opacity === 1 &&
                !u.onBridge &&
                !!u.position.getBridgeBelow()?.isHighBridge() &&
                u.zone !== 1;
            occluder.matrix.copy(mesh.matrix);
            occluder.matrixWorldNeedsUpdate = true;
            occluder.renderOrder = 4;
            (occluder.material as THREE.Material).clippingPlanes =
                mesh.getClippingPlanes?.() ?? this.originals[i].clippingPlanes;

            this.hidden[i].clippingPlanes = this.originals[i].clippingPlanes;
            this.hidden[i].opacity = this.originals[i].opacity;
            mesh.material = this.active ? this.hidden[i] : this.originals[i];
            for (const layer of frames) {
                const displayed = disc || selected === layer.frame.heading;
                if (!displayed) {
                    // A cached bearing gets its current pose and uniforms when
                    // selected again. Keep inactive views detached meanwhile.
                    layer.update(false, this.pose, this.light, palette, mesh.renderOrder,
                        mesh.getClippingPlanes?.() ?? this.originals[i].clippingPlanes, opacity);
                    continue;
                }
                if (disc) {
                    for (const pass of [layer.batch.material, layer.depth.material, layer.translucent.material,
                        ...layer.batch.children.map(child => (child as THREE.Mesh).material)])
                        (pass as HdSpriteMaterial).uniforms.discPhase.value = THREE.MathUtils.degToRad(discPhase % 360);
                    layer.batch.userData.discPhase = discPhase;
                }
                if (isGattlingBarrel(layer.part)) {
                    for (const material of [layer.batch.material, layer.depth.material, layer.translucent.material,
                        ...layer.batch.children.map(child => (child as THREE.Mesh).material)]) {
                        const uniforms = (material as HdSpriteMaterial).uniforms;
                        uniforms.gattlingPhase.value = this.gattlingPhase;
                        uniforms.gattlingActive.value = Number(gattlingActive);
                    }
                    layer.batch.userData.gattlingStage = u.armedTrait.getGattlingStage();
                    layer.batch.userData.gattlingSpinRate = gattlingActive ? gattlingSpinRates[u.armedTrait.getGattlingStage()] : 0;
                }
                if (layer.rigidSlope)
                    layer.setGroundAttitude(Math.abs(r.tiltObj.rotation.x) > .0001 || Math.abs(r.tiltObj.rotation.z) > .0001);
                // The recovered missile axis must follow continuous native yaw
                // as well as pitch, even between the eight authored bearings.
                componentPose(
                    this.pose,
                    current,
                    layer.frame.referenceLinear,
                    u.rules.missileSpawn ? layer.frame.heading : yaw,
                    layer.frame.heading,
                );
                if (volume && layer.rigidSlope) this.pose.premultiply(volume);
                if (dockMeshes.length && selected === layer.frame.heading) {
                    const world = r.posObj.matrixWorld.clone().multiply(this.pose);
                    const key = `${dock!.id}/${selected}/${world.elements.join(',')}/${dockMeshes.map(m => m.geometry.uuid).join(',')}`;
                    if (this.dockDepthCache?.key !== key)
                        this.dockDepthCache = { key, offset: Math.max(...dockMeshes.map(mesh =>
                            dockDepthOffset(layer.source.geometry, world, mesh, this.towardCamera))) };
                    const shift = this.towardCamera.clone().transformDirection(inversePosition)
                        .multiplyScalar(this.dockDepthCache.offset);
                    this.pose.elements[12] += shift.x;
                    this.pose.elements[13] += shift.y;
                    this.pose.elements[14] += shift.z;
                }
                layer.update(
                    this.active && visible && !!displayed,
                    this.pose,
                    this.light,
                    palette,
                    mesh.renderOrder,
                    mesh.getClippingPlanes?.() ?? this.originals[i].clippingPlanes,
                    opacity,
                );
            }
        });
        this.shadow.update(this.active, opacity);
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.active = false;
        this.meshes.forEach((mesh, i) => (mesh.material = this.originals[i]));
        this.meshes.forEach(unregisterVehicleShadowCaster);
        this.shadow.dispose();
        this.hidden.forEach((m) => { unregisterShadowOnlyMaterial(m); m.dispose(); });
        this.shadowOccluders.forEach((m) => {
            m.removeFromParent();
            (m.material as THREE.Material).dispose();
        });
        this.layers.forEach((p) => { p.mast?.dispose(); p.frames.forEach((f) => f.dispose()); });
    }
}

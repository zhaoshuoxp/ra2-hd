import * as THREE from 'three';
import SPE from '../../renderable/fx/speRuntime';
import { patchSpeGroup } from '../../renderable/fx/speCompat';
import { HdSpriteMaterial } from '../material/HdSpriteMaterial';
import { MergedSpriteMesh } from './MergedSpriteMesh';
import { BatchedMesh, BatchMode } from './BatchedMesh';

// Keep the four variants captured by the Windows C6 S1 trace, plus the untiled
// and pooled-tile HD embedded-shadow body/coverage pairs (4X conscripts) whose
// first sight compiled for 290-420 ms early in a Windows 84a0b348 match. These
// detached owners compile only: they borrow loaded textures and never draw or
// spawn FX.
export class CombatProgramWarmup {
    public readonly mesh = new THREE.Group();
    private readonly sprites: MergedSpriteMesh[] = [];
    private smoke?: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
    private disposed = false;

    static create(scene: THREE.Scene): CombatProgramWarmup | undefined {
        let seed: HdSpriteMaterial | undefined;
        scene.traverse(object => {
            if (seed) return;
            const material = (object as THREE.Mesh).material;
            seed = (Array.isArray(material) ? material : [material]).find(candidate =>
                candidate instanceof HdSpriteMaterial && candidate.map && candidate.palette
                && candidate.defines?.INDEXED_COVERAGE === undefined) as HdSpriteMaterial | undefined;
        });
        if (!seed) return;
        const warmup = new CombatProgramWarmup();
        try {
            const map = seed.map!, palette = seed.palette, remapMap = seed.uniforms.remapMap.value ?? map;
            const image = map.image as { width: number; height: number };
            warmup.addSprite({ map, palette, remapMap, alphaTest: 0.05,
                tiles: { map, dataMap: map, virtualSize: [image.width, image.height] } });
            warmup.addSprite({ map, palette, remapMap, alphaTest: 0.5,
                indexedCoverage: true, embeddedShadowMap: map, nearestIndexedBody: true });
            // Same options as ShpBuilder.createMaterial for untiled and pooled HD pages.
            warmup.addSprite({ map, palette, remapMap, alphaTest: 0.05, embeddedShadowMap: map });
            warmup.addSprite({ map, palette, remapMap, alphaTest: 0.05, embeddedShadowMap: map,
                tiles: { map, virtualSize: [image.width, image.height] } });
            const group = new SPE.Group({ texture: { value: map, frames: new THREE.Vector2(2, 1) },
                maxParticleCount: 1, hasPerspective: false, transparent: true,
                alphaTest: 0, blending: THREE.NormalBlending });
            patchSpeGroup(group);
            warmup.smoke = group.mesh;
            warmup.mesh.add(group.mesh);
            return warmup;
        } catch (error) {
            warmup.dispose();
            throw error;
        }
    }

    private addSprite(options: object): void {
        const geometry = new THREE.PlaneGeometry(1, 1);
        geometry.setAttribute('shadowFrameRect', new THREE.BufferAttribute(new Float32Array(16), 4));
        const material = new HdSpriteMaterial(options);
        try {
            const mesh = new MergedSpriteMesh(geometry, material, 1);
            this.sprites.push(mesh);
            this.mesh.add(mesh);
            mesh.updateFromMeshes([new BatchedMesh(geometry, material, BatchMode.Merging)]);
        } finally {
            geometry.dispose();
            material.dispose();
        }
    }

    async prepare(renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene): Promise<void> {
        await renderer.compileAsync(this.mesh, camera, scene);
        this.mesh.traverse(object => {
            const material = (object as THREE.Mesh).material;
            if (!material || Array.isArray(material)) return;
            const properties = renderer.properties.get(material) as { currentProgram: { getUniforms(): unknown } };
            properties.currentProgram.getUniforms();
        });
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.sprites.forEach(mesh => mesh.dispose());
        this.smoke?.geometry.dispose();
        this.smoke?.material.dispose();
    }
}

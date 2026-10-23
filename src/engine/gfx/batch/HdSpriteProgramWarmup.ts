import * as THREE from 'three';
import { HdSpriteMaterial } from '../material/HdSpriteMaterial';
import { BatchedMesh, BatchMode } from './BatchedMesh';
import { MergedSpriteMesh } from './MergedSpriteMesh';

// Prepare the measured non-tiled, unclipped opaque/coverage pair before play.
// The detached mesh borrows existing textures and never submits a draw.
export class HdSpriteProgramWarmup {
    private constructor(public readonly mesh: MergedSpriteMesh) {}

    static create(scene: THREE.Scene): HdSpriteProgramWarmup | undefined {
        let seed: HdSpriteMaterial | undefined;
        scene.traverse(object => {
            if (seed) return;
            const material = (object as THREE.Mesh).material;
            const materials = Array.isArray(material) ? material : [material];
            seed = materials.find(candidate => candidate instanceof HdSpriteMaterial
                && candidate.map && candidate.palette
                && candidate.defines?.INDEXED_COVERAGE === undefined) as HdSpriteMaterial | undefined;
        });
        if (!seed) return;
        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new HdSpriteMaterial({ map: seed.map, palette: seed.palette,
            remapMap: seed.uniforms.remapMap.value, alphaTest: 0.5 });
        try {
            const mesh = new MergedSpriteMesh(geometry, material, 1);
            mesh.updateFromMeshes([new BatchedMesh(geometry, material, BatchMode.Merging)]);
            return new HdSpriteProgramWarmup(mesh);
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
            // compileAsync alone defers first-use validation when parallel
            // compilation is unavailable. Keep normal error checks in loading.
            const properties = renderer.properties.get(material) as { currentProgram: { getUniforms(): unknown } };
            properties.currentProgram.getUniforms();
        });
    }

    dispose(): void {
        this.mesh.dispose();
    }
}

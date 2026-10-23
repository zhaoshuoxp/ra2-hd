import * as THREE from 'three';
import { PaletteBasicMaterial } from '../material/PaletteBasicMaterial';
import { MergedSpriteMesh } from './MergedSpriteMesh';

// Combat animations can disappear between frames, releasing both programs.
// Hold the measured indexed front/back variants without drawing or owning art.
export class PaletteSpriteProgramWarmup {
    private constructor(public readonly mesh: THREE.Group) {}

    static create(scene: THREE.Scene): PaletteSpriteProgramWarmup | undefined {
        let seed: PaletteBasicMaterial | undefined;
        scene.traverse(object => {
            if (seed) return;
            const material = (object as THREE.Mesh).material;
            const materials = Array.isArray(material) ? material : [material];
            seed = materials.find(candidate => candidate instanceof PaletteBasicMaterial
                && candidate.map && candidate.palette) as PaletteBasicMaterial | undefined;
        });
        if (!seed) return;
        const geometry = new THREE.PlaneGeometry(1, 1), group = new THREE.Group();
        try {
            for (const side of [THREE.BackSide, THREE.FrontSide]) {
                const material = new PaletteBasicMaterial({ map: seed.map, palette: seed.palette,
                    transparent: true, alphaTest: 0.05, side });
                try { group.add(new MergedSpriteMesh(geometry, material, 1)); }
                finally { material.dispose(); }
            }
            return new PaletteSpriteProgramWarmup(group);
        } catch (error) {
            group.children.forEach(mesh => (mesh as MergedSpriteMesh).dispose());
            throw error;
        } finally { geometry.dispose(); }
    }

    async prepare(renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene): Promise<void> {
        await renderer.compileAsync(this.mesh, camera, scene);
        for (const mesh of this.mesh.children) {
            const material = (mesh as THREE.Mesh).material;
            const properties = renderer.properties.get(material) as { currentProgram: { getUniforms(): unknown } };
            properties.currentProgram.getUniforms();
        }
    }

    dispose(): void {
        this.mesh.children.forEach(mesh => (mesh as MergedSpriteMesh).dispose());
    }
}

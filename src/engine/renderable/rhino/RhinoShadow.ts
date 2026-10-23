import * as THREE from 'three';

// Depth shadows ignore the visible material's opacity. Coverage in light-map
// texels lets the existing PCF receiver fade only this caster's shadow. All
// three sections share the same pattern, so overlapping parts do not stack it.
export class RhinoShadow {
    readonly opacity = { value: 1 };
    readonly material = new THREE.MeshDepthMaterial();
    readonly originals: (THREE.Material | undefined)[];
    constructor(readonly meshes: THREE.Mesh[]) {
        this.originals = meshes.map(m => m.customDepthMaterial);
        this.material.onBeforeCompile = shader => {
            shader.uniforms.rhinoShadowOpacity = this.opacity;
            shader.fragmentShader = 'uniform float rhinoShadowOpacity;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('void main() {', `void main() {
                vec2 cell = mod(floor(gl_FragCoord.xy), 2.0);
                float threshold = (2.0 * cell.x + 3.0 * cell.y - 4.0 * cell.x * cell.y + 0.5) / 4.0;
                if (rhinoShadowOpacity <= threshold) discard;
            `);
        };
        this.material.customProgramCacheKey = () => 'rhino-shadow-coverage-v1';
    }
    update(active: boolean, opacity: number): void {
        this.opacity.value = opacity;
        this.meshes.forEach((mesh, i) => {
            mesh.customDepthMaterial = active && opacity < 1 ? this.material : this.originals[i];
        });
    }
    dispose(): void {
        this.update(false, 1);
        this.material.dispose();
    }
}

import * as THREE from 'three';
import { getMeshLineResolution } from './MeshLineResolution';

const SEGMENTS = 64;
const WIDTH = 10;

export class MagneticBeamFx {
    private group?: THREE.Group;
    private ribbon?: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    private container?: any;
    private started?: number;
    constructor(private camera: THREE.Camera, private source: () => THREE.Vector3,
        private target: () => THREE.Vector3, private color: THREE.Color, private duration?: number) {}
    setContainer(container: any): void { this.container = container; }
    get3DObject(): THREE.Group | undefined { return this.group; }
    create3DObject(): void {
        if (this.group) return;
        this.group = new THREE.Group();
        this.group.name = 'fx_magnetic_ribbon';
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 6), 3));
        const uv = new Float32Array((SEGMENTS + 1) * 4), indices: number[] = [];
        for (let i = 0; i <= SEGMENTS; i++) {
            uv.set([i / SEGMENTS, 0, i / SEGMENTS, 1], i * 4);
            if (i < SEGMENTS) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
        }
        geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geometry.setIndex(indices);
        const material = new THREE.ShaderMaterial({
            uniforms: { time: { value: 0 }, beamLength: { value: 1 }, opacityRange: { value: new THREE.Vector2(.22, .38) },
                appearance: { value: new THREE.Vector3(1.35, 1.18, 1.2) },
                emission: { value: new THREE.Vector3(.02, 0, .36) },
                nativeColor: { value: this.color },
                violet: { value: new THREE.Color(0x8744df) }, lavender: { value: new THREE.Color(0xb479f5) } },
            vertexShader: `varying vec2 ribbonUv;
                void main() { ribbonUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `uniform float time; uniform float beamLength; uniform vec2 opacityRange; uniform vec3 appearance;
                uniform vec3 emission;
                uniform vec3 nativeColor; uniform vec3 violet; uniform vec3 lavender;
                varying vec2 ribbonUv;
                void main() {
                    float across = ribbonUv.y;
                    float flow = 0.5 + 0.18 * sin(ribbonUv.x * beamLength * 0.035 - time * 2.4 + across * 1.2);
                    float paletteMix = clamp(0.625 + (flow - 0.5) * 0.55 * appearance.z, 0.0, 1.0);
                    vec3 color = mix(violet, lavender, paletteMix);
                    color = mix(color, nativeColor, 0.06);
                    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
                    color = mix(vec3(luminance), color, appearance.y) * appearance.x;
                    float edge = smoothstep(0.0, 0.05, across) * smoothstep(0.0, 0.05, 1.0 - across);
                    gl_FragColor = vec4(color, edge * mix(opacityRange.x, opacityRange.y, flow));
                    #include <colorspace_fragment>
                    gl_FragColor.rgb = gl_FragColor.rgb * gl_FragColor.a + emission * edge;
                }`,
            transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
            blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        });
        this.ribbon = new THREE.Mesh(geometry, material);
        this.ribbon.renderOrder = 1000000;
        this.ribbon.frustumCulled = false;
        this.group.add(this.ribbon);
    }
    update(time: number): void {
        this.started ??= time;
        if (this.duration && time - this.started >= this.duration * 1000) { this.removeAndDispose(); return; }
        if (!this.group || !this.ribbon) return;
        const source = this.source(), target = this.target(), elapsed = (time - this.started) / 1000;
        const direction = target.clone().sub(source);
        const normal = this.camera.getWorldDirection(new THREE.Vector3());
        const side = direction.clone().cross(normal).normalize();
        if (!side.lengthSq()) side.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const resolution = getMeshLineResolution(this.camera);
        const worldPerPixel = 2 / (this.camera.projectionMatrix.elements[5] * resolution.y);
        const width = WIDTH;
        const projectedSource = source.clone().project(this.camera), projectedTarget = target.clone().project(this.camera);
        this.ribbon.material.uniforms.beamLength.value = Math.hypot(
            (projectedTarget.x - projectedSource.x) * resolution.x / 2,
            (projectedTarget.y - projectedSource.y) * resolution.y / 2);
        this.group.userData.source = source.toArray();
        this.group.userData.target = target.toArray();
        this.group.userData.logicalWidth = width;
        this.group.userData.opacityRange = this.ribbon.material.uniforms.opacityRange.value.toArray();
        this.group.userData.appearance = this.ribbon.material.uniforms.appearance.value.toArray();
        this.group.userData.emission = this.ribbon.material.uniforms.emission.value.toArray();
        this.group.userData.animationTime = elapsed;
        const positions = this.ribbon.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i <= SEGMENTS; i++) {
            const t = i / SEGMENTS, point = source.clone().lerp(target, t);
            const half = worldPerPixel * width / 2;
            positions.setXYZ(i * 2, point.x - side.x * half, point.y - side.y * half, point.z - side.z * half);
            positions.setXYZ(i * 2 + 1, point.x + side.x * half, point.y + side.y * half, point.z + side.z * half);
        }
        positions.needsUpdate = true;
        this.ribbon.material.uniforms.time.value = elapsed;
    }
    removeAndDispose(): void { this.container?.remove(this); this.dispose(); }
    dispose(): void {
        this.ribbon?.geometry.dispose();
        this.ribbon?.material.dispose();
        this.ribbon = undefined;
        this.group = undefined;
    }
}

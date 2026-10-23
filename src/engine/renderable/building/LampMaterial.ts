import * as THREE from 'three';

// Lamp texels are blend coefficients, not display colors. Neither encoding the
// gradient nor drawing it may apply the display color-space transfer function.
export function lampCoefficientHex(color: THREE.Color): string {
    return color.getHexString(THREE.LinearSRGBColorSpace);
}

export function createLampMaterial(texture: THREE.Texture, intensity: number): THREE.ShaderMaterial {
    texture.colorSpace = THREE.NoColorSpace;
    return new THREE.ShaderMaterial({
        uniforms: { lampMap: { value: texture } },
        vertexShader: `varying vec2 lampUv;
            void main() {
                lampUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `uniform sampler2D lampMap;
            varying vec2 lampUv;
            void main() { gl_FragColor = texture2D(lampMap, lampUv); }`,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
        blending: THREE.CustomBlending,
        blendEquation: intensity > 0 ? THREE.AddEquation : THREE.ReverseSubtractEquation,
        blendSrc: THREE.DstColorFactor,
        blendDst: THREE.OneFactor,
        blendEquationAlpha: THREE.AddEquation,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
    });
}

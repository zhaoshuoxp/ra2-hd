import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { createLampMaterial, lampCoefficientHex } from '../../src/engine/renderable/building/LampMaterial';
import { ScoreTable } from '../../src/gui/screen/mainMenu/score/ScoreTable';

test('lamp coefficients retain their numeric intensity without display encoding', () => {
    const coefficient = new THREE.Color(.25, .1, 0);
    expect(lampCoefficientHex(coefficient)).toBe('401a00');
    expect(lampCoefficientHex(new THREE.Color(0, 0, 0))).toBe('000000');
    expect(coefficient.getHexString()).not.toBe(lampCoefficientHex(coefficient));
});

test('positive and negative lamps preserve destination alpha and raw coefficient sampling', () => {
    for (const intensity of [.2, -.15]) {
        const texture = new THREE.Texture();
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = createLampMaterial(texture, intensity);
        expect(texture.colorSpace).toBe(THREE.NoColorSpace);
        expect(material.uniforms.lampMap.value).toBe(texture);
        expect(material.blendEquation).toBe(intensity > 0 ? THREE.AddEquation : THREE.ReverseSubtractEquation);
        expect(material.blendSrc).toBe(THREE.DstColorFactor);
        expect(material.blendDst).toBe(THREE.OneFactor);
        expect(material.blendEquationAlpha).toBe(THREE.AddEquation);
        expect(material.blendSrcAlpha).toBe(THREE.ZeroFactor);
        expect(material.blendDstAlpha).toBe(THREE.OneFactor);
        expect(material.toneMapped).toBe(false);
        expect(material.fragmentShader).not.toContain('colorspace_fragment');
        material.dispose(); texture.dispose();
    }
});

function text(node: any): string {
    if (Array.isArray(node)) return node.map(text).join('');
    if (node == null || typeof node === 'boolean') return '';
    return typeof node === 'object' ? text(node.props?.children) : String(node);
}

test('score time follows elapsed simulation time across speed changes and paused exits', () => {
    for (const speed of [Number.EPSILON, 0, .5, 1, 3, 4]) {
        const game = { getNonNeutralPlayers: () => [], currentTime: 3661999, speed: { value: speed } };
        const output = ScoreTable({ game, localPlayer: { isObserver: true }, singlePlayer: true,
            tournament: false, strings: { get: (key: string) => key } });
        expect(text(output)).toContain('GUI:Time: 1:01:01');
    }
});

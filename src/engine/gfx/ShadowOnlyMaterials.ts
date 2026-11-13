import type * as THREE from 'three';

// A material that writes neither colour nor depth has no effect in a colour
// pass, yet Three still binds its program, uniforms and attributes for every
// object that uses it. Such materials stay excluded from scene projection and
// become visible only while Three renders its shadow maps, where the same
// object must keep casting. Shadow output and the main framebuffer are
// unchanged; only the empty main-pass submissions disappear.
const shadowOnly = new Set<THREE.Material>();
const INSTALLED = Symbol.for('ra2.shadowOnlyPass');

export function registerShadowOnlyMaterial(material: THREE.Material): void {
    if (material.colorWrite !== false || material.depthWrite !== false)
        throw new Error('Only materials without colour and depth output can be shadow-only');
    shadowOnly.add(material);
    material.visible = false;
}

export function unregisterShadowOnlyMaterial(material: THREE.Material): void {
    if (shadowOnly.delete(material)) material.visible = true;
}

export function shadowOnlyMaterialCount(): number {
    return shadowOnly.size;
}

export function isShadowOnlyMaterial(material: THREE.Material): boolean { return shadowOnly.has(material); }

function setShadowOnlyVisible(visible: boolean): void {
    for (const material of shadowOnly) material.visible = visible;
}

// WebGLRenderer.render projects the visible scene before it calls
// shadowMap.render; the shadow pass then reads material.visible again for each
// caster. Wrapping that instance method scopes the restored visibility exactly
// to shadow-map rendering.
export function installShadowOnlyPass(renderer: THREE.WebGLRenderer): void {
    const shadowMap = renderer.shadowMap as THREE.WebGLShadowMap & { [INSTALLED]?: boolean };
    if (shadowMap[INSTALLED]) return;
    const render = shadowMap.render;
    shadowMap.render = function (this: THREE.WebGLShadowMap, ...args: Parameters<typeof render>) {
        setShadowOnlyVisible(true);
        try { return render.apply(this, args); }
        finally { setShadowOnlyVisible(false); }
    };
    shadowMap[INSTALLED] = true;
}

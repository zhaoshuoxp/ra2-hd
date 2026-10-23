import type * as THREE from 'three';

// Complete families remain unpublished while upload slices let input and
// native game ticks run. Individual GPU calls are driver controlled.
export async function uploadHdTextures(renderer: Pick<THREE.WebGLRenderer, 'initTexture'>,
    textures: THREE.Texture[], stopped = () => false, now = () => performance.now(),
    yieldTask = () => new Promise<void>(resolve => setTimeout(resolve, 0))) {
    let started = now();
    for (const [index, texture] of textures.entries()) {
        if (stopped()) throw Error('cancelled');
        renderer.initTexture(texture);
        if (index + 1 < textures.length && now() - started >= 6) { await yieldTask(); started = now(); }
    }
    if (stopped()) throw Error('cancelled');
}

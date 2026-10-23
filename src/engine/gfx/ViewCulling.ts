import * as THREE from 'three';

// World renderables are otherwise never hidden outside the camera view: the
// octree culler only flagged its own internal nodes, and HD/batched meshes opt
// out of Three's per-object frustum test. Every object on the map then entered
// matrix traversal, sprite batching, the shadow pass and the main pass.
//
// Culling is stored beside the game's own visibility instead of overwriting
// it, so cloak, garrison and destruction code keep their original semantics.

const CULLED = Symbol.for('ra2.viewCulled');
const INSTALLED = Symbol.for('ra2.viewCullInstalled');

// Screen-pixel margins beyond the view keep shadows, tall artwork and the
// first frames of scrolling covered before an object reaches the edge.
export const VIEW_CULL_PADDING_X = 360;
export const VIEW_CULL_PADDING_Y = 300;
const TILE_SCREEN_WIDTH = 60;

type Cullable = THREE.Object3D & { [CULLED]?: boolean; [INSTALLED]?: boolean };

function install(object: Cullable): void {
    if (object[INSTALLED]) return;
    let intended = object.visible;
    object[CULLED] = false;
    Object.defineProperty(object, 'visible', {
        configurable: true,
        enumerable: true,
        get(this: Cullable) { return intended && !this[CULLED]; },
        set(value: boolean) { intended = value; },
    });
    object[INSTALLED] = true;
}

export function isViewCulled(object: THREE.Object3D | undefined): boolean {
    return !!(object as Cullable | undefined)?.[CULLED];
}

// Returns true when the state changed.
export function setViewCulled(object: THREE.Object3D, culled: boolean): boolean {
    const target = object as Cullable;
    if (!!target[CULLED] === culled) return false;
    install(target);
    target[CULLED] = culled;
    return true;
}

// Three 0.183 visits every descendant in updateMatrixWorld even when
// matrixWorldAutoUpdate is false, and consumes the root's dirty flag without
// recomputing it. Prune culled roots here instead and keep their flags: a
// forced pass marks the root dirty so it recomputes once it is restored.
export function installCulledMatrixTraversal(root: THREE.Object3D): void {
    root.updateMatrixWorld = function (this: THREE.Object3D, force?: boolean) {
        if (this.matrixAutoUpdate) this.updateMatrix();
        if (this.matrixWorldNeedsUpdate || force) {
            if (this.matrixWorldAutoUpdate) {
                if (this.parent === null) this.matrixWorld.copy(this.matrix);
                else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
            }
            this.matrixWorldNeedsUpdate = false;
            force = true;
        }
        const children = this.children;
        for (let i = 0, l = children.length; i < l; i++) {
            const child = children[i] as Cullable;
            if (child[CULLED]) {
                if (force) child.matrixWorldNeedsUpdate = true;
            } else child.updateMatrixWorld(force);
        }
    };
}

// Extra screen-pixel extent for a world renderable, or undefined when it must
// never be culled (non-positioned roots, aircraft shadows/altitude).
export function viewCullExtent(renderable: any): number | undefined {
    const gameObject = renderable?.gameObject;
    if (!gameObject || typeof renderable.setPosition !== 'function') return undefined;
    if (gameObject.isAircraft?.()) return undefined;
    if (gameObject.isBuilding?.()) {
        const foundation = gameObject.getFoundation?.();
        const size = foundation ? Math.max(foundation.width ?? 0, foundation.height ?? 0) : 4;
        return (size + 1) * TILE_SCREEN_WIDTH;
    }
    return 0;
}

export class ViewCuller {
    // Rows of (camera view × container world) projecting a local position
    // straight to view-space x/y.
    private readonly view = new THREE.Matrix4();
    private readonly combined = new THREE.Matrix4();
    private centerX = 0;
    private centerY = 0;
    private halfWidth = 0;
    private halfHeight = 0;
    private worldPerPixel = 0;
    private readonly camera: THREE.Camera;
    private readonly root: THREE.Object3D;

    constructor(camera: THREE.Camera, root: THREE.Object3D) {
        this.camera = camera;
        this.root = root;
    }

    // Capture the current orthographic view. Returns false for other cameras.
    begin(viewportWidth: number): boolean {
        const camera = this.camera as THREE.OrthographicCamera;
        if (!camera.isOrthographicCamera || !(viewportWidth > 0)) return false;
        camera.updateMatrixWorld();
        this.view.copy(camera.matrixWorld).invert();
        this.combined.multiplyMatrices(this.view, this.root.matrixWorld);
        const zoom = camera.zoom || 1;
        this.centerX = (camera.right + camera.left) / 2;
        this.centerY = (camera.top + camera.bottom) / 2;
        this.halfWidth = (camera.right - camera.left) / (2 * zoom);
        this.halfHeight = (camera.top - camera.bottom) / (2 * zoom);
        this.worldPerPixel = (2 * this.halfWidth) / viewportWidth;
        return true;
    }

    // Uses the local position: renderable roots sit directly below the static
    // identity container, so their own matrixWorld may be stale while culled.
    contains(object: THREE.Object3D, extraPixels: number): boolean {
        return this.containsPosition(object.position, extraPixels);
    }

    containsPosition(p: THREE.Vector3, extraPixels: number): boolean {
        const e = this.combined.elements;
        const x = e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12];
        const y = e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13];
        const padX = (VIEW_CULL_PADDING_X + extraPixels) * this.worldPerPixel;
        const padY = (VIEW_CULL_PADDING_Y + extraPixels) * this.worldPerPixel;
        return Math.abs(x - this.centerX) <= this.halfWidth + padX
            && Math.abs(y - this.centerY) <= this.halfHeight + padY;
    }
}

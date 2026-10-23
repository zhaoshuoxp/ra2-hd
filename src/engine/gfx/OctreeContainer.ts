import { RenderableContainer, type Renderable } from './RenderableContainer';
import * as THREE from 'three';
import { ViewCuller, installCulledMatrixTraversal, setViewCulled, viewCullExtent } from './ViewCulling';

interface CullEntry {
    renderable: any;
    object: THREE.Object3D | undefined;
    // Cached so the per-frame loop reads one monomorphic Vector3, not each
    // renderable class's root object.
    position: THREE.Vector3 | undefined;
    culled: boolean;
    extent: number | null;
    building: boolean;
}

// Container of all world renderables. It used to maintain a
// @brakebein/threeoctree index, but that tree was created deferred and never
// updated: every add only appended to its pending list, and every position
// change scanned that ever-growing list (dead objects included) in remove().
// Its culling result was never applied either. View culling below replaces it.
export class OctreeContainer extends RenderableContainer {
    autoCull: boolean;
    private camera: THREE.Camera;
    private viewCuller: ViewCuller;
    // Flat per-renderable records keep the per-frame loop monomorphic. A null
    // extent marks a renderable that is never culled.
    private cullEntries: CullEntry[] = [];
    private cullEntriesByRenderable = new Map<Renderable, CullEntry>();
    static factory(camera: THREE.Camera): OctreeContainer {
        return new OctreeContainer(undefined, undefined, camera);
    }
    // The first two parameters are retained for existing callers and ignored.
    constructor(_tree: unknown, _frustumCuller: unknown, camera: THREE.Camera) {
        const dummyObject = new THREE.Object3D();
        dummyObject.name = 'octree-container';
        // This identity wrapper never moves. Recomposition would force every
        // actor's world matrix even when its native local transform is unchanged.
        dummyObject.matrixAutoUpdate = false;
        installCulledMatrixTraversal(dummyObject);
        super(dummyObject);
        this.autoCull = true;
        this.camera = camera;
        this.viewCuller = new ViewCuller(camera, dummyObject);
    }
    // Kept for callers; there is no spatial index to maintain.
    cullChildren(): void {}
    // Runs every frame after the camera update and before the explicit scene
    // matrix pass. Renderable updates still run for every object; only their
    // presentation leaves traversal, batching and draw submission.
    cullRenderables(viewportWidth: number): void {
        if (!this.viewCuller.begin(viewportWidth)) return;
        const entries = this.cullEntries;
        for (let i = 0, l = entries.length; i < l; i++) {
            const entry = entries[i];
            if (entry.extent === null) continue;
            let position = entry.position;
            if (!position) {
                const object = entry.object ??= entry.renderable.get3DObject();
                if (!object) continue;
                position = entry.position = object.position;
            }
            // A visible range circle reaches far beyond the foundation.
            const culled = !(entry.building && entry.renderable.rangeCircleWrapper?.visible)
                && !this.viewCuller.containsPosition(position, entry.extent);
            if (culled === entry.culled) continue;
            entry.culled = culled;
            if (setViewCulled(entry.object!, culled) && !culled) entry.renderable.onViewCullRestore?.();
        }
    }
    add(...objects: Renderable[]): void {
        super.add(...objects);
        for (const renderable of objects) {
            if (this.cullEntriesByRenderable.has(renderable)) continue;
            const r = renderable as any;
            const entry: CullEntry = { renderable: r, object: undefined, position: undefined, culled: false, extent: viewCullExtent(r) ?? null,
                building: !!r.gameObject?.isBuilding?.() };
            this.cullEntriesByRenderable.set(renderable, entry);
            this.cullEntries.push(entry);
        }
    }
    remove(...objects: Renderable[]): void {
        for (const renderable of objects) {
            const entry = this.cullEntriesByRenderable.get(renderable);
            if (!entry) continue;
            this.cullEntriesByRenderable.delete(renderable);
            const index = this.cullEntries.indexOf(entry);
            if (index !== -1) this.cullEntries.splice(index, 1);
            // A removed renderable may be re-added elsewhere; never leave it hidden.
            const object = entry.object ?? renderable.get3DObject();
            if (object) setViewCulled(object, false);
        }
        super.remove(...objects);
    }
    // Kept for callers; there is no spatial index to maintain.
    updateChild(_child: any): void {}
}

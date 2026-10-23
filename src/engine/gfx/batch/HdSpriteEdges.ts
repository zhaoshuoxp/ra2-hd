import * as THREE from 'three';
import { HdSpriteMaterial } from '../material/HdSpriteMaterial';
import type { MergedSpriteMesh } from './MergedSpriteMesh';

// Each sorted edge draw views the batch's existing GPU buffers. No per-frame
// attribute copies, uploads or transient geometry allocations are required.
export class HdSpriteEdges {
    private readonly material: HdSpriteMaterial;
    private readonly meshes: THREE.Mesh[] = [];
    private readonly bounds = new THREE.Box3();
    private readonly point = new THREE.Vector3();

    constructor(private readonly batch: MergedSpriteMesh, fullCoverage = false, private readonly orderedCoverage = false) {
        this.material = (batch.material as HdSpriteMaterial).clone();
        this.material.enableFiltering(fullCoverage ? 'full' : 'edge');
        // Sorted sprite cards need one double-sided coverage draw, without
        // separate back/front submissions for transparent volume surfaces.
        this.material.forceSinglePass = true;
        if (orderedCoverage) {
            // Bridge decks are ordered overlays without a depth-writing surface.
            // Coverage must blend within the unit's native band, before the deck.
            this.material.transparent = false;
            this.material.blending = THREE.CustomBlending;
            this.material.blendEquation = this.material.blendEquationAlpha = THREE.AddEquation;
            this.material.blendSrc = this.material.blendSrcAlpha = THREE.OneFactor;
            this.material.blendDst = this.material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
        }
        this.material.uniforms.hdFiltering = (batch.material as HdSpriteMaterial).uniforms.hdFiltering;
    }

    update(count: number): void {
        const source = this.batch.geometry;
        this.material.clippingPlanes = (this.batch.material as HdSpriteMaterial).clippingPlanes;
        for (let i = 0; i < count; i++) {
            let mesh = this.meshes[i];
            if (!mesh) {
                const geometry = new THREE.BufferGeometry();
                for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
                geometry.setIndex(source.index);
                const stride = source.index ? this.batch.indicesPerItem! : this.batch.verticesPerItem;
                geometry.setDrawRange(i * stride, stride);
                geometry.boundingSphere = new THREE.Sphere();
                mesh = new THREE.Mesh(geometry, this.material);
                mesh.name = 'hd-sprite-edge';
                mesh.matrixAutoUpdate = false;
                mesh.frustumCulled = false;
                this.meshes.push(mesh);
                this.batch.add(mesh);
            }
            // Sort by this sprite's bounds, not the center of the whole batch.
            this.bounds.makeEmpty();
            const start = i * this.batch.verticesPerItem;
            for (let v = start; v < start + this.batch.verticesPerItem; v++) {
                this.point.fromBufferAttribute(source.attributes.position, v);
                this.bounds.expandByPoint(this.point);
            }
            this.bounds.getBoundingSphere(mesh.geometry.boundingSphere!);
            mesh.renderOrder = this.batch.renderOrder + (this.orderedCoverage ? 0.25 : 0);
            mesh.visible = true;
        }
        for (let i = count; i < this.meshes.length; i++) this.meshes[i].visible = false;
    }

    dispose(): void {
        // Shared buffers are released together with their owning batch. Never
        // dispose an individual view while another live view still uses them.
        for (const mesh of this.meshes) {
            mesh.removeFromParent();
            mesh.geometry.dispose();
        }
        this.meshes.length = 0;
        this.material.dispose();
    }
}

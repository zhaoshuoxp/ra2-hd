import { MindControlLinkFx } from "@/engine/renderable/fx/MindControlLinkFx";
import * as THREE from "three";
import { Coords } from '@/game/Coords';
import { mindControlSource } from './mindControlSource';
export class MindControlLinkPlugin {
    private source: any;
    private selectionModel: any;
    private alliances: any;
    private viewer: any;
    private unitSelection: { isSelected(target: any): boolean };
    private links: Map<any, MindControlLinkFx>;
    private renderableManager?: any;
    constructor(source: any, selectionModel: any, alliances: any, viewer: any,
                unitSelection: { isSelected(target: any): boolean }, private camera?: THREE.Camera) {
        this.source = source;
        this.selectionModel = selectionModel;
        this.alliances = alliances;
        this.viewer = viewer;
        this.unitSelection = unitSelection;
        this.links = new Map();
    }
    onCreate(renderableManager: any): void {
        this.renderableManager = renderableManager;
    }
    update(): void {
        if (!this.source.isDestroyed &&
            !this.source.isCrashing &&
            this.source.mindControllerTrait) {
            if (this.viewer.value &&
                !this.alliances.haveSharedIntel(this.source.owner, this.viewer.value)) {
                this.disposeLinks();
            }
            else {
                const sourceSelected = this.selectionModel.isSelected();
                const targets = this.source.mindControllerTrait.getTargets().filter((target: any) =>
                    !target.isDestroyed && !target.isCrashing &&
                    (sourceSelected || this.unitSelection.isSelected(target)));
                for (const [target, link] of this.links.entries()) {
                    if (!targets.includes(target)) {
                        link.removeAndDispose();
                        this.links.delete(target);
                    }
                }
                if (!targets.length) return;
                const color = new THREE.Color(this.source.owner.color.asHex());
                const sourcePos = mindControlSource(this.source,
                    this.renderableManager?.getRenderableByGameObject?.(this.source), this.camera);
                for (const target of targets) {
                    const targetPos = target.position.worldPosition.clone();
                    targetPos.y += Coords.LEPTONS_PER_TILE / 4;
                    let link = this.links.get(target);
                    if (!link) {
                        link = new MindControlLinkFx(sourcePos, targetPos, color, 2);
                        this.links.set(target, link);
                        this.renderableManager?.addEffect(link);
                    }
                    link.updateEndpoints(sourcePos, targetPos);
                }
            }
        }
        else this.disposeLinks();
    }
    onRemove(): void {
        this.renderableManager = undefined;
        this.disposeLinks();
    }
    dispose(): void {
        this.disposeLinks();
    }
    private disposeLinks(): void {
        this.links.forEach((link) => link.removeAndDispose());
        this.links.clear();
    }
}

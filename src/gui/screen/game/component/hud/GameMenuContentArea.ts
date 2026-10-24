import * as THREE from "three";
import { jsx } from "@/gui/jsx/jsx";
import { UiComponent, UiComponentProps } from "@/gui/jsx/UiComponent";
import { UiObject } from "@/gui/UiObject";
import { HtmlContainer } from "@/gui/HtmlContainer";
import { SpriteUtils } from "@/engine/gfx/SpriteUtils";
import { HtmlView } from '@/gui/jsx/HtmlView';
import { SideType } from '@/game/SideType';
import { YuriPauseBackdrop } from './YuriPauseBackdrop';
import type { HtmlReactElement } from '@/gui/HtmlReactElement';
import { flushSync } from 'react-dom';
type GameMenuContentAreaProps = UiComponentProps & {
    viewport: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    screenSize: {
        width: number;
        height: number;
    };
    images: Map<string, any>;
    innerRef?: any;
    hidden?: boolean;
    side?: SideType;
};
export class GameMenuContentArea extends UiComponent<GameMenuContentAreaProps> {
    private yuriBackground?: HtmlReactElement<{ active: boolean }>;
    private background?: UiObject;
    private content?: UiObject;
    private expanded = false;
    private backgroundVisible = false;
    private originalBounds?: { x: number; y: number; width: number; height: number };
    setBackgroundVisible(active: boolean): void {
        this.backgroundVisible = active;
        // Return the pause canvas allocation before restoring hidden HUD textures.
        if (this.yuriBackground) flushSync(() => {
            this.yuriBackground!.applyOptions(props => { props.active = active && !this.expanded; });
        });
    }
    setExpanded(expanded: boolean): void {
        this.expanded = expanded;
        const bounds = expanded ? this.props.viewport : this.originalBounds;
        if (this.content && bounds) {
            this.content.setPosition(expanded ? 0 : bounds.x, expanded ? 0 : bounds.y);
            this.content.getHtmlContainer()!.setSize(bounds.width, bounds.height);
        }
        this.background?.setVisible(!expanded);
        this.setBackgroundVisible(this.backgroundVisible);
    }
    createUiObject({ viewport, hidden }: GameMenuContentAreaProps): UiObject {
        const obj = new UiObject(new THREE.Object3D(), new HtmlContainer());
        obj.setPosition(viewport.x, viewport.y);
        obj.getHtmlContainer().setSize(viewport.width, viewport.height);
        obj.setVisible(!hidden);
        return obj;
    }
    defineChildren() {
        const { viewport, screenSize, images, innerRef, } = this.props;
        let size = "lg";
        if (screenSize.width < 1024 || screenSize.height < 768)
            size = "md";
        if (screenSize.width < 800 || screenSize.height < 600)
            size = "sm";
        const bkgd = images.get(`bkgd${size}.shp`);
        const x = bkgd ? (viewport.width - bkgd.width) / 2 : 0;
        const y = bkgd ? (viewport.height - bkgd.height) / 2 : 0;
        const width = (bkgd || viewport).width;
        const height = (bkgd || viewport).height;
        this.originalBounds = { x, y, width, height };
        return jsx("fragment", null, jsx("mesh", null, this.createMask(viewport)),
            jsx("container", { zIndex: 1, x, y, width, height,
                ref: (ref: UiObject) => { this.content = ref; innerRef?.(ref); } },
                bkgd && jsx("sprite", { image: bkgd, palette: "uibkgd.pal", ref: (ref: any) => { this.background = ref; } }),
                this.props.side === SideType.ThirdSide && jsx(HtmlView, { x: 6, y: 6,
                    width: width - 12, height: height - 12, component: YuriPauseBackdrop,
                    props: { active: !this.props.hidden }, innerRef: (html: HtmlReactElement<{ active: boolean }>) => { this.yuriBackground = html; } })));
    }
    createMask(viewport: {
        width: number;
        height: number;
    }) {
        const geometry = SpriteUtils.createRectGeometry(viewport.width, viewport.height);
        geometry.translate(viewport.width / 2, viewport.height / 2, 0);
        const material = new THREE.MeshBasicMaterial({
            color: 0,
            opacity: 0.75,
            transparent: true,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        this.uiObject.onDispose.subscribe(() => {
            geometry.dispose();
            material.dispose();
        });
        return mesh;
    }
}
export default GameMenuContentArea;

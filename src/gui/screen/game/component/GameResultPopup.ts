import * as THREE from "three";
import { jsx } from "@/gui/jsx/jsx";
import { UiObject } from "@/gui/UiObject";
import { UiComponent, UiComponentProps } from "@/gui/jsx/UiComponent";
import { HtmlContainer } from "@/gui/HtmlContainer";
import { HtmlView } from '@/gui/jsx/HtmlView';
import { LocalizedGameResultBanner } from './LocalizedGameResultBanner';
export enum GameResultType {
    SpVictory = 0,
    SpDefeat = 1,
    MpVictory = 2,
    MpDefeat = 3
}
export function resultBannerTextKey(type: GameResultType): string {
    return ['HD:MissionAccomplished', 'HD:MissionFailed', 'TXT_VICTORIOUS', 'TXT_LOST'][type];
}
export type GameResultPopupProps = UiComponentProps & {
    viewport: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    type: GameResultType;
    strings?: { get(key: string): string };
    rasterScale?: number;
};
export class GameResultPopup extends UiComponent<GameResultPopupProps> {
    createUiObject() {
        const { viewport } = this.props;
        const obj = new UiObject(new THREE.Object3D(), new HtmlContainer());
        obj.setPosition(viewport.x, viewport.y);
        obj.getHtmlContainer().setSize(viewport.width, viewport.height);
        return obj;
    }
    defineChildren() {
        const { viewport, type, strings, rasterScale = 2 } = this.props;
        if (strings && type >= GameResultType.SpVictory && type <= GameResultType.MpDefeat) {
            const victory = type === GameResultType.MpVictory || type === GameResultType.SpVictory;
            return jsx(HtmlView, { width: viewport.width, height: viewport.height,
                component: LocalizedGameResultBanner,
                props: { victory, text: strings.get(resultBannerTextKey(type)), rasterScale, mission: type < 2 } });
        }
        return jsx("sprite", {
            image: "grfxtxt.shp",
            palette: "grfxtxt.pal",
            ref: (e: any) => {
                const size = e.getSize();
                e.setPosition((viewport.width - size.width) / 2, (viewport.height - size.height) / 2);
            },
            frame: type,
        });
    }
}

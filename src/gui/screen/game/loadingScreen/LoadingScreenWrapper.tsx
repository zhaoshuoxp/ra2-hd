import { activeEdition } from '@/editions/activeEdition';
import { loadingLayout } from './loadingLayout';
import { getLoadingArtwork } from './loadingArtwork';
import { jsx } from '@/gui/jsx/jsx';
import { HtmlContainer } from '@/gui/HtmlContainer';
import { UiComponent } from '@/gui/jsx/UiComponent';
import { UiObject } from '@/gui/UiObject';
import { HtmlView } from '@/gui/jsx/HtmlView';
import { LoadingScreen } from './LoadingScreen';
import { OBS_COUNTRY_NAME, OBS_COUNTRY_UI_NAME } from '@/game/gameopts/constants';
import * as THREE from 'three';
import { SideType } from '@/game/SideType';
import { Engine } from '@/engine/Engine';
import { ShpFile } from '@/data/ShpFile';
import { Palette } from '@/data/Palette';
import { ImageUtils } from '@/engine/gfx/ImageUtils';
interface Country {
    name: string;
    side: SideType;
    uiName: string;
}
interface PlayerInfo {
    name: string;
    country?: Country;
    color?: string;
}
interface Rules {
    getMultiplayerCountries(): Country[];
    colors: Map<string, any>;
}
interface Viewport {
    x: number;
    y: number;
    width: number;
    height: number;
}
interface GameResConfig {
    isCdn(): boolean;
    getCdnBaseUrl(): string;
}
interface LoadingScreenWrapperProps {
    playerInfos: PlayerInfo[];
    strings: {
        get(key: string, ...args: any[]): string;
    };
    rules: Rules;
    viewport: Viewport;
    playerName?: string;
    mapName: string;
    gameResConfig: GameResConfig;
    unitArtworkReady?: boolean;
}
export class LoadingScreenWrapper extends UiComponent<LoadingScreenWrapperProps> {
    private declare countryName: string;
    private declare color: string;
    private declare bgHtmlImg?: string;
    private declare bgSpriteImg?: string;
    private declare bgSpritePal?: string;
    private declare htmlEl?: any;
    private declare sprite?: any;
    private declare backgroundLayoutKey?: string;
    createUiObject({ playerName, gameResConfig }: {
        playerName?: string;
        gameResConfig: GameResConfig;
    }): UiObject {
        const uiObject = new UiObject(new THREE.Object3D(), new HtmlContainer());
        uiObject.onFrame.subscribe(() => this.fitBackground(this.props.viewport));
        const player = playerName
            ? this.props.playerInfos.find(p => p.name === playerName)
            : undefined;
        const countryName = player?.country ? player.country.name : OBS_COUNTRY_NAME;
        this.countryName = countryName;
        let color = player?.color ?? "#fff";
        if (player?.country) {
            const loadColorKey = player.country.side === SideType.GDI ? "AlliedLoad" : player.country.side === SideType.ThirdSide ? "YuriLoad" : "SovietLoad";
            color = this.props.rules.colors.get(loadColorKey)?.asHexString() ?? "#fff";
        }
        this.color = color;
        const artwork = getLoadingArtwork(countryName, activeEdition);
        if (artwork) {
            if (gameResConfig.isCdn()) {
                this.bgHtmlImg = gameResConfig.getCdnBaseUrl() + "ls/" + artwork.image + ".png";
            }
            else {
                this.bgSpriteImg = artwork.image + ".shp";
                this.bgSpritePal = artwork.palette;
                try {
                    const source = new ShpFile(Engine.vfs.openFile(this.bgSpriteImg));
                    const palette = new Palette(Engine.vfs.openFile(this.bgSpritePal));
                    this.bgHtmlImg = ImageUtils.convertShpToCanvas(source, palette).toDataURL();
                } catch { /* Retain the original native sprite if optional DOM decoding fails. */ }
            }
        }
        else {
            console.warn("Missing loading image for country " + countryName);
        }
        try {
            console.log('[LoadingScreenWrapper] createUiObject:', {
                isCdn: gameResConfig.isCdn(),
                countryName,
                bgSpriteImg: this.bgSpriteImg,
                bgSpritePal: this.bgSpritePal,
                hasHtmlBackground: !!this.bgHtmlImg,
            });
            if (!gameResConfig.isCdn() && Engine.vfs) {
                const imgName = this.bgSpriteImg!;
                const palName = this.bgSpritePal!;
                const imgExists = Engine.vfs.fileExists(imgName);
                const palExists = Engine.vfs.fileExists(palName);
                console.log('[LoadingScreenWrapper] VFS existence:', { imgName, imgExists, palName, palExists });
                try {
                    (Engine.vfs as any).debugListFileOwners?.(imgName);
                    (Engine.vfs as any).debugListFileOwners?.(palName);
                    console.log('[LoadingScreenWrapper] VFS archives:', Engine.vfs.listArchives());
                }
                catch { }
            }
        }
        catch { }
        return uiObject;
    }
    defineChildren(): any {
        const countries = this.props.rules.getMultiplayerCountries();
        const viewport = this.props.viewport;
        try {
            console.log('[LoadingScreenWrapper] defineChildren: willRenderSprite=', !this.props.gameResConfig.isCdn(), {
                bgSpriteImg: this.bgSpriteImg,
                bgSpritePal: this.bgSpritePal,
                viewport,
            });
        }
        catch { }
        return jsx("fragment", null, this.bgHtmlImg
            ? []
            : jsx("sprite", {
                image: this.bgSpriteImg,
                palette: this.bgSpritePal,
                x: viewport.x,
                y: viewport.y,
                ref: (sprite: any) => { this.sprite = sprite; this.fitBackground(viewport); },
            }), jsx(HtmlView, {
            innerRef: (el: any) => (this.htmlEl = el),
            component: LoadingScreen,
            props: {
                viewport: this.props.viewport,
                countryUiNames: new Map([
                    [OBS_COUNTRY_NAME, OBS_COUNTRY_UI_NAME],
                    ...countries.map(country => [country.name, country.uiName] as [
                        string,
                        string
                    ])
                ]),
                strings: this.props.strings,
                countryName: this.countryName,
                mapName: this.props.mapName,
                color: this.color,
                playerInfos: this.props.playerInfos,
                bgImageSrc: this.bgHtmlImg,
                unitArtworkReady: this.props.unitArtworkReady,
            },
        }));
    }
    private fitBackground(viewport: Viewport): void {
        if (!this.sprite) return;
        const object = this.sprite.get3DObject();
        if (!object) return;
        const key = [viewport.x, viewport.y, viewport.width, viewport.height].join(',');
        if (this.backgroundLayoutKey === key) return;
        this.backgroundLayoutKey = key;
        const size = this.sprite.getSize();
        const layout = loadingLayout(viewport.width, viewport.height, size.width, size.height);
        this.sprite.setPosition(viewport.x + layout.x, viewport.y + layout.y);
        object.scale.set(layout.cover, layout.cover, 1); object.updateMatrix();
    }
    updateViewport(viewport: Viewport): void {
        this.props.viewport = viewport;
        this.htmlEl?.applyOptions((options: any) => (options.viewport = viewport));
        this.fitBackground(viewport);
    }
    applyOptions(optionsUpdater: (options: any) => void): void {
        this.htmlEl?.applyOptions(optionsUpdater);
    }
}

import { ScreenType } from '@/gui/screen/game/gameMenu/ScreenType';
import { FullScreen } from '@/gui/FullScreen';
import { getHumanReadableKey } from '@/gui/screen/options/component/getHumanReadableKey';
import { GameMenuScreen } from '@/gui/screen/game/GameMenuScreen';
import { jsx } from '@/gui/jsx/jsx';
import { HtmlView } from '@/gui/jsx/HtmlView';
import { CampaignObjectives } from '@/gui/campaign/CampaignObjectives';
interface Strings {
    get(key: string, ...args: any[]): string;
}
interface GameMenuHomeParams {
    campaign?: { save(): void; load(): void; restart(): void; briefing?(): string };
    onCancel: () => void;
    onQuit?: () => void;
    onObserve?: () => void;
    observeAllowed?: boolean;
    onSave?: () => void;
    onLoad?: () => void;
}
interface SidebarButton {
    label: string;
    isBottom?: boolean;
    tooltip?: string;
    disabled?: boolean;
    onClick: () => void;
}
interface GameMenuController {
    toggleContentAreaVisibility(visible: boolean): void;
    setSidebarButtons(buttons: SidebarButton[]): void;
    showSidebarButtons(): void;
    hideSidebarButtons(): void;
    setMainComponent(component?: any): void;
    pushScreen?(screenType: ScreenType, params?: any): Promise<void>;
}
export class GameMenuHomeScreen extends GameMenuScreen {
    private strings: Strings;
    private fullScreen: FullScreen;
    private params?: GameMenuHomeParams;
    declare controller?: GameMenuController;
    constructor(strings: Strings, fullScreen: FullScreen, private jsxRenderer?: any) {
        super();
        this.strings = strings;
        this.fullScreen = fullScreen;
    }
    onEnter(params: GameMenuHomeParams): void {
        this.params = params;
        this.initView(params);
        this.controller?.toggleContentAreaVisibility(true);
    }
    private initView(params: GameMenuHomeParams): void {
        const strings = this.strings;
        if (params.campaign?.briefing && this.jsxRenderer) {
            const [component] = this.jsxRenderer.render(jsx(HtmlView, { width: '100%', height: '100%',
                component: CampaignObjectives, props: { title: strings.get('GUI:Briefing'), text: params.campaign.briefing() } }));
            this.controller?.setMainComponent(component);
        } else this.controller?.setMainComponent();
        const buttons: SidebarButton[] = [
            ...(params.onSave ? [{ label: strings.get('HD:SaveGame'), onClick: params.onSave }] : []),
            ...(params.onLoad ? [{ label: strings.get('HD:LoadGame'), onClick: params.onLoad }] : []),
            ...(params.campaign ? [
                { label: strings.get('GUI:Save'), onClick: params.campaign.save },
                { label: strings.get('GUI:Load'), onClick: params.campaign.load },
                { label: strings.get('HD:CampaignRestart'), onClick: params.campaign.restart },
            ] : []),
            {
                label: strings.get("GUI:Options"),
                onClick: () => {
                    this.controller?.pushScreen?.(ScreenType.Options);
                },
            },
            ...(!params.campaign ? [{
                label: strings.get("GUI:Fullscreen", getHumanReadableKey(FullScreen.hotKey)),
                tooltip: strings.get("STT:Fullscreen"),
                disabled: !this.fullScreen.isAvailable(),
                onClick: () => this.fullScreen.toggle(),
            }] : []),
            {
                label: strings.get("GUI:AbortMission"),
                onClick: () => {
                    this.controller?.pushScreen?.(ScreenType.QuitConfirm, this.params);
                },
            },
            {
                label: strings.get("GUI:ResumeMission"),
                isBottom: true,
                onClick: params.onCancel,
            },
        ];
        this.controller?.setSidebarButtons(buttons);
        this.controller?.showSidebarButtons();
    }
    async onLeave(): Promise<void> {
        this.controller?.setMainComponent();
        this.controller?.toggleContentAreaVisibility(false);
        this.controller?.hideSidebarButtons();
    }
    async onStack(): Promise<void> {
        this.controller?.hideSidebarButtons();
    }
    onUnstack(): void {
        if (this.params) {
            this.initView(this.params);
        }
    }
}

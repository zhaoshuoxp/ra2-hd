import { Screen } from '../../Controller';
import { MainMenuScreenType } from '../../ScreenType';
import { MainMenuController } from '../MainMenuController';
import { Strings } from '../../../../data/Strings';
import { MusicType } from '../../../../engine/sound/Music';
import { MessageBoxApi } from '../../../component/MessageBoxApi';
import { FullScreen } from '../../../FullScreen';
import { getHumanReadableKey } from '@/gui/screen/options/component/getHumanReadableKey';
import { currentLanguage, preferredLanguage } from '@/gui/Language';
import { activeEdition } from '@/editions/activeEdition';
interface SidebarButton {
    label: string;
    tooltip?: string;
    disabled?: boolean;
    isBottom?: boolean;
    onClick: () => void | Promise<void>;
}
export class HomeScreen implements Screen {
    private strings: Strings;
    private messageBoxApi: MessageBoxApi;
    private appVersion: string;
    private storageEnabled: boolean;
    private quickMatchEnabled: boolean;
    private fullScreen?: FullScreen;
    private controller?: MainMenuController;
    public title: string;
    public musicType: MusicType;
    constructor(strings: Strings, messageBoxApi: MessageBoxApi, appVersion: string, storageEnabled: boolean = false, quickMatchEnabled: boolean = false, fullScreen?: FullScreen,
        private rootController?: any) {
        this.strings = strings;
        this.messageBoxApi = messageBoxApi;
        this.appVersion = appVersion;
        this.storageEnabled = storageEnabled;
        this.quickMatchEnabled = quickMatchEnabled;
        this.fullScreen = fullScreen;
        this.title = this.strings.get("GUI:MainMenu") || "Main Menu";
        this.musicType = MusicType.Intro;
    }
    setController(controller: MainMenuController): void {
        this.controller = controller;
    }
    onEnter(): void {
        const requestedLanguage = preferredLanguage();
        if (requestedLanguage && requestedLanguage !== currentLanguage()) {
            location.reload();
            return;
        }
        console.log('[HomeScreen] Entering home screen');
        const text = (key: string, fallback: string) => this.strings.has(key) ? this.strings.get(key) : fallback;
        const unavailable = text('HD:MenuUnavailable', 'Not available yet');
        const placeholder = (key: string, fallback: string): SidebarButton => ({
            label: text(key, fallback), tooltip: unavailable, disabled: true, onClick: () => {},
        });
        const buttons: SidebarButton[] = [
            placeholder('HD:MenuCampaign', 'Campaign'),
            {
                label: text('HD:MenuSkirmish', 'Skirmish'),
                tooltip: text('HD:MenuSkirmishHint', 'Play against local AI opponents'),
                onClick: () => this.controller?.goToScreen(MainMenuScreenType.Skirmish),
            },
            { label: text('HD:LoadGame', 'Load Game'), onClick: () =>
                this.controller?.pushScreen(MainMenuScreenType.LoadGame) },
            placeholder('HD:MenuLAN', 'LAN'),
            placeholder('HD:MenuMovies', 'Movies'),
            {
                label: text('HD:MenuOptions', 'Options'),
                onClick: () => this.controller?.pushScreen(MainMenuScreenType.Options),
            },
            {
                label: text('HD:MenuEdition', 'Switch Game'),
                onClick: () => { const url = new URL(location.href); url.searchParams.delete('edition'); location.replace(url.href); },
            },
            {
                label: text('HD:MenuExit', 'Exit Game'),
                onClick: () => window.desktopApp?.quit
                    ? window.desktopApp.quit()
                    : this.messageBoxApi.alert(
                        text('HD:MenuBrowserExit', 'To exit this browser preview, close this tab or window.'),
                        text('GUI:OK', 'OK')),
            },
        ];
        if (this.controller) {
            this.controller.setSidebarButtons(buttons);
            this.controller.showSidebarButtons();
            this.controller.toggleMainVideo(true);
            this.controller.showVersion(this.appVersion,
                this.strings.get(activeEdition === 'yr' ? 'HD:EditionYr' : 'HD:EditionRa2'));
        }
    }
    async onLeave(): Promise<void> {
        console.log('[HomeScreen] Leaving home screen');
        if (this.controller) {
            this.controller.hideVersion();
            await this.controller.hideSidebarButtons();
        }
    }
    async onStack(): Promise<void> {
        await this.onLeave();
    }
    onUnstack(): void {
        this.onEnter();
    }
    update(deltaTime: number): void {
    }
    destroy(): void {
    }
    private async toggleFullscreen(): Promise<void> {
        try {
            if (this.fullScreen?.isAvailable()) {
                await this.fullScreen.toggleAsync();
            }
            else if (document.fullscreenElement) {
                await document.exitFullscreen();
            }
            else {
                await document.documentElement.requestFullscreen();
            }
        }
        catch (err) {
            console.error('Error toggling fullscreen:', err);
            await this.messageBoxApi.alert(this.strings.get(document.fullscreenElement
                ? 'HD:FullscreenExitError' : 'HD:FullscreenEnterError'), this.strings.get('GUI:OK') || 'OK');
        }
    }
}

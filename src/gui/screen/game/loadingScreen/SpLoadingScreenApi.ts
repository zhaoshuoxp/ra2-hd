import { jsx } from '@/gui/jsx/jsx';
import { OBS_COUNTRY_ID } from '@/game/gameopts/constants';
import { CompositeDisposable } from '@/util/disposable/CompositeDisposable';
import { PlayerConnectionStatus } from '@/network/gamestate/PlayerConnectionStatus';
import { LoadingScreenWrapper } from './LoadingScreenWrapper';
import { LoadingScreenApi } from './LoadingScreenApi';
import { prepareLoadingUnit } from './prepareLoadingUnit';
interface Player {
    name: string;
    countryId: number;
    colorId: number;
    teamId: number;
}
interface Country {
    name: string;
    side: any;
    uiName: string;
}
interface Rules {
    getMultiplayerColors(): Map<number, any>;
    getMultiplayerCountries(): Country[];
    colors: Map<string, any>;
}
interface Strings {
    get(key: string, ...args: any[]): string;
}
interface UiScene {
    menuViewport: any;
    add(object: any): void;
    remove(object: any): void;
}
interface JsxRenderer {
    render(element: any): any[];
}
interface GameResConfig {
    isCdn(): boolean;
    getCdnBaseUrl(): string;
}
interface ExtendedPlayerInfo {
    name: string;
    status: PlayerConnectionStatus;
    loadPercent: number;
    country: Country;
    color: string;
    team: number;
}
export class SpLoadingScreenApi implements LoadingScreenApi {
    private lastLoadPercent = 0;
    private disposables = new CompositeDisposable();
    private players?: Player[];
    private localPlayerName?: string;
    private mapName?: string;
    private loadingScreen?: any;
    private lastRenderTime?: number;
    private disposed = false;
    private unitArtworkReady = false;
    private onCancel?: () => void;
    private handleLoadInfoUpdate = (loadPercent: number) => {
        if (this.loadingScreen) {
            const now = performance.now();
            if (!this.lastRenderTime || now - this.lastRenderTime > 1000 / 15) {
                this.lastRenderTime = now;
                this.loadingScreen.applyOptions((options: any) => {
                    options.playerInfos = this.createExtendedLoadingInfos(loadPercent);
                });
            }
        }
        else {
            this.createLoadingScreen();
        }
    };
    constructor(private rules: Rules, private strings: Strings, private uiScene: UiScene, private jsxRenderer: JsxRenderer, private gameResConfig: GameResConfig) { }
    setOnCancel(handler: () => void): void { this.onCancel = handler; }
    async start(players: Player[], mapName: string, localPlayerName: string): Promise<void> {
        if (this.disposed) return;
        this.players = players;
        this.localPlayerName = localPlayerName;
        this.mapName = mapName;
        const player = players.find(p => p.name === localPlayerName);
        const country = this.rules.getMultiplayerCountries()[player?.countryId ?? OBS_COUNTRY_ID];
        const preparation = prepareLoadingUnit(country?.name ?? 'Observer');
        this.disposables.add(preparation);
        this.unitArtworkReady = await preparation.ready;
        if (this.disposed) return;
        this.handleLoadInfoUpdate(0);
    }
    onLoadProgress(percent: number): void {
        if (this.disposed) return;
        const roundedPercent = Math.floor(percent);
        if (roundedPercent > this.lastLoadPercent) {
            this.lastLoadPercent = roundedPercent;
            this.handleLoadInfoUpdate(roundedPercent);
        }
    }
    private createExtendedLoadingInfos(loadPercent: number): ExtendedPlayerInfo[] {
        const colors = [...this.rules.getMultiplayerColors().values()];
        const countries = this.rules.getMultiplayerCountries();
        const localPlayer = this.players!.find(player => player.name === this.localPlayerName)!;
        return [
            {
                name: this.localPlayerName!,
                status: PlayerConnectionStatus.Connected,
                loadPercent,
                country: countries[localPlayer.countryId],
                color: localPlayer.countryId === OBS_COUNTRY_ID
                    ? "#fff"
                    : colors[localPlayer.colorId].asHexString(),
                team: localPlayer.teamId,
            },
        ];
    }
    private createLoadingScreen(): void {
        const [uiObject] = this.jsxRenderer.render(jsx(LoadingScreenWrapper, {
            ref: (ref: any) => (this.loadingScreen = ref),
            strings: this.strings,
            rules: this.rules,
            viewport: this.uiScene.menuViewport,
            playerName: this.localPlayerName,
            mapName: this.mapName!,
            playerInfos: this.createExtendedLoadingInfos(0),
            gameResConfig: this.gameResConfig,
            unitArtworkReady: this.unitArtworkReady,
        }));
        this.uiScene.add(uiObject);
        this.disposables.add(uiObject, () => this.uiScene.remove(uiObject));
        if (this.onCancel) {
            const keydown = (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                    event.preventDefault(); event.stopPropagation(); this.onCancel?.();
                }
            };
            document.addEventListener('keydown', keydown, true);
            this.disposables.add(() => document.removeEventListener('keydown', keydown, true));
        }
    }
    dispose(): void {
        this.disposed = true;
        this.disposables.dispose();
    }
    updateViewport(): void {
        this.loadingScreen?.updateViewport(this.uiScene.menuViewport);
    }
}

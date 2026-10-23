import { CompositeDisposable } from '../util/disposable/CompositeDisposable';
import { setupFullScreenChangeListener } from '../util/fullScreen';
import { EventDispatcher } from '../util/event';
export interface HotKey {
    altKey: boolean;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    keyCode: number;
}
export class FullScreen {
    public static readonly hotKey: HotKey = {
        altKey: true,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        keyCode: "F".charCodeAt(0),
    };
    private desktopFullScreen = false;
    private readonly document: Document;
    private readonly disposables: CompositeDisposable;
    private readonly _onChange: EventDispatcher<FullScreen, boolean>;
    public get onChange() {
        return this._onChange.asEvent();
    }
    constructor(document: Document) {
        this.document = document;
        this.disposables = new CompositeDisposable();
        this._onChange = new EventDispatcher<FullScreen, boolean>();
    }
    public static isFullScreenHotKey(event: KeyboardEvent): boolean {
        return (event.keyCode === this.hotKey.keyCode &&
            event.altKey === this.hotKey.altKey &&
            event.shiftKey === this.hotKey.shiftKey &&
            event.ctrlKey === this.hotKey.ctrlKey &&
            event.metaKey === this.hotKey.metaKey);
    }
    public init(): void {
        const desktop = (window as any).desktopDisplay;
        if (desktop) {
            const refresh = () => desktop.get().then((state: any) => {
                if (this.desktopFullScreen !== state.fullscreen) {
                    this.desktopFullScreen = state.fullscreen;
                    this.handleFullScreenChange(state.fullscreen);
                }
            }).catch(console.error);
            refresh();
            window.addEventListener('resize', refresh);
            this.disposables.add(() => window.removeEventListener('resize', refresh));
        }
        const keyDownHandler = (event: KeyboardEvent) => {
            if (FullScreen.isFullScreenHotKey(event)) {
                event.preventDefault();
                event.stopPropagation();
                this.toggle();
            }
        };
        this.document.addEventListener("keydown", keyDownHandler);
        this.disposables.add(() => this.document.removeEventListener("keydown", keyDownHandler));
        const cleanup = setupFullScreenChangeListener(this.document, this.handleFullScreenChange);
        if (cleanup) {
            this.disposables.add(cleanup);
        }
    }
    private handleFullScreenChange = (isFullScreen: boolean): void => {
        this._onChange.dispatch(this, isFullScreen);
    };
    public toggle(): void {
        this.toggleAsync().catch((error) => console.error(error));
    }
    public isFullScreen(): boolean {
        return this.desktopFullScreen || !!this.document.fullscreenElement;
    }
    public isAvailable(): boolean {
        return !!((window as any).desktopDisplay || this.document.fullscreenEnabled ||
            (this.document as any).webkitFullscreenEnabled);
    }
    public async toggleAsync(): Promise<void> {
        const desktop = (window as any).desktopDisplay;
        if (desktop) {
            const state = await desktop.get();
            const choice = state.fullscreen ? state.choices.find((c: any) => c.id === '1920x1080')
                ?? state.choices.find((c: any) => c.id !== 'fullscreen') : { id: 'fullscreen' };
            if (choice) await desktop.set(choice.id);
            return;
        }
        if (this.document.fullscreenElement) {
            try {
                screen?.orientation?.unlock?.();
            }
            catch (_error) {
            }
            await this.document.exitFullscreen();
        }
        else {
            await this.document.documentElement.requestFullscreen();
            try {
                await (screen?.orientation as any)?.lock?.("landscape");
            }
            catch (error) {
                console.warn("Orientation lock failed", error);
            }
        }
    }
    public dispose(): void {
        this.disposables.dispose();
    }
}

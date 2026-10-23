import { preferredLanguage, interfaceLanguages, type InterfaceLanguage } from './gui/Language';
import { loadEditionTranslations, validateTranslationSource, type EditionTranslations } from './gui/EditionTranslations';
import { activeEdition } from './editions/activeEdition';
import { presentationLayout } from './gui/Presentation';
import { BoxedVar } from './util/BoxedVar';
import { EventDispatcher } from './util/event';
import { Routing } from './util/Routing';
import { Config } from './Config';
import { IniFile } from './data/IniFile';
import { IniSection } from './data/IniSection';
import SplashScreenComponent from './gui/component/SplashScreen';
import type { ComponentProps } from 'react';
import { Strings } from './data/Strings';
import { version as appVersion, releaseVersion } from './version';
import { MixFile } from './data/MixFile';
import { loadRetail } from './offline/loadRetail';
import { GameResConfig } from './engine/gameRes/GameResConfig';
import { GameResSource } from './engine/gameRes/GameResSource';
import { LocalPrefs, StorageKey } from './LocalPrefs';
import type { Viewport, ViewportRect } from './gui/Viewport';
import { Gui } from './Gui';
import { BasicErrorBoxApi } from './gui/component/BasicErrorBoxApi';
import { Engine } from './engine/Engine';
import { ResourceLoader } from './engine/ResourceLoader';
import { ImageContext } from './gui/component/ImageContext';
import { ConsoleVars } from './ConsoleVars';
import { GeneralOptions } from './gui/screen/options/GeneralOptions';
import { FullScreen } from './gui/FullScreen';
import { browserFileSystemAccess } from './engine/gameRes/browserFileSystemAccess';
import { attachPerformanceOptions, installPerformanceDebugApi } from './performance/PerformanceRuntime';

export type SplashScreenUpdateCallback = (props: ComponentProps<typeof SplashScreenComponent> | null) => void;
class MockLocalPrefs extends LocalPrefs {
    constructor(storage: Storage) {
        super(storage);
        console.log('MockLocalPrefs initialized');
    }
}
class MockConsoleVars extends ConsoleVars {
    constructor() {
        super();
        console.log('MockConsoleVars initialized');
    }
}
class MockDevToolsApi {
    static registerCommand(name: string, cmd: Function) { console.log(`MockDevToolsApi: registerCommand ${name}`); }
    static registerVar(name: string, bv: BoxedVar<any>) { console.log(`MockDevToolsApi: registerVar ${name}`); }
    static listCommands(): string[] { return []; }
    static listVars(): string[] { return []; }
}
const mockSentry = {
    captureException: (e: any) => console.error("Sentry Mock: captureException", e),
    configureScope: (cb: Function) => cb({ setTag: () => { }, setExtra: () => { } }),
};
class ViewportAdapter implements Viewport {
    constructor(private boxedVar: BoxedVar<ViewportRect>) { }
    get value(): ViewportRect {
        return this.boxedVar.value;
    }
    getValue(): ViewportRect {
        return this.boxedVar.value;
    }
    rootElement?: HTMLElement;
}
export class Application {
    private static readonly MOBILE_BASE_VIEWPORT = { width: 800, height: 600 };
    private static readonly MIN_DESKTOP_VIEWPORT = { width: 800, height: 600 };
    private formatString(template: string, ...args: any[]): string {
        if (!args || args.length === 0)
            return template;
        let result = template;
        for (let i = 0; i < args.length; i++) {
            const placeholder = new RegExp(`%s|%d`, 'i');
            result = result.replace(placeholder, String(args[i]));
        }
        return result;
    }
    public viewport: BoxedVar<ViewportRect>;
    private viewportAdapter: ViewportAdapter;
    public config!: Config;
    private strings!: Strings;
    private localPrefs: LocalPrefs;
    private rootEl: HTMLElement | null = null;
    private runtimeVars: MockConsoleVars;
    private fullScreen: FullScreen;
    private generalOptions: GeneralOptions;
    public routing: Routing;
    private sentry: typeof mockSentry | undefined = mockSentry;
    private currentLocale: string = 'en-US';
    private editionTranslations?: EditionTranslations;
    private fsAccessLib: any;
    private gameResConfig: GameResConfig | undefined;
    private cdnResourceLoader: any;
    private gpuTier: any;
    private splashScreenUpdateCallback?: SplashScreenUpdateCallback;
    private gui?: Gui;
    private preferredViewportSize?: {
        width: number;
        height: number;
    } | null;
    private hasLoadedGeneralOptionsFromStorage: boolean = false;
    private readonly handleViewportEnvironmentChange = () => this.updateViewportSize();
    private readonly handlePreferredResolutionChange = (resolution?: {
        width: number;
        height: number;
    }) => this.setPreferredViewportSize(resolution);
    private readonly handleForceResolutionChange = (value?: string) => {
        if (!value?.match(/^\d+x\d+$/)) {
            return;
        }
        const [width, height] = value.split('x').map(Number);
        this.setPreferredViewportSize({ width, height });
    };
    constructor(splashScreenUpdateCallback?: SplashScreenUpdateCallback) {
        this.viewport = new BoxedVar({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
        this.viewportAdapter = new ViewportAdapter(this.viewport);
        this.routing = new Routing();
        this.splashScreenUpdateCallback = splashScreenUpdateCallback;
        this.localPrefs = new MockLocalPrefs(localStorage);
        this.runtimeVars = new MockConsoleVars();
        this.generalOptions = new GeneralOptions();
        this.loadGeneralOptions();
        this.bindPerformanceRuntimeVars();
        this.fullScreen = new FullScreen(document);
        this.updateViewportSize();
        console.log('Application constructor finished.');
    }
    public getVersion(): string {
        return appVersion;
    }
    private async loadConfig(): Promise<void> {
        console.log('[Application] Attempting to load config.ini...');
        try {
            const response = await fetch('/config.ini');
            if (!response.ok) {
                throw new Error(`Failed to fetch config.ini: ${response.status} ${response.statusText}`);
            }
            const iniString = await response.text();
            const iniFileInstance = new IniFile(iniString);
            this.config = new Config();
            this.config.load(iniFileInstance);
            console.log('[Application] config.ini loaded and parsed successfully.');
            console.log('[Application] Config object dump:', this.config);
            console.log('[Application] Verification: Default Locale from config:', this.config.defaultLocale);
            console.log('[Application] Verification: Viewport Width from config:', this.config.viewport.width);
            console.log('[Application] Verification: Dev Mode from config:', this.config.devMode);
            console.log('[Application] Verification: Servers URL from config:', this.config.serversUrl);
        }
        catch (error) {
            console.error('[Application] Failed to parse config:', error);
            console.error('[Application] Config parsing failed. Using minimal defaults.');
            this.config = new Config();
            console.error("Failed to load application configuration (config.ini). Using minimal defaults. Some features may not work.");
        }
    }
    private async loadTranslations(): Promise<void> {
        const configured = this.config?.defaultLocale as InterfaceLanguage;
        const language = preferredLanguage() ?? (interfaceLanguages.includes(configured) ? configured : 'zh-CN');
        this.currentLocale = language;
        document.documentElement.lang = language;
        const [retail, response] = await Promise.all([
            loadEditionTranslations(activeEdition, language, this.getVersion()),
            fetch(`/res/locale/${language}.json?v=${this.getVersion()}`),
        ]);
        if (!response.ok) throw Error(`Interface translation missing: ${language}`);
        this.editionTranslations = retail;
        this.strings = new Strings(retail.labels);
        this.strings.fromJson(await response.json());
    }
    private checkGlobalLibs(): void {
        console.log('[MVP] Skipping Application.checkGlobalLibs().');
    }
    private async initLogging(): Promise<void> {
        console.log('[MVP] Skipping Application.initLogging().');
    }
    private loadGeneralOptions(): void {
        const optionsData = this.localPrefs.getItem(StorageKey.Options);
        if (optionsData) {
            try {
                this.generalOptions.unserialize(optionsData);
                this.hasLoadedGeneralOptionsFromStorage = true;
                console.log('[Application] Loaded general options from local storage');
            }
            catch (error) {
                console.warn('[Application] Failed to read general options from local storage', error);
            }
        }
    }
    private initializePreferredViewportSize(): void {
        // Desktop output always follows the actual window or full-screen pixel size.
        if ((window as any).desktopDisplay) this.generalOptions.graphics.renderResolution.value = "native";
        if (!this.hasLoadedGeneralOptionsFromStorage && this.generalOptions.graphics.resolution.value === undefined) {
            const defaultViewportSize = {
                width: this.config?.viewport?.width ?? 1024,
                height: this.config?.viewport?.height ?? 768,
            };
            this.generalOptions.graphics.resolution.value = defaultViewportSize;
            this.preferredViewportSize = defaultViewportSize;
            console.log('[Application] Initialized preferred viewport size from config defaults', defaultViewportSize);
            return;
        }
        this.preferredViewportSize = this.generalOptions.graphics.resolution.value
            ? { ...this.generalOptions.graphics.resolution.value }
            : null;
        console.log('[Application] Initialized preferred viewport size from options', this.preferredViewportSize);
    }
    private bindPerformanceRuntimeVars(): void {
        const performanceOptions = this.generalOptions.performance;
        this.runtimeVars.perfRaycastHelperReuse = performanceOptions.raycastHelperReuse;
        this.runtimeVars.perfEntityIntersectTraversal = performanceOptions.entityIntersectTraversal;
        this.runtimeVars.perfMapTileHitTest = performanceOptions.mapTileHitTest;
        this.runtimeVars.perfWorldViewportCache = performanceOptions.worldViewportCache;
        this.runtimeVars.perfWorldSoundLoopCache = performanceOptions.worldSoundLoopCache;
        this.runtimeVars.perfTelemetry = performanceOptions.telemetry;
        attachPerformanceOptions(performanceOptions);
        const debugRoot = ((window as any).__ra2debug ??= {});
        debugRoot.generalOptions = this.generalOptions;
        debugRoot.runtimeVars = this.runtimeVars;
        installPerformanceDebugApi(debugRoot);
    }
    private setPreferredViewportSize(resolution?: {
        width: number;
        height: number;
    }): void {
        this.preferredViewportSize = resolution ? { ...resolution } : null;
        console.log('[Application] setPreferredViewportSize', this.preferredViewportSize ?? 'fit-window');
        this.updateViewportSize(this.fullScreen.isFullScreen());
    }
    private getRequestedResolution(): { width: number; height: number; } | undefined {
        if (this.preferredViewportSize === undefined) {
            return this.generalOptions.graphics.resolution.value;
        }
        return this.preferredViewportSize ?? undefined;
    }
    private isMobileLayout(): boolean {
        return !!window.matchMedia?.('(pointer: coarse)')?.matches;
    }
    private getAvailableDisplaySize(): { width: number; height: number; } {
        const viewport = window.visualViewport;
        const width = Math.floor(viewport?.width ?? window.innerWidth ?? document.documentElement.clientWidth ?? Application.MOBILE_BASE_VIEWPORT.width);
        const height = Math.floor(viewport?.height ?? window.innerHeight ?? document.documentElement.clientHeight ?? Application.MOBILE_BASE_VIEWPORT.height);
        const style = getComputedStyle(document.body);
        const inset = (key: string) => parseFloat(style.getPropertyValue(key)) || 0;
        return {
            width: Math.max(1, width - inset('padding-left') - inset('padding-right')),
            height: Math.max(1, height - inset('padding-top') - inset('padding-bottom')),
        };
    }
    private computeViewportLayout(_isFullScreen: boolean): ViewportRect {
        const available = this.getAvailableDisplaySize();
        return { ...presentationLayout(available.width, available.height),
            isMobileLayout: this.isMobileLayout(), isPortrait: available.height > available.width };
    }
    private applyRootLayout(viewport: ViewportRect): void {
        if (!this.rootEl) {
            return;
        }
        this.rootEl.style.width = `${viewport.width}px`;
        this.rootEl.style.height = `${viewport.height}px`;
        this.rootEl.style.transform = `scale(${viewport.scale ?? 1})`;
        this.rootEl.style.flexShrink = '0';
        this.rootEl.style.transformOrigin = 'center center';
        this.rootEl.style.willChange = 'transform';
        this.rootEl.dataset.mobileLayout = String(Boolean(viewport.isMobileLayout));
        this.rootEl.dataset.orientation = viewport.isPortrait ? 'portrait' : 'landscape';
        this.rootEl.dataset.compactLayout = String(viewport.height <= 640 || viewport.width <= 800);
    }
    private isNativeFullScreen(): boolean {
        const width = window.innerWidth ?? 0;
        const height = window.innerHeight ?? 0;
        return width >= screen.width && height >= screen.height;
    }
    private updateViewportSize(isFullScreen: boolean = this.fullScreen.isFullScreen() || this.isNativeFullScreen()): void {
        const nextViewport = this.computeViewportLayout(isFullScreen);
        const current = this.viewport.value;
        if (Object.keys(nextViewport).every(key => current?.[key] === nextViewport[key])) return;
        this.applyRootLayout(nextViewport);
        this.viewport.value = nextViewport;
        console.log('[Application] updateViewportSize', {
            viewport: `${nextViewport.width}x${nextViewport.height}`,
            display: `${nextViewport.displayWidth}x${nextViewport.displayHeight}`,
            scale: nextViewport.scale,
            fullScreen: isFullScreen,
            mobileLayout: nextViewport.isMobileLayout,
            portrait: nextViewport.isPortrait,
        });
    }
    private onFullScreenChange(isFullScreen: boolean): void {
        console.log(`[Application] onFullScreenChange: ${isFullScreen}`);
        this.updateViewportSize(isFullScreen);
    }
    private async loadGpuBenchmarkData(): Promise<any> {
        console.log('[MVP] Skipping Application.loadGpuBenchmarkData()');
        return { tier: 1, type: 'MOCK_GPU' };
    }
    public async main(): Promise<void> {
        console.log('Application.main() called');
        this.rootEl = document.getElementById("ra2web-root");
        if (!this.rootEl) {
            console.error("CRITICAL: Missing root element #ra2web-root in HTML.");
            const errorMsg = "CRITICAL: Missing root element #ra2web-root for the application.";
            if (document.body) {
                document.body.innerHTML = `<h1>Error</h1><p>${errorMsg}</p>`;
            }
            else {
                alert(errorMsg);
            }
            return;
        }
        this.viewportAdapter.rootElement = this.rootEl;
        this.applyRootLayout(this.viewport.value);
        if (this.splashScreenUpdateCallback) {
            this.splashScreenUpdateCallback({
                width: this.viewport.value.width,
                height: this.viewport.value.height,
                parentElement: this.rootEl,
                loadingText: 'Initializing...'
            });
        }
        try {
            await this.loadConfig();
            this.initializePreferredViewportSize();
            this.updateViewportSize();
        }
        catch (e) {
            console.error("CRITICAL: Application.loadConfig() failed. See previous errors.", e);
            if (this.rootEl)
                this.rootEl.innerHTML = "<h1>Error</h1><p>Failed to load critical application configuration. Please check console.</p>";
            return;
        }
        const locale = this.config.defaultLocale;
        if (this.splashScreenUpdateCallback) {
            this.splashScreenUpdateCallback({
                width: this.viewport.value.width,
                height: this.viewport.value.height,
                parentElement: this.rootEl,
                loadingText: 'Loading translations...'
            });
        }
        try {
            await this.loadTranslations();
        }
        catch (e) {
            console.error(`Missing translation ${locale}.`, e);
            return;
        }
        if (this.splashScreenUpdateCallback) {
            this.splashScreenUpdateCallback({
                width: this.viewport.value.width,
                height: this.viewport.value.height,
                parentElement: this.rootEl,
                loadingText: this.strings.get("gui:loadingex"),
                copyrightText: this.strings.get('HD:StartupCopyright', `v${releaseVersion}`),
                disclaimerText: this.strings.get("ts:disclaimer")
            });
        }
        try {
            this.checkGlobalLibs();
        }
        catch (e: any) {
            console.error("Global library check failed:", e);
            const errorMsg = this.strings.get("TS:DownloadFailed");
            const errorBox = new BasicErrorBoxApi(this.viewport, this.strings, this.rootEl!);
            await errorBox.show(errorMsg, true);
            return;
        }
        this.runtimeVars = new MockConsoleVars();
        this.bindPerformanceRuntimeVars();
        MockDevToolsApi.registerVar("freecamera", this.runtimeVars.freeCamera);
        await this.initLogging();
        this.fullScreen.init();
        this.fullScreen.onChange.subscribe((isFS: boolean) => {
            this.onFullScreenChange(isFS);
        });
        this.runtimeVars.forceResolution.onChange.subscribe(this.handleForceResolutionChange);
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', this.handleViewportEnvironmentChange);
            window.addEventListener('orientationchange', this.handleViewportEnvironmentChange);
            window.visualViewport?.addEventListener('resize', this.handleViewportEnvironmentChange);
            this.generalOptions.graphics.resolution.onChange.subscribe(this.handlePreferredResolutionChange);
            this.updateViewportSize();
        }
        this.loadGpuBenchmarkData()
            .then(gpuData => this.gpuTier = gpuData)
            .catch(e => this.sentry?.captureException(e));
        this.fsAccessLib = browserFileSystemAccess;
        const urlParams = new URLSearchParams(window.location.search);
        const modName: string | null = null;
        let gameResConfig = this.loadGameResConfig(this.localPrefs);
        try {
            const { configToPersist, cdnResLoader } = await loadRetail();
            if (!this.editionTranslations) throw Error('Game translations were not loaded');
            await validateTranslationSource(this.editionTranslations,
                Engine.vfs!.openFile(Engine.getFileNameVariant('ra2.csf')).getBytes());
            try {
                const vfsAny: any = (Engine as any).vfs;
                if (vfsAny?.debugListFileOwners) {
                    vfsAny.debugListFileOwners('rules.ini');
                    vfsAny.debugListFileOwners('art.ini');
                    vfsAny.debugListFileOwners('rulescd.ini');
                    vfsAny.debugListFileOwners('artcd.ini');
                }
                try {
                    const rulesFile = (Engine as any).vfs.openFile('rules.ini');
                    const rulesHead = rulesFile.readAsString().split(/\r?\n/).slice(0, 40);
                    console.log('[Diag] rules.ini head (first 40 lines):', rulesHead);
                }
                catch (e) {
                    console.warn('[Diag] Failed to read rules.ini head:', e);
                }
                try {
                    const rulesCdFile = (Engine as any).vfs.openFile('rulescd.ini');
                    const rulesCdHead = rulesCdFile.readAsString().split(/\r?\n/).slice(0, 40);
                    console.log('[Diag] rulescd.ini head (first 40 lines):', rulesCdHead);
                }
                catch (e) {
                    console.warn('[Diag] Failed to read rulescd.ini head:', e);
                }
            }
            catch (e) {
                console.warn('[Diag] VFS ownership diagnostics failed:', e);
            }
            if (configToPersist) {
                if (configToPersist.isCdn()) {
                    this.localPrefs.removeItem(StorageKey.GameRes);
                }
                else {
                    this.localPrefs.setItem(StorageKey.GameRes, configToPersist.serialize());
                }
                gameResConfig = configToPersist;
            }
            this.gameResConfig = gameResConfig;
            this.cdnResourceLoader = cdnResLoader;
            ImageContext.cdnBaseUrl = this.gameResConfig?.isCdn()
                ? this.gameResConfig.getCdnBaseUrl()
                : undefined;
            ImageContext.vfs = Engine.vfs;
            try {
                console.log("Engine.iniFiles.has('rules.ini'):", Engine.iniFiles.has("rules.ini"));
                console.log("Engine.iniFiles.has('art.ini'):", Engine.iniFiles.has("art.ini"));
                console.log("[Diag] Engine.iniFiles.has('rulescd.ini'):", Engine.iniFiles.has("rulescd.ini"));
                console.log("[Diag] Engine.iniFiles.has('artcd.ini'):", Engine.iniFiles.has("artcd.ini"));
                Engine.loadRules();
                try {
                    const rulesIniUsed = Engine.getFileNameVariant('rules.ini');
                    const artIniUsed = Engine.getFileNameVariant('art.ini');
                    console.log('[Diag] Using base INIs:', { rulesIniUsed, artIniUsed });
                    const hasAPSplashSection = !!Engine.getIni(artIniUsed).getSection('APSplash') || !!Engine.getIni(rulesIniUsed).getSection('APSplash');
                    console.log('[Diag] APSplash section present in INIs:', hasAPSplashSection);
                    try {
                        const orderedSections: any[] = (Engine.getRules() as any).getOrderedSections?.() ?? [];
                        console.log('[Diag] Merged rules - first sections:', orderedSections.slice(0, 120).map(s => s.name));
                    }
                    catch (e) {
                        console.warn('[Diag] Failed to dump ordered sections from merged rules:', e);
                    }
                    try {
                        const mergedRules: any = Engine.getRules();
                        const warheads = mergedRules?.getSection?.('Warheads');
                        const listed: string[] = [];
                        if (warheads?.entries) {
                            warheads.entries.forEach((v: any) => {
                                if (typeof v === 'string')
                                    listed.push(v);
                                else if (Array.isArray(v))
                                    listed.push(...v);
                            });
                        }
                        console.log('[Diag] Warheads listed (sample):', listed.slice(0, 40), 'total=', listed.length);
                    }
                    catch (e) {
                        console.warn('[Diag] Failed to dump Warheads list from merged rules:', e);
                    }
                    try {
                        const mergedRules: any = Engine.getRules();
                        const ObjectType: any = (Engine as any).ObjectType || (window as any).ra2web?.engine?.type?.ObjectType;
                        const hasCdestSection = !!mergedRules.getSection?.('CDEST');
                        console.log('[Diag] CDEST section exists in merged rules:', hasCdestSection);
                        try {
                            const s = mergedRules.getSection?.('CDEST');
                            if (s?.entries) {
                                const keys: string[] = [];
                                s.entries.forEach((_v: any, k: string) => keys.push(k));
                                console.log('[Diag] CDEST merged keys (sample):', keys.slice(0, 30));
                                console.log('[Diag] CDEST Primary/Secondary/ElitePrimary/EliteSecondary:', s.get?.('Primary'), s.get?.('Secondary'), s.get?.('ElitePrimary'), s.get?.('EliteSecondary'));
                            }
                        }
                        catch (e) {
                            console.warn('[Diag] CDEST merged entries dump failed:', e);
                        }
                        const cdest = mergedRules.getObject?.('CDEST', ObjectType?.Vehicle ?? 2);
                        let weaponName: string | undefined = cdest?.primary || cdest?.elitePrimary || cdest?.secondary || cdest?.eliteSecondary;
                        if (weaponName) {
                            const wpn = mergedRules.getWeapon(weaponName);
                            console.log('[Diag] CDEST weapon mapping:', { weapon: wpn.name, warhead: wpn.warhead });
                            const hasWh = !!mergedRules.getSection?.(wpn.warhead);
                            console.log('[Diag] CDEST warhead section exists in merged rules:', hasWh);
                        }
                        else {
                            console.log('[Diag] CDEST weapon mapping: no primary/secondary found');
                        }
                        try {
                            const cdestSection = mergedRules.getSection?.('CDEST');
                            const spawnsName = cdestSection?.get?.('Spawns');
                            console.log('[Diag] CDEST Spawns:', spawnsName);
                            if (spawnsName) {
                                try {
                                    const spawnedRules = mergedRules.getObject?.(spawnsName, ObjectType?.Aircraft ?? 1);
                                    const spawnedPrimary = spawnedRules?.primary || spawnedRules?.elitePrimary || spawnedRules?.secondary || spawnedRules?.eliteSecondary;
                                    if (spawnedPrimary) {
                                        const spawnedWpn = mergedRules.getWeapon(spawnedPrimary);
                                        console.log('[Diag] Spawned unit primary:', { weapon: spawnedWpn.name, warhead: spawnedWpn.warhead });
                                    }
                                    else {
                                        console.log('[Diag] Spawned unit has no primary/secondary');
                                    }
                                }
                                catch (e) {
                                    console.warn('[Diag] Spawned unit probe failed:', e);
                                }
                            }
                        }
                        catch (e) {
                            console.warn('[Diag] CDEST Spawns probe failed:', e);
                        }
                        try {
                            const aswMerged = mergedRules.getSection?.('ASWLauncher');
                            const aswMergedWh = aswMerged?.get?.('Warhead');
                            console.log('[Diag] ASWLauncher in merged rules: warhead=', aswMergedWh);
                        }
                        catch (e) {
                            console.warn('[Diag] ASWLauncher merged probe failed:', e);
                        }
                        try {
                            const baseAsw = Engine.getIni('rules.ini').getSection('ASWLauncher');
                            const baseAswWh = baseAsw?.get?.('Warhead');
                            console.log('[Diag] ASWLauncher in base rules.ini: warhead=', baseAswWh);
                        }
                        catch (e) {
                            console.warn('[Diag] ASWLauncher base probe failed:', e);
                        }
                        try {
                            const apsInRulesCd = !!Engine.getIni('rulescd.ini').getSection('APSplash');
                            const apsInArtCd = !!Engine.getIni('artcd.ini').getSection('APSplash');
                            console.log('[Diag] APSplash in rulescd.ini:', apsInRulesCd, 'APSplash in artcd.ini:', apsInArtCd);
                        }
                        catch (e) {
                            console.warn('[Diag] APSplash custom INI presence probe failed:', e);
                        }
                        try {
                            const mergedHasAPSplash = !!mergedRules.getSection?.('APSplash');
                            console.log('[Diag] APSplash section exists in merged rules:', mergedHasAPSplash);
                        }
                        catch (e) {
                            console.warn('[Diag] APSplash merged presence check failed:', e);
                        }
                        try {
                            const baseCdest = Engine.getIni('rules.ini').getSection('CDEST');
                            const customCdest = Engine.getIni('rulescd.ini').getSection('CDEST');
                            console.log('[Diag] Base CDEST present:', !!baseCdest, 'Custom CDEST present:', !!customCdest);
                            if (baseCdest) {
                                console.log('[Diag] Base CDEST Primary/Secondary:', baseCdest.get?.('Primary'), baseCdest.get?.('Secondary'));
                            }
                            if (customCdest) {
                                console.log('[Diag] Custom CDEST Primary/Secondary:', customCdest.get?.('Primary'), customCdest.get?.('Secondary'));
                            }
                        }
                        catch (e) {
                            console.warn('[Diag] Base/Custom CDEST probe failed:', e);
                        }
                    }
                    catch (e) {
                        console.warn('[Diag] CDEST mapping diagnostics failed:', e);
                    }
                }
                catch (e) {
                    console.warn('[Diag] INI presence diagnostics failed:', e);
                }
                try {
                    const baseArt = Engine.getIni('art.ini');
                    const customArt = Engine.getIni('artcd.ini');
                    const mergedArt = Engine.getArt();
                    const probe = (name: string) => ({
                        name,
                        base: !!baseArt?.getSection(name),
                        custom: !!customArt?.getSection(name),
                        merged: !!mergedArt?.getSection(name),
                    });
                    console.log('[Diag] Art sections presence:', probe('GI'), probe('CONS'), probe('SEAL'), probe('ENGINEER'), probe('ROCK'));
                }
                catch (e) {
                    console.warn('[Diag] Art presence diagnostics failed:', e);
                }
            }
            catch (err) {
                console.error('[Application] Engine.loadRules() failed:', err);
            }
            this.sentry?.configureScope((scope: any) => {
                scope.setTag('mod', modName || '<none>');
                scope.setExtra('mod', modName || '<none>');
                let modHash: string | number = 'unknown';
                try {
                    modHash = Engine.getModHash();
                }
                catch { }
                scope.setExtra('modHash', modHash);
            });
        }
        catch (e) {
            console.error("Failed to initialize GameRes:", e);
            await this.handleGameResLoadError(e as Error, this.strings, true);
            return;
        }
        this.initRouting();
        if (this.splashScreenUpdateCallback) {
            this.splashScreenUpdateCallback(null);
        }
    }
    private loadGameResConfig(prefs: LocalPrefs): GameResConfig | undefined {
        const serializedConfig = prefs.getItem(StorageKey.GameRes);
        if (serializedConfig) {
            try {
                const config = new GameResConfig(this.config.gameresBaseUrl || "");
                config.unserialize(serializedConfig);
                if (config.isCdn() && !config.getCdnBaseUrl()) {
                    return undefined;
                }
                return config;
            }
            catch (e) {
                console.error("Failed to load GameResConfig from preferences:", e);
            }
        }
        return undefined;
    }
    private initRouting(): void {
        let currentHandler: any = null;
        this.routing.addRoute("*", async () => {
            if (currentHandler && currentHandler.destroy) {
                console.log('[Application] Destroying current handler');
                await currentHandler.destroy();
                currentHandler = null;
            }
        });
        this.routing.addRoute("/", async () => {
            console.log('[Application] Initializing main page');
            this.applyRootLayout(this.viewport.value);
            this.gui = new Gui(this.getVersion(), this.strings, this.config, this.viewport, this.rootEl!, this.cdnResourceLoader, this.gameResConfig, this.runtimeVars, this.generalOptions, this.fullScreen);
            await this.gui.init();
            currentHandler = this;
        });
        this.routing.init();
    }
    async destroy(): Promise<void> {
        console.log('[Application] Destroying Application');
        if (typeof window !== 'undefined') {
            window.removeEventListener('resize', this.handleViewportEnvironmentChange);
            window.removeEventListener('orientationchange', this.handleViewportEnvironmentChange);
            window.visualViewport?.removeEventListener('resize', this.handleViewportEnvironmentChange);
        }
        this.generalOptions.graphics.resolution.onChange.unsubscribe(this.handlePreferredResolutionChange);
        this.runtimeVars.forceResolution.onChange.unsubscribe(this.handleForceResolutionChange);
        this.fullScreen.dispose();
        if (this.gui) {
            if (this.gui.destroy) {
                await this.gui.destroy();
            }
            this.gui = undefined;
        }
    }
    private createSplashScreenInterface() {
        return {
            setLoadingText: (text: string) => {
                console.log(`[Application] Splash Loading: "${text}"`);
                if (this.splashScreenUpdateCallback) {
                    this.splashScreenUpdateCallback({
                        width: this.viewport.value.width,
                        height: this.viewport.value.height,
                        parentElement: this.rootEl,
                        loadingText: text
                    });
                }
            },
            setBackgroundImage: (url: string) => {
                console.log(`[Application] Splash Background: ${url}`);
                if (this.splashScreenUpdateCallback) {
                    this.splashScreenUpdateCallback({
                        width: this.viewport.value.width,
                        height: this.viewport.value.height,
                        parentElement: this.rootEl,
                        backgroundImage: url
                    });
                }
            },
            setCopyrightText: (text: string) => {
                console.log(`[Application] Splash Copyright: ${text}`);
                if (this.splashScreenUpdateCallback) {
                    this.splashScreenUpdateCallback({
                        width: this.viewport.value.width,
                        height: this.viewport.value.height,
                        parentElement: this.rootEl,
                        copyrightText: text
                    });
                }
            },
            setDisclaimerText: (text: string) => {
                console.log(`[Application] Splash Disclaimer: ${text}`);
                if (this.splashScreenUpdateCallback) {
                    this.splashScreenUpdateCallback({
                        width: this.viewport.value.width,
                        height: this.viewport.value.height,
                        parentElement: this.rootEl,
                        disclaimerText: text
                    });
                }
            },
            destroy: () => {
                console.log('[Application] Splash screen destroyed');
                if (this.splashScreenUpdateCallback) {
                    this.splashScreenUpdateCallback(null);
                }
            },
            element: { style: { display: 'none' } }
        };
    }
    private async handleGameResLoadError(error: Error, strings: Strings, fatal: boolean = false): Promise<void> {
        let errorMessage = strings.get("ts:import_load_files_failed");
        if (error.name === "ChecksumError") {
            const fileField = (error as any).file || '';
            const template = strings.get("ts:import_checksum_mismatch");
            const replaced = template.indexOf("%s") >= 0 ?
                template.replace(/%s/g, fileField) :
                template + " " + fileField;
            errorMessage += "\n\n" + replaced;
        }
        else if (error.name === "FileNotFoundError") {
            const fileField = (error as any).file || '';
            const template = strings.get("ts:import_file_not_found");
            const replaced = template.indexOf("%s") >= 0 ?
                template.replace(/%s/g, fileField) :
                template + " " + fileField;
            errorMessage += "\n\n" + replaced;
        }
        else if (error.name === "DownloadError" || error.message?.match(/XHR error|Failed to fetch/i)) {
            errorMessage += "\n\n" + strings.get("ts:downloadfailed");
        }
        else if (error.name === "NoStorageError") {
            errorMessage += "\n\n" + strings.get("ts:import_no_storage");
        }
        else if (error.message?.match(/out of memory|allocation/i)) {
            errorMessage += "\n\n" + strings.get("ts:gameinitoom");
        }
        else if (error.name === "QuotaExceededError" || error.name === "StorageQuotaError") {
            errorMessage += "\n\n" + strings.get("ts:storage_quota_exceeded");
        }
        else if (error.name === "IOError") {
            errorMessage += "\n\n" + strings.get("ts:storage_io_error");
            fatal = true;
        }
        else {
            console.error("Unrecognized GameRes error:", error);
            const wrappedError = new Error(`Game res load failed (${error.message ?? error.name})`);
            (wrappedError as any).cause = error;
            this.sentry?.captureException(wrappedError);
        }
        if (this.gui && this.gui.getRootController()) {
            try {
                const messageBoxApi = this.gui.getMessageBoxApi();
                await messageBoxApi.alert(errorMessage, strings.get("GUI:OK"));
            }
            catch (e) {
                console.error("Failed to show error dialog:", e);
                const errorBox = new BasicErrorBoxApi(this.viewport, strings, this.rootEl!);
                await errorBox.show(errorMessage, fatal);
            }
        }
        else {
            const errorBox = new BasicErrorBoxApi(this.viewport, strings, this.rootEl!);
            await errorBox.show(errorMessage, fatal);
        }
    }
    private async handleGameResImportError(error: Error, strings: Strings): Promise<void> {
        let errorMessage = strings.get("ts:import_failed");
        if (error.name === "FileNotFoundError") {
            const fileField = (error as any).file || '';
            const template = strings.get("ts:import_file_not_found");
            const replaced = template.indexOf("%s") >= 0 ?
                template.replace(/%s/g, fileField) :
                template + " " + fileField;
            errorMessage += "\n\n" + replaced;
        }
        else if (error.name === "InvalidArchiveError") {
            errorMessage += "\n\n" + strings.get("ts:import_invalid_archive");
        }
        else if (error.name === "ArchiveExtractionError") {
            if ((error as any).cause?.message?.match(/out of memory|allocation/i)) {
                errorMessage += "\n\n" + strings.get("ts:import_out_of_memory");
            }
            else {
                errorMessage += "\n\n" + strings.get("ts:import_archive_extract_failed");
                const wrappedError = new Error(`Game res import failed (${error.message ?? error.name})`);
                (wrappedError as any).cause = error;
                this.sentry?.captureException(wrappedError);
            }
        }
        else if (error.name === "NoWebAssemblyError") {
            errorMessage += "\n\n" + strings.get("ts:import_no_web_assembly");
        }
        else if (error.name === "ChecksumError") {
            const fileField = (error as any).file || '';
            const template = strings.get("ts:import_checksum_mismatch");
            const replaced = template.indexOf("%s") >= 0 ?
                template.replace(/%s/g, fileField) :
                template + " " + fileField;
            errorMessage += "\n\n" + replaced;
        }
        else if (error.name === "DownloadError" || error.message?.match(/XHR error|Failed to fetch|CompileError: WebAssembly|SystemJS|NetworkError|Load failed/i)) {
            errorMessage += "\n\n" + strings.get("ts:downloadfailed");
        }
        else if (error.name === "ArchiveDownloadError") {
            const urlField = (error as any).url || '';
            const template = strings.get("ts:import_archive_download_failed");
            const replaced = template.indexOf("%s") >= 0 ?
                template.replace(/%s/g, urlField) :
                template + " " + urlField;
            errorMessage = replaced;
        }
        else if (error.name === "NoStorageError") {
            errorMessage += "\n\n" + strings.get("ts:import_no_storage");
        }
        else if (error.message?.match(/out of memory|allocation/i) || error.name.match(/NS_ERROR_FAILURE|NS_ERROR_OUT_OF_MEMORY/)) {
            errorMessage += "\n\n" + strings.get("ts:import_out_of_memory");
        }
        else if (error.name === "QuotaExceededError" || error.name === "StorageQuotaError") {
            errorMessage += "\n\n" + strings.get("ts:storage_quota_exceeded");
        }
        else if (error.name !== "IOError" && error.name !== "FileNotFoundError" && error.name !== "AbortError") {
            const wrappedError = new Error("Game res import failed " + (error.message ?? error.name));
            (wrappedError as any).cause = error;
            this.sentry?.captureException(wrappedError);
        }
        if (this.gui && this.gui.getRootController()) {
            try {
                const messageBoxApi = this.gui.getMessageBoxApi();
                await messageBoxApi.alert(errorMessage, strings.get("GUI:OK"));
            }
            catch (e) {
                console.error("Failed to show error dialog:", e);
                const errorBox = new BasicErrorBoxApi(this.viewport, strings, this.rootEl!);
                await errorBox.show(errorMessage, false);
            }
        }
        else {
            const errorBox = new BasicErrorBoxApi(this.viewport, strings, this.rootEl!);
            await errorBox.show(errorMessage, false);
        }
    }
}
declare global {
    interface Window {
        gtag?: (...args: any[]) => void;
    }
}

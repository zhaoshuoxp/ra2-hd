import { MainMenuScreen } from '../MainMenuScreen';
import { MainMenuScreenType, ScreenType } from '../../ScreenType';
import { MainMenuRoute } from '../MainMenuRoute';
import { jsx } from '../../../jsx/jsx';
import { HtmlView } from '../../../jsx/HtmlView';
import { CampaignSelection } from '../../../campaign/CampaignSelection';
import { CampaignMissionList } from '../../../campaign/CampaignMissionList';
import { CampaignLaunchTransition } from '../../../campaign/CampaignLaunchTransition';
import { CampaignMediaPlayer } from '../../../campaign/CampaignMediaPlayer';
import { campaignMovieSource } from '../../../../offline/hdMovies';
import { loadPreparedCampaign } from '../../../../offline/campaign';
import { Engine } from '../../../../engine/Engine';
import { readCampaignCatalog } from '../../../../data/campaign/CampaignCatalog';
import { activeEdition } from '../../../../editions/activeEdition';
import type { CampaignCheckpoint } from '../../../../game/campaign/CampaignCheckpoint';
import { MusicType } from '../../../../engine/sound/Music';
import { ChannelType } from '../../../../engine/sound/ChannelType';
import { loadCampaignPresentation, type CampaignFaction, type CampaignPresentation } from '../../../campaign/CampaignPresentation';
import { isCampaignDifficulty, type CampaignDifficulty } from '../../../../data/campaign/CampaignDefinition';
import { describeCampaignMission, campaignMissionImplemented, campaignMissionSemantics, campaignPlayerCountryIndex, campaignRouteFaction,
    type CampaignMission } from '../../../../data/campaign/CampaignMission';
import { CampaignSaveLibrary } from '../../../campaign/CampaignSaveLibrary';
import { SaveBrowserScreen } from '../../../save/SaveBrowserScreen';
import { campaignMovieSubtitles } from '../../../campaign/CampaignSubtitleTracks';
import { campaignPreview, campaignCatalogPreview } from '../../../campaign/CampaignPreview';
import { campaignAiSourceSha256 } from '../../../../data/campaign/CampaignAiLibrary';
import { CampaignGlobals, type CampaignGlobalState } from '../../../../game/campaign/CampaignGlobals';
import { DEFAULT_SOLO_SPEED } from '../../game/gameMenu/gameSpeedControl';
import { loadOriginalMovieLibrary, playOriginalLibraryMovie } from '../../../../offline/movies';
import { campaignIntroductionSeen, rememberCampaignIntroduction } from '../../../campaign/CampaignIntroduction';

interface CampaignScreenParams {
    playIntroduction?: boolean;
    difficulty?: CampaignDifficulty;
    faction?: CampaignFaction;
    mission?: string;
    start?: string;
    selectMission?: boolean;
    incomingGlobals?: CampaignGlobalState;
}

export class CampaignScreen extends MainMenuScreen {
    private prepared?: Awaited<ReturnType<typeof loadPreparedCampaign>>;
    private media?: CampaignMediaPlayer;
    private generation = 0;
    private selectionGeneration = 0;
    private error?: string;
    private view?: any;
    private viewComponent?: any;
    private startingRoute = false;
    private presentation?: CampaignPresentation;
    private difficulty: CampaignDifficulty = 'normal';
    private faction?: CampaignFaction;
    private browsing = false;
    private missions: CampaignMission[] = [];
    private selected = 'sov01t.map';
    private previewImage?: string;
    private busy = false;
    private status = '';
    private hoverSound?: { stop(): void };
    private startGlobals?: CampaignGlobalState;
    constructor(private readonly rootController: any, private readonly strings: any,
        private readonly jsxRenderer: any, private readonly music: any, private readonly mixer: any, private readonly sound?: any,
        private readonly localPrefs?: any) {
        super(); this.title = strings.get('GUI:CampaignMenu');
    }
    async onEnter(params?: CampaignScreenParams): Promise<void> {
        if (isCampaignDifficulty(params?.difficulty)) this.difficulty = params.difficulty;
        this.faction = params?.faction;
        this.browsing = !!(params?.selectMission || params?.mission || params?.start);
        this.startingRoute = !!params?.start;
        this.selected = params?.start ?? params?.mission ?? this.selected;
        this.startGlobals = undefined;
        const generation = ++this.generation;
        this.controller.setCampaignLayout(true);
        this.controller.toggleMainVideo(false);
        this.media = new CampaignMediaPlayer(() => {}, () => [ChannelType.Master, ChannelType.Voice]
            .reduce((volume, channel) => volume * (this.mixer.isMuted(channel) ? 0 : this.mixer.getVolume(channel)), 1), active => {
            if (generation !== this.generation) return;
            if (active) this.music?.stopPlaying(); else if (!this.busy) void this.music?.play(MusicType.Intro);
        });
        this.error = undefined; this.busy = false; this.status = this.strings.get('HD:CampaignPreparing'); this.render();
            try {
                if (params?.playIntroduction && !campaignIntroductionSeen(activeEdition)) {
                    this.busy = true; this.render();
                    const movies = await loadOriginalMovieLibrary(activeEdition);
                    if (generation !== this.generation) return;
                    const intro = movies.find(movie => movie.role === 'introduction');
                    if (!intro || !this.media) throw Error('Original edition introduction is unavailable');
                    const outcome = await playOriginalLibraryMovie(intro, this.media, this.strings, () => generation === this.generation);
                    if (generation !== this.generation) return;
                    if (outcome === 'cancelled') throw Error('Edition introduction was cancelled');
                    rememberCampaignIntroduction(activeEdition);
                    this.busy = false; void this.music?.play(MusicType.Intro);
                }
                if (params?.start && params.incomingGlobals !== undefined) this.startGlobals = new CampaignGlobals(params.incomingGlobals).snapshot();
                const common = await loadPreparedCampaign('sov01t.map', 'ra2');
                const sources = activeEdition === 'yr' ? (await loadPreparedCampaign('sov02t.map', 'ra2')).manifest : undefined;
                const presentation = await loadCampaignPresentation(common.manifest, 'selection', sources);
                if (generation !== this.generation) { presentation.dispose(); return; }
                this.presentation = presentation;
                this.missions = (activeEdition === 'ra2' ? common.manifest.catalog
                    : readCampaignCatalog('yr', Engine.vfs.openFile('mapselmd.ini').readAsString())).map(describeCampaignMission);
                this.prepared = activeEdition === 'ra2' ? common : undefined;
                this.status = this.strings.get('HD:CampaignChooseFaction');
                if (this.browsing) {
                    this.faction ??= 'soviet';
                    await this.selectMission(this.selected);
                }
            } catch (error) { if (generation === this.generation) { this.busy = false; this.error = error instanceof Error ? error.message : String(error); } }
        if (generation !== this.generation) return;
        this.render();
        if (params?.start && !this.error) await this.startSelected();
        if (this.error && this.startingRoute) { this.startingRoute = false; this.render(); }
    }
    private completions(): any[] {
        try {
            const progress = JSON.parse(this.localPrefs?.getItem('_r_campaignProgress_v1') ?? 'null');
            return Array.isArray(progress?.completed) ? progress.completed.filter((entry: any) =>
                (entry.edition ?? progress.edition) === activeEdition && isCampaignDifficulty(entry.difficulty)) : [];
        } catch { return []; }
    }
    private render(): void {
        const list = this.browsing;
        const factions: CampaignFaction[] = activeEdition === 'yr' ? ['allied', 'soviet'] : ['allied', 'tutorial', 'soviet'];
        const props = list ? { strings: this.strings, presentation: this.presentation, difficulty: this.difficulty,
            missions: this.missions.filter(entry => entry.faction === (this.faction === 'tutorial' ? 'training' : this.faction)),
            selected: this.selected, preview: this.previewImage, completed: this.completions(), busy: this.busy, status: this.status,
            error: this.error, onMission: (mission: string) => { this.startGlobals = undefined; void this.selectMission(mission); },
            onDifficulty: (difficulty: CampaignDifficulty) => { this.startGlobals = undefined; this.difficulty = difficulty; this.render(); },
            faction: this.faction ?? 'soviet', factions, onFaction: (faction: CampaignFaction) => { this.startGlobals = undefined; void this.browseMissions(faction); } }
            : { strings: this.strings, presentation: this.presentation, difficulty: this.difficulty, status: this.status,
                error: this.error, busy: this.busy, onSelect: (faction: CampaignFaction) => { this.startGlobals = undefined; void this.selectFaction(faction); },
                onHover: (faction: CampaignFaction) => this.playFactionSound(faction),
                factions,
                onDifficulty: (difficulty: CampaignDifficulty) => { this.startGlobals = undefined; this.difficulty = difficulty; this.render(); } };
        const viewComponent = this.startingRoute ? CampaignLaunchTransition : list ? CampaignMissionList : CampaignSelection;
        const viewProps = this.startingRoute ? { strings: this.strings } : props;
        if (this.view && this.viewComponent === viewComponent) this.view.applyOptions((options: any) => Object.assign(options, viewProps));
        else {
            const [component] = this.jsxRenderer.render(jsx(HtmlView, { width: '100%', height: '100%',
                component: viewComponent, innerRef: (view: any) => this.view = view, props: viewProps }));
            this.viewComponent = viewComponent;
            this.controller.setMainComponent(component);
        }
        if (this.startingRoute) { this.controller.setSidebarButtons([]); return; }
        const mission = this.missions.find(entry => entry.filename === this.selected);
        this.controller.setSidebarButtons([
            ...(list ? [{ label: this.strings.get('HD:CampaignStartMission'), disabled: this.busy || !mission?.playable || this.prepared?.manifest.mission !== this.selected,
                onClick: () => void this.startSelected() }]
                : [{ label: this.strings.get('HD:CampaignSelectMission'), disabled: this.busy || !this.presentation,
                    onClick: () => void this.browseMissions(this.faction ?? 'soviet') }]),
            { label: this.strings.get('GUI:Load'), disabled: this.busy, onClick: () => void this.openSaves() },
            { label: this.strings.get('GUI:Back'), isBottom: true, disabled: this.busy, onClick: () => {
                if (this.browsing) { this.browsing = false; this.status = this.strings.get('HD:CampaignChooseFaction'); this.render(); }
                else this.controller.goToScreen(MainMenuScreenType.Home);
            } },
        ]);
        this.controller.showSidebarButtons();
    }
    private async openSaves(): Promise<void> {
        const screen = new SaveBrowserScreen(this.strings, this.jsxRenderer);
        screen.setController(this.controller);
        this.controller.addScreen(MainMenuScreenType.CampaignSaves, screen);
        await this.controller.pushScreen(MainMenuScreenType.CampaignSaves, { rootController: this.rootController, options: {
            scope: 'campaign', engineVersion: '', storage: new CampaignSaveLibrary(this.strings.get('HD:LegacyCampaignSave')),
            menuArt: { faction: this.faction ?? 'soviet' }, loadRecord: async (record: any) => {
                const checkpoint = record.checkpoint;
                this.difficulty = checkpoint.options.campaign.difficulty;
                await this.rootController.goToScreenBlocking(ScreenType.Game, { create: true, singlePlayer: true,
                    gameId: checkpoint.gameId, timestamp: checkpoint.timestamp, playerName: checkpoint.options.humanPlayers[0].name,
                    gameOpts: checkpoint.options, campaignCheckpoint: checkpoint,
                    returnTo: new MainMenuRoute(MainMenuScreenType.Campaign, {
                        faction: campaignRouteFaction(checkpoint.identity.edition, checkpoint.identity.mission),
                        mission: checkpoint.identity.mission, difficulty: this.difficulty }) });
            },
        } });
    }
    private playFactionSound(faction: CampaignFaction): void {
        if (this.busy) return;
        this.hoverSound?.stop();
        this.hoverSound = this.sound?.play({ allied: 'AlliedCampaignSelect', soviet: 'SovietCampaignSelect', tutorial: 'BootCampSelect' }[faction], ChannelType.Ui);
    }
    private async selectFaction(faction: CampaignFaction): Promise<void> {
        if (!this.presentation || this.busy) return;
        this.faction = faction;
        const entries = this.missions.filter(entry => entry.faction === (faction === 'tutorial' ? 'training' : faction));
        const first = entries[0];
        if (!first?.playable) { this.status = this.strings.get('HD:CampaignMissionUnavailable'); this.render(); return; }
        await this.selectMission(first.filename);
        await this.startSelected();
    }
    private async browseMissions(faction: CampaignFaction): Promise<void> {
        if (!this.presentation || this.busy) return;
        this.browsing = true; this.faction = faction;
        const entries = this.missions.filter(entry => entry.faction === (faction === 'tutorial' ? 'training' : faction));
        await this.selectMission(entries.find(entry => entry.filename === this.selected)?.filename ?? entries[0]?.filename);
    }
    private async selectMission(filename?: string): Promise<void> {
        if (!filename || this.busy) return;
        const selection = ++this.selectionGeneration, generation = this.generation;
        this.selected = filename; this.previewImage = undefined; this.error = undefined;
        this.prepared = undefined;
        this.status = this.strings.get(campaignMissionImplemented(activeEdition, filename) ? 'HD:CampaignMissionAvailable' : 'HD:CampaignMissionUnavailable');
        this.render();
        try {
            const prepared = campaignMissionImplemented(activeEdition, filename) ? await loadPreparedCampaign(filename) : undefined;
            const preview = prepared ? await campaignPreview(prepared.manifest) : campaignCatalogPreview(filename, activeEdition);
            if (generation !== this.generation || selection !== this.selectionGeneration) return;
            this.prepared = prepared; this.previewImage = preview;
        } catch (error) { if (generation === this.generation && selection === this.selectionGeneration) this.error = String(error); }
        if (generation === this.generation && selection === this.selectionGeneration) this.render();
    }
    private async startSelected(): Promise<void> {
        if (!this.prepared || this.busy || !campaignMissionImplemented(activeEdition, this.prepared.manifest.mission)) return;
        await this.startPrepared();
    }
    private async startPrepared(): Promise<void> {
        if (!this.prepared || this.busy) return;
        const generation = this.generation;
        this.hoverSound?.stop(); this.hoverSound = undefined;
        this.busy = true; this.error = undefined; this.status = this.strings.get('HD:CampaignStarting'); this.render();
        try {
            const basic = this.prepared.definition.ini.getSection('Basic')!, seen = new Set<string>();
            for (const field of ['Intro', 'Brief']) {
                const name = basic.getString(field).toLowerCase();
                if (!name || name === '<none>' || seen.has(name)) continue;
                seen.add(name);
                const outcome = await this.preview(name);
                if (generation !== this.generation) return;
                if (outcome !== 'ended' && outcome !== 'skipped') throw new Error('Mission movie playback was cancelled');
            }
            if (generation === this.generation) this.launchMission();
        } catch (error) {
            if (generation === this.generation) { this.error = String(error); this.busy = false; this.render(); void this.music?.play(MusicType.Intro); }
        }
    }
    private async preview(name: string): Promise<string | undefined> {
        const generation = this.generation, player = this.media;
        const media = this.prepared?.manifest.media.find(media => media.name.toLowerCase() === name || media.use === name);
        const entry = this.prepared?.manifest.files.find(file => file.name === media?.file);
        if (!media || !entry || !player) throw new Error(`Mission movie is unavailable: ${name}`);
        const source = campaignMovieSource(this.prepared!.manifest, media);
        if (generation !== this.generation || player !== this.media) { source.dispose(); return; }
        try { return await player.play({ id: media.name, url: source.url, source: source.source, placement: 'fullscreen',
            subtitles: campaignMovieSubtitles(this.prepared!.manifest.edition === 'yr' ? 'yr_' + media.name : media.name, this.strings),
            skipLabel: this.strings.get('HD:CampaignSkip') }); }
        finally { source.dispose(); }
    }
    private async launchDiagnostic(checkpoint?: CampaignCheckpoint, mission?: string): Promise<void> {
        if (mission) this.prepared = await loadPreparedCampaign(mission);
        this.launchMission(checkpoint, true);
    }
    private async launchPrepared(mission: string, sourceCreation?: {
        edition: 'yr'; mission: string; sourceSha256: string; gameId: string; timestamp: number;
    }, observer?: { originalOpening?: boolean }): Promise<void> {
        this.prepared = await loadPreparedCampaign(mission);
        this.selected = mission;
        if (sourceCreation) {
            const map = this.prepared.manifest.files.find(file => file.name === mission);
            if (activeEdition !== 'yr' || sourceCreation.edition !== 'yr' || sourceCreation.mission !== mission
                || sourceCreation.sourceSha256 !== map?.sha256 || typeof sourceCreation.gameId !== 'string'
                || !sourceCreation.gameId.startsWith(`campaign-yr-${mission}-`) || sourceCreation.gameId.length > 128
                || !Number.isSafeInteger(sourceCreation.timestamp) || sourceCreation.timestamp < 0) {
                throw new Error('Invalid original campaign creation identity for diagnostic input replay');
            }
        }
        if (observer?.originalOpening) {
            if (sourceCreation) throw new Error('Original opening observation requires a fresh campaign creation identity');
            await this.startPrepared();
            return;
        }
        this.launchMission(undefined, false, sourceCreation);
    }
    private launchMission(checkpoint?: CampaignCheckpoint, diagnostic = false,
        sourceCreation?: { gameId: string; timestamp: number }): void {
        if (!this.prepared || this.prepared.manifest.edition !== activeEdition) return;
        const { manifest, definition } = this.prepared;
        const map = manifest.files.find(file => file.name === manifest.mission)!;
        const player = definition.ini.getSection('Basic')!.getString('Player');
        const countryId = campaignPlayerCountryIndex(definition, Engine.rules);
        const mission = this.missions.find(entry => entry.filename === manifest.mission);
        const gameOpts = { gameMode: 1, gameSpeed: DEFAULT_SOLO_SPEED, credits: 0, unitCount: 0, shortGame: false, superWeapons: true,
            buildOffAlly: false, mcvRepacks: true, cratesAppear: false,
            destroyableBridges: definition.ini.getSection('SpecialFlags')?.has('DestroyableBridges')
                ? definition.ini.getSection('SpecialFlags')!.getBool('DestroyableBridges') : true, multiEngineer: false,
            noDogEngiKills: false, mapName: manifest.mission, mapTitle: this.strings.get(mission?.title ?? 'Name:Sov02'),
            mapDigest: '', mapSizeBytes: map.bytes, maxSlots: 8, mapOfficial: false,
            humanPlayers: [{ name: player, countryId, colorId: 0, startPos: 0, teamId: 0 }], aiPlayers: [],
            campaign: { edition: manifest.edition, mission: manifest.mission, difficulty: this.difficulty, diagnostic,
                semanticsVersion: campaignMissionSemantics(manifest.mission),
                startingCreditsVersion: 1,
                startingVeterancyVersion: 1,
                tileLineVersion: 1,
                bridgeRallyVersion: 1,
                demolitionSafetyVersion: 1,
                neutralStructureTargetingVersion: 1,
                retaliationVersion: 1,
                parasiteCadenceVersion: 1,
                civilianTargetingVersion: 2,
                ...(manifest.mission === 'all10s.map' ? { baseActivationVersion: 3 as const } : {}),
                ...(manifest.mission === 'all12s.map' ? { openingGraceVersion: 1 as const } : {}),
                ...(manifest.mission === 'all03u.map' ? { teamRecruitmentVersion: 1 as const } : {}),
                ...(manifest.mission === 'sov05u.map' ? { chargingVersion: 1 as const } : {}),
                ...(manifest.mission === 'sov09u.map' ? { paradropControlVersion: 1 as const } : {}),
                ...(manifest.mission === 'sov01t.map' ? { countryIdentityVersion: 1 as const } : {}),
                ...(this.startGlobals === undefined ? {} : { incomingGlobals: new CampaignGlobals(this.startGlobals).snapshot() }),
                ...(campaignMissionSemantics(manifest.mission) >= 6 ? { globalAiSha256: campaignAiSourceSha256(manifest.edition) } : {}),
                sourceSha256: map.sha256, provenanceDigest: manifest.provenanceDigest } };
        this.rootController.goToScreen(ScreenType.Game, { create: true, singlePlayer: true,
            gameId: checkpoint?.gameId ?? sourceCreation?.gameId ?? `campaign-${manifest.edition}-${manifest.mission}-${crypto.randomUUID()}`,
            timestamp: checkpoint?.timestamp ?? sourceCreation?.timestamp ?? Date.now(), playerName: player, gameOpts: checkpoint?.options ?? gameOpts, campaignCheckpoint: checkpoint,
            returnTo: new MainMenuRoute(MainMenuScreenType.Campaign, { faction: campaignRouteFaction(manifest.edition, manifest.mission),
                mission: manifest.mission, difficulty: this.difficulty }) });
    }
    onViewportChange(): void {}
    async onLeave(): Promise<void> {
        this.hoverSound?.stop(); this.hoverSound = undefined;
        this.generation++; this.selectionGeneration++; this.media?.dispose(); this.media = undefined; this.prepared = undefined;
        this.startGlobals = undefined;
        this.presentation?.dispose(); this.presentation = undefined; this.previewImage = undefined;
        this.view = this.viewComponent = undefined;
        this.controller.setMainComponent(); await this.controller.hideSidebarButtons(); this.controller.setCampaignLayout(false);
    }
    async onStack(): Promise<void> { await this.onLeave(); }
    onUnstack(): void { void this.onEnter({ faction: this.faction, mission: this.browsing ? this.selected : undefined, difficulty: this.difficulty }); }
}

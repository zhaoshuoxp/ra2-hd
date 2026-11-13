import { Engine } from '@/engine/Engine';
import { campaignStartGlobals } from '../../../../game/campaign/CampaignGlobals';
import { ImageUtils } from '@/engine/gfx/ImageUtils';
import { jsx } from "@/gui/jsx/jsx";
import { HtmlView } from "@/gui/jsx/HtmlView";
import { ScoreTable } from "@/gui/screen/mainMenu/score/ScoreTable";
import { SideType } from "@/game/SideType";
import { MusicType } from "@/engine/sound/Music";
import { MainMenuScreen } from "@/gui/screen/mainMenu/MainMenuScreen";
import { Task } from "@puzzl/core/lib/async/Task";
import { OperationCanceledError } from "@puzzl/core/lib/async/cancellation/OperationCanceledError";
import { sleep } from "@puzzl/core/lib/async/sleep";
import { CampaignResult } from '../../../campaign/CampaignResult';
import { loadCampaignScorePresentation, type CampaignScorePresentation } from '../../../campaign/CampaignScorePresentation';
import { SoundKey } from '../../../../engine/sound/SoundKey';
import { ChannelType } from '../../../../engine/sound/ChannelType';
import { MainMenuScreenType } from '../../ScreenType';
import { campaignMissionImplemented, campaignRouteFaction } from '../../../../data/campaign/CampaignMission';
import { CampaignMediaPlayer } from '../../../campaign/CampaignMediaPlayer';
import { CampaignMovieAssets } from '../../../campaign/CampaignMovieAssets';
import { loadPreparedCampaign } from '../../../../offline/campaign';
import { campaignSkipsScore } from '../../../campaign/CampaignScoreModel';
interface Game {
    id: string;
    campaign?: any;
}
interface Player {
    country?: {
        side: SideType;
    };
}
interface ScoreScreenParams {
    game: Game;
    localPlayer: Player;
    singlePlayer: boolean;
    tournament: boolean;
    returnTo: {
        screenType: any;
        params: any;
    };
}
interface GameReport {
    gameId: string;
}
interface WolService {
    getLastGameReport(): GameReport | undefined;
}
const sideAssets = new Map<SideType, {
    img: string;
    pal: string;
}>([
    [SideType.GDI, { img: "mpascrnl.shp", pal: "mpascrn.pal" }],
    [SideType.Nod, { img: "mpsscrnl.shp", pal: "mpsscrn.pal" }],
    [SideType.ThirdSide, { img: 'mpyscrnl.shp', pal: 'mpyscrn.pal' }],
]);
export class ScoreScreen extends MainMenuScreen {
    private strings: any;
    private jsxRenderer: any;
    private wolService: WolService;
    private scoreTable?: any;
    private reportUpdateTask?: Task<void>;
    private campaignPresentation?: CampaignScorePresentation;
    private media?: CampaignMediaPlayer;
    private movies?: CampaignMovieAssets;
    private generation = 0;
    private leavingCampaign = false;
    private campaignError?: string;
    private readonly playEmblemSound = () => this.sound?.play(SoundKey.ScoreAnimSound, ChannelType.Ui);
    constructor(strings: any, jsxRenderer: any, wolService: WolService, private readonly sound?: any, private readonly mixer?: any) {
        super();
        this.strings = strings;
        this.jsxRenderer = jsxRenderer;
        this.wolService = wolService;
        this.musicType = MusicType.Score;
    }
    async onEnter(params: ScoreScreenParams): Promise<void> {
        const generation = ++this.generation;
        this.leavingCampaign = false; this.campaignError = undefined;
        const skipScore = params.game.campaign && campaignSkipsScore(params.game.campaign);
        this.musicType = skipScore ? MusicType.Options : MusicType.Score;
        this.title = skipScore ? this.strings.get('GUI:TutorialCampaign') : params.game.campaign ? this.strings.get('GUI:StandaloneScore') : params.singlePlayer
            ? this.strings.get("GUI:SkirmishScore")
            : this.strings.get("GUI:MultiplayerScore");
        this.controller.toggleMainVideo(false);
        if (params.game.campaign) {
            this.controller.setCampaignLayout(true);
            if (!skipScore) {
                const presentation = await loadCampaignScorePresentation(params.game.campaign.launch.mission, params.game.campaign.launch.edition);
                if (generation !== this.generation) { presentation.dispose(); return; }
                this.campaignPresentation = presentation;
            }
        }
        this.initView(params);
        if (!params.singlePlayer) {
            this.loadGameReport(params.game);
        }
    }
    private initView({ game, localPlayer, singlePlayer, tournament, returnTo, }: ScoreScreenParams): void {
        if (game.campaign) {
            const campaign = game.campaign, launch = campaign.launch;
            const next = campaign.definition && campaign.result === 'victory'
                ? campaign.definition.filename : undefined;
            const catalogNext = next && this.campaignNext(game);
            const terminal = campaign.result === 'victory' && !campaign.nextMission
                && (campaign.definition?.ini.getSection('Basic')?.getBool('EndOfGame') || campaignSkipsScore(campaign));
            const params = { faction: campaignRouteFaction(launch.edition, launch.mission), mission: launch.mission, difficulty: launch.difficulty };
            this.controller.setSidebarButtons([
                ...(terminal ? [] : [campaign.result === 'victory'
                    ? { label: this.strings.get('HD:CampaignContinueMission'), disabled: !catalogNext,
                        tooltip: catalogNext ? undefined : this.strings.get('HD:CampaignNextUnavailable'),
                        onClick: () => void this.leaveCampaign(game, { ...params, mission: catalogNext, start: catalogNext,
                            incomingGlobals: campaignStartGlobals(campaign, true) }) }
                    : { label: this.strings.get('HD:CampaignRetryMission'),
                        onClick: () => void this.leaveCampaign(game, { ...params, start: launch.mission,
                            incomingGlobals: campaignStartGlobals(campaign, false) }) }]),
                { label: this.strings.get('HD:CampaignReturnSelection'), isBottom: true,
                    onClick: () => void this.leaveCampaign(game, params) },
            ]);
        } else {
        this.controller.setSidebarButtons([
            {
                label: this.strings.get("GUI:Continue"),
                tooltip: this.strings.get("STT:MPScoreButtonContinue"),
                isBottom: true,
                onClick: () => {
                    this.controller?.goToScreen(returnTo.screenType, returnTo.params);
                },
            },
        ]);
        }
        this.controller.showSidebarButtons();
        const side = localPlayer.country?.side ?? SideType.GDI;
        const assets = sideAssets.get(side);
        if (!assets) {
            throw new Error("Unsupported sideType " + side);
        }
        const [component] = this.jsxRenderer.render(jsx("container", { width: "100%", height: "100%" }, jsx(HtmlView, {
            width: "100%",
            height: "100%",
            component: game.campaign ? CampaignResult : ScoreTable,
            innerRef: (ref: any) => (this.scoreTable = ref),
            props: {
                game: game,
                player: localPlayer,
                presentation: this.campaignPresentation,
                playEmblemSound: this.playEmblemSound,
                error: this.campaignError,
                background: ImageUtils.convertShpToCanvas(Engine.images.get(assets.img), Engine.palettes.get(assets.pal)).toDataURL(),
                side,
                originalBackground: ImageUtils.convertShpToCanvas(Engine.images.get(assets.img), Engine.palettes.get(assets.pal)).toDataURL(),
                singlePlayer: singlePlayer,
                localPlayer: localPlayer,
                tournament: tournament,
                strings: this.strings,
            },
        })));
        this.controller.setMainComponent(component);
    }
    private campaignNext(game: Game): string | undefined {
        const launch = game.campaign.launch;
        // Catalog routing is populated from the archived selection manifest by
        // the game loader, independently of the map's legacy NextScenario.
        const next = game.campaign.nextMission;
        return next && campaignMissionImplemented(launch.edition, next) ? next : undefined;
    }
    private async leaveCampaign(game: Game, params: any): Promise<void> {
        if (this.leavingCampaign) return;
        this.leavingCampaign = true;
        const generation = this.generation, launch = game.campaign.launch;
        const definition = game.campaign.definition;
        const fields = game.campaign.result === 'victory' ? ['PostScore', 'PreMapSelect'] : [];
        try {
            if (fields.some(field => {
                const name = definition.ini.getSection('Basic')?.getString(field);
                return name && name !== '<none>';
            })) {
                const prepared = await loadPreparedCampaign(launch.mission, launch.edition);
                const assets = await CampaignMovieAssets.load(prepared.manifest);
                if (generation !== this.generation) { assets.dispose(); return; }
                this.movies?.dispose(); this.movies = assets;
                this.media?.dispose();
                const media = new CampaignMediaPlayer(() => {}, () => [ChannelType.Master, ChannelType.Voice].reduce((volume, channel) =>
                    volume * (this.mixer?.isMuted(channel) ? 0 : this.mixer?.getVolume(channel) ?? 1), 1), active =>
                    this.sound?.audioSystem.setDucking(media, ChannelType.Music, active ? 0 : undefined));
                this.media = media;
                const completed = await assets.sequence(definition, fields, media, this.strings, () => generation === this.generation);
                if (!completed) return;
            }
            if (generation === this.generation) await this.controller.goToScreenBlocking(MainMenuScreenType.Campaign, params);
        } catch (error) {
            console.error('Campaign ending media failed', error);
            if (generation === this.generation) {
                this.campaignError = this.strings.get('HD:CampaignMediaFailed');
                this.scoreTable?.applyOptions((options: any) => { options.error = this.campaignError; });
            }
        } finally { if (generation === this.generation) this.leavingCampaign = false; }
    }
    private loadGameReport(game: Game): void {
        this.reportUpdateTask?.cancel();
        const task = (this.reportUpdateTask = new Task(async (cancellationToken) => {
            while (true) {
                if (cancellationToken.isCancelled())
                    return;
                const report = this.wolService.getLastGameReport();
                if (report?.gameId === game.id) {
                    this.scoreTable.applyOptions((options: any) => {
                        options.gameReport = report;
                    });
                    return;
                }
                await sleep(1000, cancellationToken);
            }
        }));
        task.start().catch((error) => {
            if (!(error instanceof OperationCanceledError)) {
                console.error(error);
            }
        });
    }
    async onLeave(): Promise<void> {
        this.generation++; this.media?.dispose(); this.media = undefined; this.movies?.dispose(); this.movies = undefined;
        if (this.reportUpdateTask) {
            this.reportUpdateTask.cancel();
            this.reportUpdateTask = undefined;
        }
        await this.controller.hideSidebarButtons();
        this.controller.setMainComponent();
        this.campaignPresentation?.dispose();
        this.campaignPresentation = undefined;
        this.controller.setCampaignLayout(false);
    }
    async onStack(): Promise<void> {
        await this.onLeave();
    }
    onUnstack(): void {
    }
}

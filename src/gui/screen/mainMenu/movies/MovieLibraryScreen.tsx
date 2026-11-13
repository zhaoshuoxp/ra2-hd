import { MainMenuScreen } from '../MainMenuScreen';
import { MainMenuScreenType } from '../../ScreenType';
import { jsx } from '../../../jsx/jsx';
import { HtmlView } from '../../../jsx/HtmlView';
import type { HtmlReactElement } from '../../../HtmlReactElement';
import { activeEdition } from '../../../../editions/activeEdition';
import { ChannelType } from '../../../../engine/sound/ChannelType';
import { MusicType } from '../../../../engine/sound/Music';
import { CampaignMediaPlayer } from '../../../campaign/CampaignMediaPlayer';
import { loadOriginalMovieLibrary, playOriginalLibraryMovie, type OriginalMovie } from '../../../../offline/movies';

function movieTitle(movie: OriginalMovie, strings: any, index: number): string {
    const title = movie.titleKey && strings.has(movie.titleKey) ? strings.get(movie.titleKey) : strings.get('HD:MovieClipNumber', index + 1);
    return title + ' · ' + strings.get('HD:MovieRole:' + movie.role);
}
function MovieLibrary({ movies, selected, busy, error, strings, onSelect }: any) {
    return <section data-movie-library data-movie-library-ready={!busy} style={{ height: '100%', boxSizing: 'border-box',
        padding: '24px 30px', color: '#ffff54', display: 'flex', flexDirection: 'column', gap: 16, background: '#080504e8' }}>
        <h2 style={{ margin: 0, fontSize: 26 }}>{strings.get('HD:MenuMovies')} · {strings.get(activeEdition === 'ra2' ? 'HD:EditionRa2' : 'HD:EditionYr')}</h2>
        {busy && <p role="status">{strings.get('HD:MovieLoading')}</p>}
        {error && <p role="alert">{error}</p>}
        <div data-movie-library-list style={{ overflowY: 'auto', flex: 1, display: 'grid', alignContent: 'start', gap: 7 }}>
            {movies.map((movie: OriginalMovie, index: number) => <button key={movie.id} data-movie-id={movie.id}
                aria-pressed={movie.id === selected} disabled={busy} onClick={() => onSelect(movie.id)}
                style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', gap: 16, textAlign: 'left',
                    color: '#ffff8a', fontSize: 16, cursor: busy ? 'default' : 'pointer',
                    border: '1px solid ' + (movie.id === selected ? '#ef6e39' : '#65372d'), background: movie.id === selected ? '#582012' : '#1b0c08' }}>
                <span>{movieTitle(movie, strings, index)}</span>
                <span>{Math.floor(movie.durationSeconds / 60)}:{String(Math.floor(movie.durationSeconds % 60)).padStart(2, '0')}</span>
            </button>)}
        </div>
    </section>;
}

export class MovieLibraryScreen extends MainMenuScreen {
    private entries: OriginalMovie[] = [];
    private selected?: string;
    private busy = false;
    private error?: string;
    private view?: HtmlReactElement;
    private media?: CampaignMediaPlayer;
    private generation = 0;
    constructor(private readonly strings: any, private readonly jsxRenderer: any, private readonly music: any, private readonly mixer: any) {
        super(); this.title = strings.get('HD:MenuMovies');
    }
    async onEnter(): Promise<void> {
        const generation = ++this.generation;
        this.controller.setCampaignLayout(true); this.controller.toggleMainVideo(false);
        this.busy = true; this.error = undefined; this.render();
        this.media = new CampaignMediaPlayer(() => {}, () => [ChannelType.Master, ChannelType.Voice]
            .reduce((volume, channel) => volume * (this.mixer.isMuted(channel) ? 0 : this.mixer.getVolume(channel)), 1), active => {
            if (generation !== this.generation) return;
            if (active) this.music?.stopPlaying(); else void this.music?.play(MusicType.Intro);
        });
        try {
            const entries = await loadOriginalMovieLibrary(activeEdition);
            if (generation !== this.generation) return;
            this.entries = entries.sort((a, b) => Number(b.role === 'introduction') - Number(a.role === 'introduction') || a.id.localeCompare(b.id));
            this.selected = this.entries.find(entry => entry.id === this.selected)?.id ?? this.entries[0]?.id;
        } catch (error) { console.error('Original movie library:', error); this.error = this.strings.get('HD:MoviesUnavailable'); }
        if (generation === this.generation) { this.busy = false; this.render(); }
    }
    private render(): void {
        const props = { movies: this.entries, selected: this.selected, busy: this.busy, error: this.error, strings: this.strings,
            onSelect: (id: string) => { this.selected = id; this.render(); } };
        if (this.view) this.view.applyOptions(options => Object.assign(options, props));
        else {
            const [component] = this.jsxRenderer.render(jsx(HtmlView, { width: '100%', height: '100%', component: MovieLibrary,
                innerRef: (view: HtmlReactElement) => this.view = view, props }));
            this.controller.setMainComponent(component);
        }
        this.controller.setSidebarButtons([
            { label: this.strings.get('HD:MoviePlay'), disabled: this.busy || !this.selected, onClick: () => void this.play() },
            { label: this.strings.get('GUI:Back'), isBottom: true, onClick: () => this.controller.goToScreen(MainMenuScreenType.Home) },
        ]);
        this.controller.showSidebarButtons();
    }
    private async play(): Promise<void> {
        const movie = this.entries.find(entry => entry.id === this.selected), media = this.media, generation = this.generation;
        if (!movie || !media || this.busy) return;
        this.busy = true; this.error = undefined; this.render();
        try { await playOriginalLibraryMovie(movie, media, this.strings, () => generation === this.generation); }
        catch (error) { console.error('Original movie playback:', error); this.error = this.strings.get('HD:MoviesUnavailable'); }
        if (generation === this.generation) { this.busy = false; this.render(); }
    }
    async onLeave(): Promise<void> {
        this.generation++; this.media?.dispose(); this.media = undefined;
        this.controller.setMainComponent(); this.view = undefined;
        await this.controller.hideSidebarButtons(); this.controller.setCampaignLayout(false);
    }
    onViewportChange(): void {}
    async onStack(): Promise<void> { await this.onLeave(); }
    onUnstack(): void { void this.onEnter(); }
}

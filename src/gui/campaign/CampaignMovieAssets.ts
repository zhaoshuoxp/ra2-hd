import type { CampaignDefinition } from '../../data/campaign/CampaignDefinition';
import type { PreparedCampaign } from '../../offline/campaign';
import type { CampaignMoviePlacement } from '../../data/campaign/CampaignMoviePolicy';
import { campaignMovieSubtitles } from './CampaignSubtitleTracks';
import { CampaignMediaPlayer, type CampaignMediaOutcome } from './CampaignMediaPlayer';
import { campaignMovieSource } from '../../offline/hdMovies';

export class CampaignMovieAssets {
    private edition: 'ra2' | 'yr' = 'ra2';
    private sources = new Map<string, ReturnType<typeof campaignMovieSource>>();
    private movieIndices = new Map<number, string>();
    static async load(manifest: PreparedCampaign): Promise<CampaignMovieAssets> {
        const assets = new CampaignMovieAssets();
        assets.edition = manifest.edition;
        try {
            for (const movie of manifest.media) {
                const name = movie.name.toLowerCase(), entry = manifest.files.find(file => file.name === movie.file);
                if (!entry || assets.sources.has(name)) throw new Error(`Invalid campaign movie binding: ${name}`);
                assets.sources.set(name, campaignMovieSource(manifest, movie));
                if (movie.movieIndex !== undefined) {
                    if (!Number.isSafeInteger(movie.movieIndex) || movie.movieIndex < 0 || assets.movieIndices.has(movie.movieIndex)) {
                        throw new Error('Duplicate or invalid original movie index');
                    }
                    assets.movieIndices.set(movie.movieIndex, name);
                }
            }
            return assets;
        } catch (error) { assets.dispose(); throw error; }
    }
    request(name: string, player: CampaignMediaPlayer, strings: any,
        placement: CampaignMoviePlacement = 'fullscreen', startTime = 0): Promise<CampaignMediaOutcome> {
        name = name.toLowerCase();
        const source = this.sources.get(name);
        if (!source) throw new Error(`Campaign movie is not prepared: ${name}`);
        return player.play({ id: name, url: source.url, source: source.source, placement, startTime,
            subtitles: campaignMovieSubtitles(this.edition === 'yr' ? 'yr_' + name : name, strings),
            skipLabel: strings.get('HD:CampaignSkip') });
    }
    trigger(index: number, player: CampaignMediaPlayer, strings: any,
        placement: CampaignMoviePlacement = 'transmission'): Promise<CampaignMediaOutcome> {
        const name = this.movieIndices.get(index);
        if (!name) throw new Error(`Original campaign movie index is unavailable: ${index}`);
        return this.request(name, player, strings, placement);
    }
    async sequence(definition: CampaignDefinition, fields: string[], player: CampaignMediaPlayer, strings: any,
        current: () => boolean = () => true): Promise<boolean> {
        const seen = new Set<string>();
        for (const field of fields) {
            const name = definition.ini.getSection('Basic')?.getString(field).toLowerCase();
            if (!name || name === '<none>' || seen.has(name)) continue;
            seen.add(name);
            const outcome = await this.request(name, player, strings);
            if (!current() || outcome === 'cancelled') return false;
        }
        return current();
    }
    dispose(): void { for (const source of this.sources.values()) source.dispose(); this.sources.clear(); this.movieIndices.clear(); }
}

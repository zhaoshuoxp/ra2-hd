// Timecodes are derived from the locally supplied subtitle.txt. The final time field is 1/60 second.
import { soviet02SubtitleTimings } from './CampaignSoviet02Subtitles';
import { campaignCompletionSubtitleTimings } from './CampaignCompletionSubtitles';
import { localizeCampaignSubtitles, type CampaignSubtitleTiming } from './CampaignSubtitles';
export const campaignSubtitleTimings: Record<string, CampaignSubtitleTiming[]> = {
    "s01_f00e": [
        {
            "start": 1.5,
            "end": 3.5,
            "key": "hd:movie:s01_f00e:00"
        },
        {
            "start": 3.5,
            "end": 6,
            "key": "hd:movie:s01_f00e:01"
        },
        {
            "start": 6,
            "end": 9,
            "key": "hd:movie:s01_f00e:02"
        },
        {
            "start": 10,
            "end": 13,
            "key": "hd:movie:s01_f00e:03"
        },
        {
            "start": 13,
            "end": 15,
            "key": "hd:movie:s01_f00e:04"
        },
        {
            "start": 15,
            "end": 18,
            "key": "hd:movie:s01_f00e:05"
        },
        {
            "start": 20.5,
            "end": 22.5,
            "key": "hd:movie:s01_f00e:06"
        },
        {
            "start": 22.5,
            "end": 25.5,
            "key": "hd:movie:s01_f00e:07"
        },
        {
            "start": 25.5,
            "end": 28.5,
            "key": "hd:movie:s01_f00e:08"
        },
        {
            "start": 28.5,
            "end": 31,
            "key": "hd:movie:s01_f00e:09"
        },
        {
            "start": 31,
            "end": 33,
            "key": "hd:movie:s01_f00e:10"
        },
        {
            "start": 33.666666666666664,
            "end": 37,
            "key": "hd:movie:s01_f00e:11"
        },
        {
            "start": 37,
            "end": 41,
            "key": "hd:movie:s01_f00e:12"
        },
        {
            "start": 41,
            "end": 42.5,
            "key": "hd:movie:s01_f00e:13"
        },
        {
            "start": 42.5,
            "end": 44,
            "key": "hd:movie:s01_f00e:14"
        },
        {
            "start": 44,
            "end": 47,
            "key": "hd:movie:s01_f00e:15"
        },
        {
            "start": 48,
            "end": 50,
            "key": "hd:movie:s01_f00e:16"
        },
        {
            "start": 50,
            "end": 54,
            "key": "hd:movie:s01_f00e:17"
        },
        {
            "start": 54,
            "end": 57,
            "key": "hd:movie:s01_f00e:18"
        },
        {
            "start": 57,
            "end": 59,
            "key": "hd:movie:s01_f00e:19"
        },
        {
            "start": 59,
            "end": 64,
            "key": "hd:movie:s01_f00e:20"
        },
        {
            "start": 64.5,
            "end": 67,
            "key": "hd:movie:s01_f00e:21"
        },
        {
            "start": 67,
            "end": 70,
            "key": "hd:movie:s01_f00e:22"
        },
        {
            "start": 70,
            "end": 73,
            "key": "hd:movie:s01_f00e:23"
        },
        {
            "start": 73,
            "end": 78,
            "key": "hd:movie:s01_f00e:24"
        },
        {
            "start": 79.5,
            "end": 82.5,
            "key": "hd:movie:s01_f00e:25"
        },
        {
            "start": 82.5,
            "end": 85,
            "key": "hd:movie:s01_f00e:26"
        },
        {
            "start": 85,
            "end": 86,
            "key": "hd:movie:s01_f00e:27"
        },
        {
            "start": 86,
            "end": 87.5,
            "key": "hd:movie:s01_f00e:28"
        },
        {
            "start": 87.5,
            "end": 90.5,
            "key": "hd:movie:s01_f00e:29"
        },
        {
            "start": 90.5,
            "end": 93.5,
            "key": "hd:movie:s01_f00e:30"
        },
        {
            "start": 93.5,
            "end": 96.5,
            "key": "hd:movie:s01_f00e:31"
        },
        {
            "start": 96.5,
            "end": 101.5,
            "key": "hd:movie:s01_f00e:32"
        }
    ],
    "s01_p01e": [
        {
            "start": 1.5,
            "end": 6.166666666666667,
            "key": "hd:movie:s01_p01e:00"
        },
        {
            "start": 6.166666666666667,
            "end": 10.166666666666668,
            "key": "hd:movie:s01_p01e:01"
        }
    ],
    ...soviet02SubtitleTimings,
    ...campaignCompletionSubtitleTimings
};
export function campaignMovieSubtitles(movie: string, strings: any) {
    return localizeCampaignSubtitles(campaignSubtitleTimings[movie.toLowerCase()] ?? [], strings);
}

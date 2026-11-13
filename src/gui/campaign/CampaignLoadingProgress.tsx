import { useId } from 'react';
import { CampaignChrome } from './CampaignChrome';
import { CampaignOriginalLoadingProgress } from './CampaignOriginalLoadingProgress';

export const CAMPAIGN_LOADING_SEGMENTS = 20;
// Source-cylinder cuts include the shorter end segments. These coordinates
// belong to the accepted housing, so resizing cannot move fill off its ribs.
export const CAMPAIGN_LOADING_CUTS = [383, 421.5, 472.5, 523.5, 575, 626.5, 677.5, 729,
    781, 832.5, 885, 936, 987.5, 1039, 1090.5, 1142, 1194, 1245.5, 1296.5, 1347, 1391];

export function completedLoadingSegments(percent: number): number {
    return Math.floor(Math.max(0, Math.min(100, percent)) * CAMPAIGN_LOADING_SEGMENTS / 100 + 1e-8);
}

export function CampaignLoadingProgress({ width, percent, housing, originalFrame, originalFillFrame }: {
    width: number; percent: number; housing?: string; originalFrame?: ImageData; originalFillFrame?: ImageData;
}) {
    const id = useId(), completed = completedLoadingSegments(percent);
    if (!housing && originalFrame && originalFillFrame) return <CampaignOriginalLoadingProgress width={width}
        completed={completed} background={originalFrame} fill={originalFillFrame}/>;
    const left = 172, length = width - 344;
    const sourceX = (x: number) => left + (x - 381.41) * length / 1011.18;
    const sourceY = (y: number) => -12.35 + (y - 385) * 52.35 / 106;
    const top = sourceY(427.5), bottom = sourceY(476);
    const cut = (index: number) => index === 0 ? 381.41
        : index === CAMPAIGN_LOADING_SEGMENTS ? 1392.59 : CAMPAIGN_LOADING_CUTS[index] - .5;
    // The tint stops vertically at the source groove center. All curved relief
    // remains in the shared artwork; the tint must not carve its own concavity.
    const path = (index: number) => {
        const x = sourceX(cut(index)), right = sourceX(cut(index + 1));
        return `M${x} ${top}H${right}V${bottom}H${x}Z`;
    };
    return <svg data-campaign-loading-segments={CAMPAIGN_LOADING_SEGMENTS} data-completed-segments={completed}
        data-loading-material-source={housing ? 'accepted-hd-housing' : 'vector-fallback'}
        width={width} height={40} viewBox={`0 0 ${width} 40`} overflow="visible" aria-hidden="true">
        <defs>
            <filter id={`${id}-orange-metal`} colorInterpolationFilters="sRGB">
                <feColorMatrix type="matrix" values=".2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0"/>
                <feComponentTransfer>
                    <feFuncR type="linear" slope=".08" intercept=".92"/>
                    <feFuncG type="gamma" amplitude="1" exponent=".35" offset="0"/>
                    <feFuncB type="gamma" amplitude=".7" exponent="1.7" offset="0"/>
                </feComponentTransfer>
            </filter>
            <clipPath id={`${id}-cylinder`}>
                <path transform={`translate(${left} -12.35) scale(${length / 1011.18} ${52.35 / 106}) translate(-381.41 -385)`}
                    d="M390 427.5H1384Q1391 427.5 1391 435V468Q1391 476 1384 476H390Q383 476 383 468V435Q383 427.5 390 427.5Z"/>
            </clipPath>
            <clipPath id={`${id}-completed`}>
                {Array.from({ length: CAMPAIGN_LOADING_SEGMENTS }, (_, index) => <path key={index}
                    data-loading-segment={index} data-filled={index < completed ? 'true' : 'false'} d={path(index)}
                    display={index < completed ? undefined : 'none'}/>)}
            </clipPath>
        </defs>
        <CampaignChrome image="spldbrl.shp" width={width} housing={housing}/>
        <g clipPath={`url(#${id}-completed)`} data-loading-fill="original-material-orange">
            <g clipPath={`url(#${id}-cylinder)`} filter={`url(#${id}-orange-metal)`}>
                <CampaignChrome image="spldbrl.shp" width={width} housing={housing}/>
            </g>
        </g>
    </svg>;
}

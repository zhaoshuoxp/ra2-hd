import { useId, useMemo } from 'react';

// Native spldbrl/spldbr geometry. The 25px fill occupies the inset cylinder
// at y=13, below its upper bevel; the earlier y=8 placement covered that bevel.
export const ORIGINAL_LOADING_FILL = { x: 172, y: 13, width: 456, height: 25 };
export const ORIGINAL_LOADING_CUTS = [0, 18, 41, 64, 87, 110, 134, 157, 180, 203,
    226, 249, 272, 295, 319, 342, 365, 388, 411, 434, 456];

function sourceUrl(frame: ImageData): string {
    const canvas = document.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height;
    canvas.getContext('2d')!.putImageData(frame, 0, 0);
    return canvas.toDataURL('image/png');
}

export function CampaignOriginalLoadingProgress({ width, completed, background, fill }: {
    width: number; completed: number; background: ImageData; fill: ImageData;
}) {
    const id = useId();
    const source = useMemo(() => {
        if (background.width !== 800 || background.height !== 40 || fill.width !== 456 || fill.height !== 25)
            throw Error('Original loading sprite geometry mismatch');
        return { background: sourceUrl(background), fill: sourceUrl(fill) };
    }, [background, fill]);
    const length = width - 344, scale = length / ORIGINAL_LOADING_FILL.width;
    return <svg data-campaign-loading-segments={20} data-completed-segments={completed}
        data-loading-material-source="original-shp-pair" data-original-fill-origin="172,13"
        width={width} height={40} viewBox={`0 0 ${width} 40`} overflow="visible" aria-hidden="true">
        <defs><clipPath id={`${id}-completed`}>
            {Array.from({ length: 20 }, (_, index) => {
                const x = 172 + ORIGINAL_LOADING_CUTS[index] * scale;
                const right = 172 + ORIGINAL_LOADING_CUTS[index + 1] * scale;
                return <path key={index} data-loading-segment={index} data-filled={index < completed ? 'true' : 'false'}
                    d={`M${x} 13H${right}V38H${x}Z`} display={index < completed ? undefined : 'none'}/>;
            })}
        </clipPath></defs>
        {[{ x: 0, width: 172, start: 0, sourceWidth: 172 },
            { x: 172, width: length, start: 172, sourceWidth: 456 },
            { x: width - 172, width: 172, start: 628, sourceWidth: 172 }].map(slice =>
            <svg key={slice.x} x={slice.x} width={slice.width} height={40}
                viewBox={`${slice.start} 0 ${slice.sourceWidth} 40`} preserveAspectRatio="none" overflow="hidden">
                <image href={source.background} width={800} height={40} style={{ imageRendering: 'pixelated' }}/>
            </svg>)}
        <g clipPath={`url(#${id}-completed)`} data-loading-fill="original-shp-fill">
            <svg x={172} y={13} width={length} height={25} viewBox="0 0 456 25" preserveAspectRatio="none" overflow="hidden">
                <image href={source.fill} width={456} height={25} style={{ imageRendering: 'pixelated' }}/>
            </svg>
        </g>
    </svg>;
}

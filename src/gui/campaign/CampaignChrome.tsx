import { useId } from 'react';

export function CampaignArrows({ image, frame }: { image: string; frame: number }) {
    const id = useId();
    if (!frame) return null;
    const layout = image === 'fsalg.shp' ? { x: 4, right: 491, y: 15, color: '#299bfa', light: '#74edff', dark: '#0956b7' }
        : image === 'fsbclg.shp' ? { x: 4, right: 389, y: 19, color: '#ffe32a', light: '#ffffac', dark: '#c49700' }
        : { x: 5, right: 363, y: 70, color: '#ff262a', light: '#ff918f', dark: '#b60912' };
    const travel = (frame - 1) * 10;
    return <g data-campaign-arrow-quality="vector-facets">
        <defs><linearGradient id={`${id}-body`} x2="0" y2="1">
            <stop stopColor={layout.light}/><stop offset=".43" stopColor={layout.color}/><stop offset="1" stopColor={layout.dark}/>
        </linearGradient></defs>
        {[false, true].map(mirror => <g key={String(mirror)} transform={mirror
            ? `translate(${layout.right - travel + 75} ${layout.y}) scale(-1 1)` : `translate(${layout.x + travel} ${layout.y})`}>
            <path d="M1 7H22L31 0L75 20L31 40L22 33H1Z" fill={`url(#${id}-body)`} stroke={layout.dark} strokeWidth=".6"/>
            <path d="M1 7H22L31 0V13L22 15H4Z" fill={layout.light}/>
            <path d="M31 0L75 20L31 13Z" fill={layout.light}/>
            <path d="M31 13L75 20L31 40Z" fill={layout.color}/>
            <path d="M4 15H22V33H1Z" fill={layout.color}/>
            <path d="M22 15L31 13V40L22 33Z" fill={layout.dark} opacity=".38"/>
            <path d="M2 7H22L31 .6L74 20" fill="none" stroke={layout.light} strokeWidth=".7"/>
        </g>)}
    </g>;
}

// Rebuild the retail metal housing, ribbed grips and segmented luminous fill as vectors.
export function CampaignChrome({ image, width = 800, housing, heated = false }: {
    image: string; width?: number; housing?: string; heated?: boolean;
}) {
    const id = useId(), paint = (name: string) => `url(#${id}-${name})`;
    const fillWidth = image === 'spldbr.shp' ? width : width - 344;
    return <>
        <defs>
            {housing && <>
                <filter id={`${id}-heated-metal`} filterUnits="userSpaceOnUse"
                    x="381.41" y="426.2" width="1011.18" height="50.62" colorInterpolationFilters="sRGB">
                    <feColorMatrix type="matrix" values=".2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0"/>
                    <feComponentTransfer>
                        <feFuncR type="linear" slope=".08" intercept=".92"/>
                        <feFuncG type="gamma" amplitude="1" exponent=".35" offset="0"/>
                        <feFuncB type="gamma" amplitude=".7" exponent="1.7" offset="0"/>
                    </feComponentTransfer>
                </filter>
                <clipPath id={`${id}-cylinder`} clipPathUnits="userSpaceOnUse">
                    <path d="M390 427.5H1384Q1391 427.5 1391 435V468Q1391 476 1384 476H390Q383 476 383 468V435Q383 427.5 390 427.5Z"/>
                </clipPath>
            </>}
            <linearGradient id={`${id}-steel`} x2="0" y2="1">
                <stop stopColor="#282a2d"/><stop offset=".1" stopColor="#f6f7f8"/>
                <stop offset=".23" stopColor="#aeb3bb"/><stop offset=".52" stopColor="#5f6570"/>
                <stop offset=".8" stopColor="#969da8"/><stop offset="1" stopColor="#202126"/>
            </linearGradient>
            <linearGradient id={`${id}-sleeve`} x2="0" y2="1">
                <stop stopColor="#080a0c"/><stop offset=".19" stopColor="#737e8b"/>
                <stop offset=".36" stopColor="#3b444e"/><stop offset=".56" stopColor="#12161b"/>
                <stop offset="1" stopColor="#020203"/>
            </linearGradient>
            <linearGradient id={`${id}-glow`} x2="0" y2="1">
                <stop stopColor="#e96600"/><stop offset=".1" stopColor="#ffe765"/>
                <stop offset=".34" stopColor="#ffff77"/><stop offset=".51" stopColor="#ffdc00"/>
                <stop offset=".77" stopColor="#ff5900"/><stop offset="1" stopColor="#e10000"/>
            </linearGradient>
            <pattern id={`${id}-ribs`} width="3" height="32" patternUnits="userSpaceOnUse">
                <rect width="3" height="32" fill={paint('sleeve')}/>
                <path d="M.5 3V29" stroke="#bbc0c8" opacity=".27" strokeWidth=".6"/>
                <path d="M2 4V30" stroke="#000" opacity=".9" strokeWidth=".7"/>
            </pattern>
            <pattern id={`${id}-segments`} width="23" height="24" patternUnits="userSpaceOnUse">
                <rect x=".6" y=".4" width="21.8" height="23.2" rx="2" fill={paint('glow')} stroke="#ffc12c" strokeWidth=".55"/>
                <path d="M2 3H21" stroke="#ffffcc" strokeWidth=".7" opacity=".85"/>
                <path d="M22 3V22" stroke="#b52b00" strokeWidth=".7"/>
            </pattern>
            <pattern id={`${id}-empty`} width="23" height="24" patternUnits="userSpaceOnUse">
                <rect x=".5" y=".4" width="22" height="23.2" rx="2" fill={paint('sleeve')} stroke="#010203"/>
                <path d="M2 5H21" stroke="#bcc5d3" strokeWidth=".6" opacity=".5"/>
            </pattern>
        </defs>
        {image === 'ttlbr800.shp' ? <>
            <rect x="1" y="1" width={width - 2} height="38" rx="5" fill={paint('steel')} stroke="#1b1d20"/>
            <rect x="6" y="6" width={width - 12} height="29" rx="1" fill="#030404" stroke="#44474c"/>
            <path d={`M7 4H${width - 7}`} stroke="#f2f4fa" strokeWidth=".7"/>
        </> : image === 'spldbrl.shp' && housing ? <g data-loading-metal={heated ? undefined : 'retail-reference-r2'}
            data-loading-fill={heated ? 'shared-cylinder-r4' : undefined}>
            {/* Three slices keep the sculpted metal caps and ribbed grips at their original size. */}
            {[{ x: 0, width: 172, start: 0, sourceWidth: 381.41 },
                { x: 172, width: width - 344, start: 381.41, sourceWidth: 1011.18 },
                { x: width - 172, width: 172, start: 1392.59, sourceWidth: 381.41 }].filter(slice => !heated || slice.start === 381.41).map(slice =>
                <svg key={slice.x} x={slice.x} y={-12.35} width={slice.width} height="52.35"
                    viewBox={`${slice.start} 385 ${slice.sourceWidth} 106`} preserveAspectRatio="none" overflow="hidden">
                    {!heated && <image href={housing} width="1774" height="887"/>}
                    {heated && <g clipPath={`url(#${id}-cylinder)`}>
                        <image href={housing} width="1774" height="887" filter={`url(#${id}-heated-metal)`}/>
                    </g>}
                </svg>)}
        </g> : image === 'spldbr.shp' && housing ? <g data-loading-fill="shared-cylinder-r3">
            {/* A red floor avoids black pinholes; unsaturated highlights retain the housing's left-to-right relief. */}
            <svg width={fillWidth} height="25" viewBox="381.41 426.2 1011.18 50.62" preserveAspectRatio="none" overflow="hidden">
                <image href={housing} width="1774" height="887" filter={`url(#${id}-heated-metal)`}/>
            </svg>
        </g> : image === 'spldbrl.shp' ? <>
            <path d={`M20 2C-3 -4 -3 40 12 36M${width - 20} 2C${width + 3} -4 ${width + 3} 40 ${width - 12} 36`}
                fill="none" stroke="#f25358" strokeWidth="1.1"/>
            <path d={`M24 3H${width - 24}M24 38H${width - 24}`} stroke="#6d2028" strokeWidth="1"/>
            <rect x="62" y="5" width={width - 124} height="30" rx="9" fill={paint('ribs')} stroke="#141820"/>
            {[false, true].map(mirror => <g key={String(mirror)} transform={mirror ? `translate(${width} 0) scale(-1 1)` : undefined}>
                <path d="M12 4L61 9V32L12 36L8 30V10Z" fill={paint('steel')} stroke="#353840"/>
                <path d="M14 7L57 11L47 15H28Z" fill="#e5e7e9" opacity=".83"/>
                <path d="M14 9L28 15L21 28L12 33Z" fill="#626a75"/>
                <path d="M27 16L47 15L43 28H25Z" fill="#9ca3ab" opacity=".6"/>
                <path d="M154 9L174 7V33L154 32L151 27V14Z" fill={paint('steel')} stroke="#31343b"/>
                <path d="M156 11H171" stroke="#f4f6fb" strokeWidth="1"/>
            </g>)}
            <rect x="172" y="8" width={fillWidth} height="25" rx="5" fill={paint('empty')} stroke="#060405"/>
            <path d={`M176 10H${width - 176}`} stroke="#b6becd" strokeWidth=".55" opacity=".65"/>
            <path d={`M176 35H${width - 176}`} stroke="#602931" strokeWidth="1.1"/>
        </> : <>
            <rect x=".5" y=".5" width={fillWidth - 1} height="24" rx="3" fill={paint('glow')} stroke="#df7900"/>
            <rect x="1" y=".5" width={fillWidth - 2} height="24" rx="3" fill={paint('segments')}/>
            <path d={`M3 3H${fillWidth - 3}`} stroke="#ffffb5" strokeWidth=".6" opacity=".7"/>
        </>}
    </>;
}

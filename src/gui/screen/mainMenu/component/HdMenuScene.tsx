import React, { useState } from 'react';
import { OriginalMenuFootage } from './OriginalMenuFootage';

/** A dark retail-style radar with a moving light sector and a stationary logo. */
export function HdMenuScene({ videoSrc, playbackTime }: { videoSrc?: string; playbackTime?: { current: number } }) {
    const [movieReady, setMovieReady] = useState(false);
    return <div className="hd-menu-scene" data-hd-menu-animation="radar" data-radar-footage={movieReady ? 'retail' : 'fallback'}>
        <svg className="hd-menu-motion" viewBox="0 0 1672 941" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
                <filter id="menu-dark-base" colorInterpolationFilters="sRGB">
                    <feComponentTransfer>
                        <feFuncR type="linear" slope=".27" intercept="-.025"/>
                        <feFuncG type="linear" slope=".2" intercept="-.02"/>
                        <feFuncB type="linear" slope=".2" intercept="-.02"/>
                    </feComponentTransfer>
                </filter>
                <filter id="menu-beam-edge"><feGaussianBlur stdDeviation="8" /></filter>
                <radialGradient id="menu-beam-fade" gradientUnits="userSpaceOnUse" cx="836" cy="438" r="1200">
                    <stop stopColor="black"/><stop offset=".2" stopColor="white"/>
                    <stop offset=".85" stopColor="white"/><stop offset="1" stopColor="black"/>
                </radialGradient>
                <mask id="menu-scan-content" x="0" y="0" width="1672" height="941" maskUnits="userSpaceOnUse">
                    <g className="hd-menu-sweep" filter="url(#menu-beam-edge)">
                        {Array.from({ length: 60 }, (_, i) => {
                            const a = (170 - i * 2) * Math.PI / 180, b = (167.5 - i * 2) * Math.PI / 180;
                            return <path key={i} fill="white" opacity={(1 - i / 60) ** 2}
                                d={`M836 438 L${836 + 1200 * Math.cos(a)} ${438 + 1200 * Math.sin(a)}
                                    L${836 + 1200 * Math.cos(b)} ${438 + 1200 * Math.sin(b)} Z`}/>;
                        })}
                    </g>
                </mask>
                <mask id="menu-logo-foreground" style={{ maskType: 'alpha' }}
                    maskUnits="userSpaceOnUse" x="0" y="0" width="1672" height="941">
                    <image href="/res/presentation/menu-logo-mask-r2.png" width="1672" height="941"/>
                </mask>
            </defs>
            <image href="/res/presentation/menu-radar-neutral-r2.png" width="1672" height="941"
                filter="url(#menu-dark-base)"/>
            <image href="/res/presentation/menu-radar-lit-r2.png" width="1672" height="941"
                opacity={movieReady ? 0 : .88} mask="url(#menu-scan-content)"/>
            {videoSrc && <foreignObject x="0" y="0" width="1672" height="941">
                <OriginalMenuFootage src={videoSrc} onReady={setMovieReady} playbackTime={playbackTime}/>
            </foreignObject>}
            <image href="/res/presentation/menu-radar-neutral-r2.png" width="1672" height="941"
                mask="url(#menu-logo-foreground)"/>
        </svg>
    </div>;
}

import React, { useEffect, useState } from 'react';
import { uiArt } from '@/gui/hd/UiArt';
import { activeEdition } from '@/editions/activeEdition';
import { SideType } from '@/game/SideType';
export function scoreTheme(edition: 'ra2' | 'yr', side: SideType): string {
    const faction = side === SideType.GDI ? 'allied' : side === SideType.ThirdSide && edition === 'yr' ? 'yuri' : 'soviet';
    return `${edition}-${faction}`;
}
export function ScoreScene({ side, original, children }: { side: SideType; original: string; children: React.ReactNode }) {
    const [, refresh] = useState(0);
    useEffect(() => uiArt.subscribe(() => refresh(value => value + 1)), []);
    const theme = scoreTheme(activeEdition, side), faction = theme.split('-')[1];
    const image = uiArt.enabled ? `/res/presentation/score-${faction}-hd.png` : original;
    return <div className="score-scene" data-score-theme={theme} data-score-hd={uiArt.enabled}>
        <div className="score-background" style={{ backgroundImage: `url("${image}")`,
            backgroundSize: uiArt.enabled ? 'cover' : '100% 100%',
            filter: uiArt.enabled && theme === 'yr-soviet' ? 'brightness(.62)' : undefined }} />
        {children}
    </div>;
}

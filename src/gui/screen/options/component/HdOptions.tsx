import React from 'react';
import { Select } from '@/gui/component/Select';
import { Option } from '@/gui/component/Option';
import type { GraphicsOptions } from '../GraphicsOptions';

export function HdOptions({ graphics, inGame, strings }: {
    graphics: GraphicsOptions; inGame: boolean; strings: { get(key: string): string };
}) {
    return <>
        <div className="item" data-hd-family="all" data-hd-density="atlas">
            <span className="label">{strings.get('HD:Graphics')}</span>
            <Select initialValue={graphics.hdEnabled.value ? String(graphics.hdDensity.value) : 'original'}
                onSelect={value => {
                    if (value !== 'original') graphics.hdDensity.value = value === '2' ? 2 : 4;
                    graphics.hdEnabled.value = value !== 'original';
                }}>
                <Option value="original" label={strings.get('HD:OriginalArtwork')}/>
                <Option value="2" label="2×"/>
                <Option value="4" label="4×"/>
            </Select>
        </div>
        <p style={{ maxWidth: 440, fontSize: '0.85em' }}>
            {strings.get('HD:GraphicsDescription')}
            {inGame && ' ' + strings.get('HD:GraphicsNextMatch')}
        </p>
    </>;
}

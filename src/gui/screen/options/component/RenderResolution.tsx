import React, { useEffect, useState } from 'react';
import { Select } from '@/gui/component/Select';
import { Option } from '@/gui/component/Option';
import { BoxedVar } from '@/util/BoxedVar';
import { parseRenderResolution, type RenderResolution } from '@/engine/gfx/RenderResolution';

export const RenderResolutionSelect: React.FC<{ value: BoxedVar<RenderResolution> }> = ({ value }) => {
    const [selected, setSelected] = useState(value.value);
    useEffect(() => {
        value.onChange.subscribe(setSelected);
        return () => value.onChange.unsubscribe(setSelected);
    }, [value]);
    const [output, setOutput] = useState('');
    useEffect(() => {
        const update = () => {
            const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-render-output]');
            if (!canvas) return;
            const metrics = JSON.parse(canvas.dataset.renderOutput!);
            setOutput(`${metrics.effective.join(' x ')}${metrics.caps.length
                ? ` (limited; requested ${metrics.requested.join(' x ')})` : ''}`);
        };
        update();
        window.addEventListener('ra2-render-output', update);
        return () => window.removeEventListener('ra2-render-output', update);
    }, []);
    return <div><Select className="render-resolution-select" initialValue={selected}
        tooltip="Higher resolution improves detail without changing unit size. The image keeps its aspect ratio."
        onSelect={next => { value.value = parseRenderResolution(next); }}>
        <Option value="native" label="Auto (window density)" />
        <Option value="original" label="Window size (1x)" />
        <Option value="720p" label="720p (720 high)" />
        <Option value="1080p" label="1080p (1080 high)" />
        <Option value="1440p" label="1440p (1440 high)" />
        <Option value="4k" label="High (2160 high)" />
    </Select><div className="render-output" aria-live="polite">Output: {output}</div>
    <div className="render-resolution-hint" style={{ maxWidth: 260, fontSize: 14, whiteSpace: 'normal' }}>
        Changes image detail, not window size or zoom. Auto follows your display.
    </div></div>;
};

import React, { useEffect, useState } from 'react';
import type { GraphicsOptions } from '../GraphicsOptions';

type DisplayState = { id: string; choices: { id: string; label: string }[] };
export function DisplayResolution({ graphics, fullScreen }: { graphics: GraphicsOptions; fullScreen: any }) {
    const desktop = (window as any).desktopDisplay;
    const [state, setState] = useState<DisplayState>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        let mounted = true;
        const refresh = () => desktop?.get().then((value: DisplayState) => { if (mounted) setState(value); }).catch(() => {});
        refresh();
        window.addEventListener('resize', refresh);
        return () => { mounted = false; window.removeEventListener('resize', refresh); };
    }, []);
    if (!desktop) return <button onClick={() => fullScreen.toggle?.()}>Toggle full screen</button>;
    return <span>
        <select aria-label="Display resolution" value={state?.id ?? ''} disabled={!state || busy}
            onChange={async event => {
                const id = event.target.value;
                setBusy(true); setError('');
                try { setState(await desktop.set(id)); graphics.renderResolution.value = 'native'; }
                catch (e) { setError((e as Error).message); }
                finally { setBusy(false); }
            }}>
            {state?.choices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        {error && <span role="alert">{error}</span>}
    </span>;
}

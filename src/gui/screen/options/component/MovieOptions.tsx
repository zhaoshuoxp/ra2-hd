import React, { useState } from 'react';
import { hdMoviesEnabled, setHdMoviesEnabled } from '../../../../offline/hdMovies';

export function MovieOptions({ strings }: { strings: { get(key: string): string } }) {
    const [enabled, setEnabled] = useState(() => hdMoviesEnabled());
    return <div className="item" data-hd-movie-options>
        <label>
            <span className="label">{strings.get('HD:Movies')}</span>
            <input type="checkbox" checked={enabled} onChange={event => {
                setHdMoviesEnabled(event.target.checked); setEnabled(event.target.checked);
            }}/>
            <span className="info" title={strings.get('HD:MoviesDescription')}>ⓘ</span>
        </label>
    </div>;
}

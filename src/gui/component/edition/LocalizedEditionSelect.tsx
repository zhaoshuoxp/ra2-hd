import { useEffect, useState } from 'react';
import { EditionSelect } from './EditionSelect';
import { preferredLanguage, saveLanguage, type InterfaceLanguage } from '@/gui/Language';
import type { GameEdition } from '@/editions/GameEdition';
import { releaseVersion } from '@/version';

export function LocalizedEditionSelect({ onSelect }: { onSelect(edition: GameEdition): void }) {
    const [language, setLanguage] = useState<InterfaceLanguage>(() => preferredLanguage() ?? 'zh-CN');
    const [labels, setLabels] = useState<Record<string, string>>({});
    useEffect(() => {
        const abort = new AbortController();
        document.documentElement.lang = language;
        void fetch(`/res/locale/${language}.json`, { signal: abort.signal }).then(response => {
            if (!response.ok) throw Error('Edition translation missing');
            return response.json();
        }).then(data => setLabels(Object.fromEntries(Object.entries(data)
            .map(([key, value]) => [key.toLowerCase(), String(value)]))))
            .catch(error => { if (error.name !== 'AbortError') console.error(error); });
        return () => abort.abort();
    }, [language]);
    return <EditionSelect covers={{ ra2: '/res/editions/ra2.jpg', yr: '/res/editions/yr.jpg' }} onSelect={onSelect}
        heading={labels['hd:chooseedition'] ?? ''}
        labels={{ ra2: labels['hd:editionra2'] ?? 'Red Alert 2', yr: labels['hd:editionyr'] ?? "Yuri's Revenge" }}
        descriptions={{ ra2: labels['hd:originalgame'] ?? '', yr: labels['hd:expansion'] ?? '' }}
        notice={<footer className="edition-select__notice" data-edition-notice>
            <p data-edition-disclaimer>{labels['ts:disclaimer']}</p>
            <p data-edition-copyright>{labels['hd:startupcopyright']?.replace('%s', `v${releaseVersion}`)}</p>
        </footer>}
        languageControl={<select data-edition-language aria-label={labels['hd:language'] ?? 'Language'} value={language}
            style={{ marginTop: 16, padding: '6px 14px', font: 'inherit', fontSize: 17, color: '#f4ecd7', background: '#271614', border: '1px solid #806f4b' }}
            onChange={event => {
                const value = event.target.value as InterfaceLanguage;
                if (saveLanguage(value)) setLanguage(value);
            }}>
            <option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="en-US">English</option>
        </select>}/>;
}

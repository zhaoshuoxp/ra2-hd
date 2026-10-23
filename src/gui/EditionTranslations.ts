import type { GameEdition } from '../editions/GameEdition';
import type { InterfaceLanguage } from './Language';

export interface EditionTranslations {
    schema: 'edition-retail-text-v1';
    edition: GameEdition;
    language: InterfaceLanguage;
    retailSource: { name: string; archive: string; sha256: string; bytes: number };
    labels: Record<string, string>;
}

export async function loadEditionTranslations(edition: GameEdition, language: InterfaceLanguage,
    version: string): Promise<EditionTranslations> {
    const response = await fetch(`/res/locale/retail-${edition}-${language}.json?v=${version}`);
    if (!response.ok) throw Error(`Game translation missing: ${edition}/${language}`);
    const data: EditionTranslations = await response.json();
    if (data.schema !== 'edition-retail-text-v1' || data.edition !== edition || data.language !== language
        || !/^[a-f0-9]{64}$/.test(data.retailSource?.sha256) || !Object.keys(data.labels ?? {}).length) {
        throw Error(`Invalid game translation: ${edition}/${language}`);
    }
    return data;
}

export async function validateTranslationSource(translations: EditionTranslations, bytes: Uint8Array): Promise<void> {
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as any))]
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== translations.retailSource.sha256 || bytes.length !== translations.retailSource.bytes) {
        throw Error(`Translation source identity mismatch: ${translations.edition}/${translations.language}`);
    }
}

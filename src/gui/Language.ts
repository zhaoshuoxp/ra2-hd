export const interfaceLanguages = ['zh-CN', 'zh-TW', 'en-US'] as const;
export type InterfaceLanguage = typeof interfaceLanguages[number];
const LANGUAGE_KEY = 'ra2hd.interfaceLanguage';
export function preferredLanguage(storage: Pick<Storage, 'getItem'> = localStorage): InterfaceLanguage | undefined {
    try {
        const value = storage.getItem(LANGUAGE_KEY);
        return interfaceLanguages.includes(value as InterfaceLanguage) ? value as InterfaceLanguage : undefined;
    } catch { return undefined; }
}
export function saveLanguage(language: InterfaceLanguage): boolean {
    try { localStorage.setItem(LANGUAGE_KEY, language); return true; }
    catch { return false; }
}
export function currentLanguage(): InterfaceLanguage {
    const value = document.documentElement.lang;
    return interfaceLanguages.includes(value as InterfaceLanguage) ? value as InterfaceLanguage : 'zh-CN';
}
/** English rule names preserve the retail identity when the imported CSF is localized. */
export function englishLabel(key: string): string {
    return key.replace(/^[^:]+:/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
}

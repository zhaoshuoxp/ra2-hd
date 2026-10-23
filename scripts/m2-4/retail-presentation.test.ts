import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Strings } from '../../src/data/Strings';
import { resolveHoverTooltipText, resolveSidebarItemTooltipText } from '../../src/gui/screen/game/TooltipTextResolver';
import { normalizeSkirmishPlayerName } from '../../src/gui/screen/mainMenu/lobby/component/SkirmishPlayerName';
import { validateTranslationSource, type EditionTranslations } from '../../src/gui/EditionTranslations';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { CsfFile } from '../../src/data/CsfFile';
import { originalSkirmishEntries } from '../../src/offline/officialSkirmish';
import { GameResultPopup, GameResultType } from '../../src/gui/screen/game/component/GameResultPopup';
import bannerFamily from '../../src/gui/hd/resultBannerSources.json';

const languages = ['zh-CN', 'zh-TW', 'en-US'] as const;
const read = (name: string) => JSON.parse(readFileSync(`public/res/locale/${name}.json`, 'utf8'));
const archives = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(archives.map(name => [name,
    readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));

for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    const bytes = resolveMember(tree, edition === 'yr' ? 'ra2md.csf' : 'ra2.csf').file.getBytes();
    const csf = new CsfFile(resolveMember(tree, edition === 'yr' ? 'ra2md.csf' : 'ra2.csf').file);
    for (const language of languages) test(`${edition}/${language}: complete source-matched game, map and UI text`, async () => {
        const text: EditionTranslations = read(`retail-${edition}-${language}`), ui = read(language);
        await validateTranslationSource(text, bytes);
        expect(Object.keys(text.labels).sort()).toEqual(Object.keys(csf.data).map(key => key.toLowerCase()).sort());
        const strings = new Strings(text.labels);
        strings.fromJson(ui);
        for (const map of originalSkirmishEntries(tree, edition)) {
            expect(strings.has(map.uiName)).toBe(true);
            expect(strings.get(map.uiName)).not.toMatch(/^NAME:|^DESC:|^id-/i);
        }
        expect(new Set(Object.keys(ui).map(key => key.toLowerCase())))
            .toEqual(new Set(Object.keys(read('zh-CN')).map(key => key.toLowerCase())));
        for (const key of ['GUI:SkirmishGame', 'GUI:Options', 'TXT_VICTORIOUS', 'STT:SkirmishEditPlayer']) {
            expect(strings.has(key)).toBe(true);
        }
        const hover = resolveHoverTooltipText({ entity: { getUiName: () => 'Name:GACNST' } }, strings);
        const sidebar = resolveSidebarItemTooltipText({ target: { rules: { uiName: 'Name:GACNST', cost: 3000 } } }, {}, strings);
        expect(sidebar).toBe(`${hover}\n$3000`);
        if (language === 'en-US') {
            expect(hover).toBe('Construction Yard');
            expect(Object.values(text.labels).join('')).not.toMatch(/\p{Script=Han}/u);
            expect(Object.values(ui).join('')).not.toMatch(/\p{Script=Han}/u);
        } else expect(hover).toBe(language === 'zh-CN' ? '建造场' : '建造場');
        const bad = bytes.slice(); bad[30] ^= 1;
        await expect(validateTranslationSource(text, bad)).rejects.toThrow('identity mismatch');
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(text.retailSource.sha256);
    });
}

test('player names support Unicode, empty drafts and safe native player identities', () => {
    expect(normalizeSkirmishPlayerName('  Commander  ')).toBe('Commander');
    expect(normalizeSkirmishPlayerName('指挥官')).toBe('指挥官');
    expect(normalizeSkirmishPlayerName('e\u0301')).toBe('é');
    expect([...normalizeSkirmishPlayerName('😀'.repeat(40))].length).toBe(32);
    expect(normalizeSkirmishPlayerName('\n\u200b\t', 'Commander')).toBe('Commander');
    expect(normalizeSkirmishPlayerName('@@AI2@@', 'Commander')).toBe('Commander');
    expect(normalizeSkirmishPlayerName('A\nB')).toBe('AB');
});

test('four distinct localized result slots retain two complete HD background states and native placement', () => {
    for (const language of languages) {
        const strings = new Strings(read(`retail-yr-${language}`).labels);
        strings.fromJson(read(language));
        const texts = [];
        for (const type of [GameResultType.SpVictory, GameResultType.SpDefeat, GameResultType.MpVictory, GameResultType.MpDefeat]) {
            const popup = new GameResultPopup({ viewport: { x: 0, y: 0, width: 1280, height: 928 }, type, strings, rasterScale: 4 });
            const props = popup.defineChildren().props.props;
            expect(props.mission).toBe(type < 2);
            expect(props.victory).toBe(type % 2 === 0);
            texts.push(props.text);
        }
        expect(new Set(texts).size).toBe(4);
    }
    expect(bannerFamily.assets.length).toBe(4);
    for (const outcome of ['victory', 'defeat']) for (const density of [2, 4]) {
        const asset = bannerFamily.assets.find(asset => asset.outcome === outcome && asset.density === density)!;
        const bytes = readFileSync(`public/res/ui/${asset.file}`);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
        expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([436 * density, 112 * density]);
    }
});

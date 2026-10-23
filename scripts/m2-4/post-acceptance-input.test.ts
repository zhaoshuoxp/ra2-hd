import { expect, test } from 'bun:test';
import { IniFile } from '../../src/data/IniFile';
import { KeyBinds } from '../../src/gui/screen/game/worldInteraction/keyboard/KeyBinds';
import { KeyCommandType } from '../../src/gui/screen/game/worldInteraction/keyboard/KeyCommandType';

const key = (keyCode: number) => ({ keyCode, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }) as KeyboardEvent;
test('A migrates from the retail Alliance default to Attack Move without mutating the source INI', async () => {
    const source = new IniFile('[Hotkey]\nToggleAlliance=65\nStopObject=83\n');
    const before = source.toString(), binds = new KeyBinds(undefined, 'keyboard.ini', source);
    await binds.load();
    expect(binds.getCommandType(key(65))).toBe(KeyCommandType.AttackMove);
    expect(binds.getCommandType(key(83))).toBe(KeyCommandType.StopObject);
    expect(binds.getHotKey(KeyCommandType.ToggleAlliance)).toBeUndefined();
    expect(source.toString()).toBe(before);
});

test('saved custom A and explicit Attack Move bindings, including unbinding, survive migration', async () => {
    for (const [ini, expectedA, expectedAttack] of [
        ['StopObject=65', KeyCommandType.StopObject, undefined],
        ['ToggleAlliance=65\nAttackMove=71', KeyCommandType.ToggleAlliance, 71],
        ['ToggleAlliance=65\nAttackMove=0', KeyCommandType.ToggleAlliance, undefined],
    ] as const) {
        const binds = new KeyBinds(undefined, 'keyboard.ini', new IniFile('[Hotkey]\n' + ini + '\n'));
        await binds.load();
        expect(binds.getCommandType(key(65))).toBe(expectedA);
        expect(binds.getHotKey(KeyCommandType.AttackMove)?.keyCode).toBe(expectedAttack);
    }
});

test('a saved disabled Attack Move stays disabled after reloading', async () => {
    let saved: IniFile | undefined;
    const binds = new KeyBinds(undefined, 'keyboard.ini', new IniFile('[Hotkey]\nToggleAlliance=65\n'));
    await binds.load(); binds.changeHotKey(KeyCommandType.AttackMove, 0);
    binds.saveIni = async ini => { saved = ini; };
    await binds.save();
    expect(saved!.getSection('Hotkey')!.getNumber('AttackMove')).toBe(0);
    const reloaded = new KeyBinds(undefined, 'keyboard.ini', saved);
    await reloaded.load();
    expect(reloaded.getHotKey(KeyCommandType.AttackMove)).toBeUndefined();
});

import { expect, test } from 'bun:test';
import { Eva } from '../../src/engine/sound/Eva';
import { EventDispatcher } from '../../src/util/event';
import { SoundHandler } from '../../src/gui/screen/game/SoundHandler';
import { GameEventBus } from '../../src/game/GameEventBus';
import { PlayerDefeatedEvent } from '../../src/game/event/PlayerDefeatedEvent';
import { MessageList } from '../../src/gui/screen/game/component/hud/viewmodel/MessageList';
import { AiDifficulty } from '../../src/game/gameopts/GameOpts';

test('resigned AI and defeated humans each announce once, with player color and identity', () => {
    const events = new GameEventBus(), plays: any[] = [];
    const player = { isObserver: false }, other = { name: 'Human', color: { asHexString: () => '#f00' } };
    const bot = { name: '@@AI2@@', isAi: true, resigned: true, aiDifficulty: AiDifficulty.Normal, color: { asHexString: () => '#00f' } };
    const messages = new MessageList(10, 10, player);
    const strings = { get: (key: string, value?: string) => value ? `${key}: ${value}` :
        key === 'GUI:AINormal' ? 'Medium AI' : key };
    const handler = new SoundHandler({ getPlayerNumber: () => 2 }, {}, { play: (...args) => plays.push(args) },
        {}, events, messages, strings, player);
    handler.init();
    events.dispatch(new PlayerDefeatedEvent(bot));
    events.dispatch(new PlayerDefeatedEvent(other));
    events.dispatch(new PlayerDefeatedEvent(player));
    expect(messages.getAll().map(m => [m.text, m.color])).toEqual([
        ['TXT_PLAYER_DEFEATED: Medium AI (3)', '#00f'], ['TXT_PLAYER_DEFEATED: Human', '#f00'],
    ]);
    expect(plays).toEqual([['EVA_PlayerDefeated', true], ['EVA_PlayerDefeated', true]]);
    handler.dispose();
    events.dispatch(new PlayerDefeatedEvent(bot));
    expect(plays).toHaveLength(2);
});

test('all queued eliminations survive busy EVA, including multiple defeats within five seconds', () => {
    const onFrame = new EventDispatcher(), sounds: any[] = [];
    const specs = new Map(['busy', 'defeat', 'ordinary'].map(name => [name, { sound: name, priority: 5 }]));
    const eva = new Eva({ getSpec: name => specs.get(name) }, {
        getWavFile: name => name,
        audioSystem: { playWavFile: file => {
            const handle = { file, playing: true, isPlaying() { return this.playing; }, stop() { this.playing = false; } };
            sounds.push(handle); return handle;
        } },
    }, { onFrame });
    eva.init();
    const frame = (time: number) => onFrame.dispatch(undefined, time);
    eva.play('busy'); frame(1);
    for (let i = 0; i < 4; i++) eva.play('defeat', true);
    eva.play('ordinary'); frame(100);
    for (let i = 0; i < 4; i++) {
        sounds.at(-1).playing = false; frame(200 + i * 300); frame(250 + i * 300);
    }
    expect(sounds.map(s => s.file)).toEqual(['busy', 'defeat', 'defeat', 'defeat', 'defeat']);
    expect((eva as any).lastEvaEventBySpec.size).toBe(1);
    eva.dispose();
    expect(sounds.at(-1).playing).toBe(false);
    frame(10000); expect(sounds).toHaveLength(5);
});

test('native queued notices retain their cooldown while explicit queued events remain distinct', () => {
    const onFrame = new EventDispatcher(), plays: string[] = [];
    const spec = { sound: 'native-queued', priority: 1, queue: true };
    const eva = new Eva({ getSpec: () => spec }, { getWavFile: name => name,
        audioSystem: { playWavFile: name => { plays.push(name); return { isPlaying: () => false, stop() {} }; } },
    }, { onFrame });
    eva.init(); eva.play('notice'); onFrame.dispatch(undefined, 1);
    eva.play('notice'); onFrame.dispatch(undefined, 2);
    expect(plays).toHaveLength(1);
    eva.play('notice', true); onFrame.dispatch(undefined, 3);
    expect(plays).toHaveLength(2);
    eva.play('notice'); onFrame.dispatch(undefined, 5001);
    expect(plays).toHaveLength(3);
    eva.dispose();
});

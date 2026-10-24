import { expect, test } from 'bun:test';
import { SoundHandler } from '../../src/gui/screen/game/SoundHandler';
import { OrderFeedbackType } from '../../src/game/order/OrderFeedbackType';
import { ChannelType } from '../../src/engine/sound/ChannelType';

test('numeric order feedback keeps each unit voice and throttles repeated acknowledgements', () => {
    const player = {}, calls: any[] = [];
    const handler: any = new SoundHandler({}, {}, {}, { play: (...args: any[]) => calls.push(args) }, {}, {}, {}, player);
    for (const prefix of ['GI', 'Conscript', 'Initiate']) {
        const unit = { owner: player, rules: { voiceSelect: prefix + 'Select', voiceMove: prefix + 'Move',
            voiceAttack: prefix + 'AttackCommand', voiceSpecialAttack: prefix + 'SpecialAttack' } };
        handler.lastFeedbackTime = 0;
        handler.handleSelectionChangeEvent({ selection: [unit] });
        expect(calls.at(-1)).toEqual([prefix + 'Select', ChannelType.Effect]);
        for (const [feedback, group] of [[OrderFeedbackType.Move, 'Move'], [OrderFeedbackType.Attack, 'AttackCommand'],
            [OrderFeedbackType.Capture, 'SpecialAttack'], [OrderFeedbackType.SpecialAttack, 'SpecialAttack']] as const) {
            handler.lastFeedbackTime = 0;
            handler.handleOrderPushed(unit, 0, feedback);
            expect(calls.at(-1)).toEqual([prefix + group, ChannelType.Effect]);
            const count = calls.length;
            handler.handleOrderPushed(unit, 0, feedback);
            expect(calls).toHaveLength(count);
        }
    }
    const count = calls.length;
    handler.lastFeedbackTime = 0;
    handler.handleOrderPushed({ rules: {} }, 0, OrderFeedbackType.Move);
    handler.handleSelectionChangeEvent({ selection: [{ owner: {}, rules: { voiceSelect: 'EnemySelect' } }] });
    expect(calls).toHaveLength(count);
});

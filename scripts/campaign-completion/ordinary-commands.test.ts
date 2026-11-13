import { expect, test } from 'bun:test';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

test('the verification helper emits the ordinary untargeted group-deploy protocol and retains targeted single deployment', async () => {
    const before = globalThis.window, calls: any[] = [];
    const units = [1, 2].map(id => ({ id, name: 'E1', isSpawned: true, isUnit: () => true }));
    const player = { getOwnedObjects: () => units };
    (globalThis as any).window = { __ra2debug: { game: { campaign: { inputLocked: false }, localPlayer: player },
        actionsApi: { orderUnits: (...args: any[]) => calls.push(args) } } };
    try {
        const page = { evaluate: async (callback: any, parameters: any) => callback(parameters) };
        const commands = new OrdinaryCampaignCommands(page, { commands: [] });
        await commands.order(['E1'], 10);
        await commands.order([1], 9);
        expect(calls).toEqual([[[1, 2], 10], [[1], 9, 1]]);
    } finally {
        if (before === undefined) delete (globalThis as any).window;
        else globalThis.window = before;
    }
});

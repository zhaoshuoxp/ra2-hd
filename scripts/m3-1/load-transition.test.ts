import { expect, test } from 'bun:test';
import { MainMenuController } from '../../src/gui/screen/mainMenu/MainMenuController';

function fixture() {
    const events: string[] = [], controller = new MainMenuController({});
    for (const [id, name] of [[0, 'home'], [1, 'load']] as const) controller.addScreen(id, {
        onEnter: () => { events.push(name + ':enter'); },
        onLeave: () => { events.push(name + ':leave'); },
        onStack: () => { events.push(name + ':stack'); },
        onUnstack: () => { events.push(name + ':unstack'); },
    });
    return { events, controller };
}

test('leaving the root menu closes the active page without replaying its suspended parents', async () => {
    const { events, controller } = fixture();
    await controller.pushScreen(0); await controller.pushScreen(1);
    await controller.close();
    expect(events).toEqual(['home:enter', 'home:stack', 'load:enter', 'load:leave']);
    expect(controller.getCurrentScreen()).toBeUndefined();
    await controller.close();
    expect(events).toHaveLength(4);
    await controller.pushScreen(0); await controller.popScreen();
    expect(controller.getCurrentScreen()).toBeUndefined();
    expect(events.at(-1)).toBe('home:leave');
});

test('the explicit Back action still resumes the parent page exactly once', async () => {
    const { events, controller } = fixture();
    await controller.pushScreen(0); await controller.pushScreen(1);
    await controller.leaveCurrentScreen();
    expect(controller.getCurrentScreenType()).toBe(0);
    expect(events).toEqual(['home:enter', 'home:stack', 'load:enter', 'load:leave', 'home:unstack']);
});

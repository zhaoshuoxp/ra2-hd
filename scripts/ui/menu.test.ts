import { test, expect } from 'bun:test';
import { HomeScreen } from '../../src/gui/screen/mainMenu/main/HomeScreen';
import { MainMenuScreenType } from '../../src/gui/screen/ScreenType';
import { Strings } from '../../src/data/Strings';
import { MainMenu } from '../../src/gui/screen/mainMenu/component/MainMenu';
import { validateUiManifest, UI_TEXTURE_BUDGET } from '../../src/gui/hd/UiArt';
const locale = await Bun.file('public/res/locale/zh-CN.json').json();
function home(desktop = false, localized = true) {
    let buttons: any[] = []; const routes: any[] = []; const messages: string[] = [];
    (globalThis as any).window = { desktopApp: desktop ? { quit: () => routes.push('quit') } : undefined };
    (globalThis as any).location = { href: 'ra2://game/?edition=yr', replace: (url: string) => routes.push(['reload', url]) };
    const screen = new HomeScreen(new Strings(localized ? locale : {}), { alert: async (message: string) => { messages.push(message); } } as any, 'test');
    screen.setController({ setSidebarButtons: (value: any[]) => buttons = value, showSidebarButtons() {},
        toggleMainVideo(value: boolean) { routes.push(['video',value]); }, showVersion() {},
        hideVersion() {}, async hideSidebarButtons() {},
        goToScreen: (route: any) => routes.push(['go',route]), pushScreen: (route: any) => routes.push(['push',route]) } as any);
    screen.onEnter();
    return { screen, buttons, routes, messages };
}
test('home routes preserve localized order, edition switching and inert placeholders', async () => {
    const { buttons, routes, screen } = home(true);
    expect(buttons.map(b=>b.label)).toEqual(['campaign','skirmish','lan','movies','options','edition','exit'].map(k=>locale['hd:menu'+k]));
    expect(buttons.map(b=>!!b.disabled)).toEqual([true,false,true,true,false,false,false]);
    for (const i of [0,2,3]) await buttons[i].onClick();
    expect(routes).toEqual([['video',true]]);
    await buttons[1].onClick(); await buttons[4].onClick(); await buttons[6].onClick();
    expect(routes.slice(1)).toEqual([['go',MainMenuScreenType.Skirmish],['push',MainMenuScreenType.Options],'quit']);
    await buttons[5].onClick();
    expect(routes.at(-1)).toEqual(['reload', 'ra2://game/']);
    await screen.onStack(); screen.onUnstack();
    expect(routes.at(-1)).toEqual(['video',true]);
});
test('browser exit reports tab closure honestly; missing locale falls back to English', async () => {
    const { buttons, messages, routes } = home(false, false);
    expect(buttons.map(b=>b.label)).toEqual(['Campaign','Skirmish','LAN','Movies','Options','Switch Game','Exit Game']);
    await buttons[6].onClick(); expect(messages[0]).toContain('close this tab'); expect(routes).toEqual([['video',true]]);
});
test('controller dispatch refuses disabled, collapsed and stale empty slots', () => {
    let clicks = 0;
    const receiver = { sidebarCollapsed: false, sidebarButtonConfigs: [{disabled:true,onClick:()=>clicks++},{onClick:()=>clicks++}] };
    for (const i of [0,8]) MainMenu.prototype.onSidebarButtonClick.call(receiver as any,i);
    expect(clicks).toBe(0);
    MainMenu.prototype.onSidebarButtonClick.call(receiver as any,1); expect(clicks).toBe(1);
    receiver.sidebarCollapsed = true;
    MainMenu.prototype.onSidebarButtonClick.call(receiver as any,1); expect(clicks).toBe(1);
});
test('UI manifests reject unsafe, oversized, duplicate and malformed asset groups', () => {
    const asset = {id:'giicon.shp',file:'giicon.png',sha256:'a'.repeat(64),width:240,height:192,logicalWidth:60,logicalHeight:48};
    const valid = {schemaVersion:1,revision:'review-v1',assets:[asset]};
    expect(validateUiManifest(valid)).toBe(valid); expect(UI_TEXTURE_BUDGET).toBe(16777216);
    for (const mutate of [a=>a.width=8192,a=>a.file='../outside.png',a=>a.sha256='bad',a=>a.height=0,a=>a.logicalWidth=1.2]) {
        const value=structuredClone(valid);mutate(value.assets[0]);expect(()=>validateUiManifest(value)).toThrow();
    }
    expect(()=>validateUiManifest({...valid,assets:[asset,asset]})).toThrow();
});

import * as THREE from 'three';
import { HtmlContainer } from '@/gui/HtmlContainer';
import { UiObject } from '@/gui/UiObject';
import { mountSkirmishSavePage, type SavePageHost, type SavePageOptions } from './SkirmishSaveDialog';

interface Controller {
    setMainComponent(component?: any): void;
    setSidebarButtons(buttons: any[]): void;
    showSidebarButtons(): void;
    hideSidebarButtons(): void | Promise<void>;
    leaveCurrentScreen(): Promise<void>;
    toggleMainVideo?(visible: boolean): void;
    setContentAreaExpanded?(expanded: boolean): void;
}
interface Params { rootController: any; options: SavePageOptions }
// Both entry points use their parent's existing page stack, frame and sidebar.
export class SkirmishSaveScreen {
    private controller!: Controller;
    private release?: () => void;
    public title: string;
    constructor(private strings: { get(key: string): string }, _jsxRenderer: any,
        private defaults?: Params) {
        this.title = strings.get('GUI:LoadMissionMenu');
    }
    setController(controller: Controller): void { this.controller = controller; }
    onEnter(params = this.defaults!): void {
        this.controller.toggleMainVideo?.(false);
        this.controller.setContentAreaExpanded?.(true);
        const host: SavePageHost = {
            setButtons: buttons => {
                this.controller.setSidebarButtons(buttons);
                this.controller.showSidebarButtons();
            },
            back: () => this.controller.leaveCurrentScreen(),
        };
        // Keep the live DOM when the HUD is rebuilt after a viewport change.
        // The screen owns the view's lifetime, including an open confirmation.
        const html = new HtmlContainer();
        html.setElement(document.createElement('div'));
        html.setSize('100%', '100%');
        this.release = mountSkirmishSavePage(html.getElement()!, this.strings, params.rootController, params.options, host);
        this.controller.setMainComponent(new UiObject(new THREE.Object3D(), html));
    }
    async onLeave(): Promise<void> {
        this.destroy();
        this.controller.setContentAreaExpanded?.(false);
        await this.controller.hideSidebarButtons();
    }
    destroy(): void {
        this.release?.(); this.release = undefined;
    }
}

import { jsx } from "../../../jsx/jsx";
import { registerMainMenuArt } from '@/gui/hd/UiControlArt';
import { UiObject } from "../../../UiObject";
import { UiObjectSprite } from "../../../UiObjectSprite";
import { HtmlContainer } from "../../../HtmlContainer";
import { MenuVideo } from "./MenuVideo";
import { MenuButton } from "../../../component/MenuButton";
import { EventDispatcher } from "../../../../util/event";
import { MenuSlotAnimationRunner, MenuButtonState } from "./MenuSlotAnimationRunner";
import { HtmlView } from "../../../jsx/HtmlView";
import { MenuMpSlotAnimRunner } from "./MenuMpSlotAnimRunner";
import { MenuMpSlotText } from "./MenuMpSlotText";
import { SidebarPreview } from "./SidebarPreview";
import { MenuTooltip } from "./MenuTooltip";
import { VersionString } from "./VersionString";
import { releaseVersion } from '@/version';
import * as THREE from 'three';
export interface Viewport {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface ButtonConfig {
    label: string;
    action?: string;
    tooltip?: string;
    disabled?: boolean;
    isBottom?: boolean;
    onClick?: () => void;
}
export interface SidebarMpContent {
    text: string;
    icon?: string;
    tooltip?: string;
}
export interface ImageMap {
    get(name: string): any;
}
export interface JsxRenderer {
    render(jsx: any): UiObject[];
}
export class MainMenu extends UiObject {
    private viewport: Viewport;
    private menuScale = 1;
    private mainBackground?: UiObjectSprite;
    private statusBackground?: UiObjectSprite;
    private images: ImageMap;
    private jsxRenderer: JsxRenderer;
    private videoSrc: string;
    private rootObjects: UiObject[] = [];
    private sidebarObjects: UiObject[] = [];
    private sidebarSlots: any[] = [];
    private sidebarButtons: any[] = [];
    private sidebarButtonConfigs: ButtonConfig[] = [];
    private sidebarButtonsRawConfigs?: ButtonConfig[];
    private sidebarMpSlotEnabled: boolean = false;
    private sidebarCollapsed: boolean = true;
    private sidebarNeedsRefresh?: boolean;
    private sidebarMpSlotContent?: SidebarMpContent;
    private contentComponent?: UiObject;
    private sidebarPreviewInner?: UiObject;
    private _onSidebarToggle = new EventDispatcher<MainMenu, boolean>();
    private mainContainer!: UiObject;
    private statusBar!: UiObject;
    private sidebarContainer!: UiObject;
    private sidebarMpSlotContainer!: UiObject;
    private sidebarMpSlot!: any;
    private sidebarMpSlotContentEl!: any;
    private sidebarPreview!: SidebarPreview;
    private menuVideo!: HtmlView;
    private version!: HtmlView;
    constructor(viewport: Viewport, images: ImageMap, jsxRenderer: JsxRenderer, videoSrc: string) {
        super(new THREE.Object3D(), new HtmlContainer());
        this.viewport = this.fitViewport(viewport);
        this.images = images;
        registerMainMenuArt(images);
        this.jsxRenderer = jsxRenderer;
        this.videoSrc = videoSrc;
        this.create3DObject();
        this.applyMenuScale();
    }
    get onSidebarToggle() {
        return this._onSidebarToggle;
    }
    private fitViewport(viewport: Viewport): Viewport {
        this.menuScale = Math.min(viewport.width / 800, viewport.height / 600);
        return { x: 0, y: 0, width: viewport.width / this.menuScale, height: viewport.height / this.menuScale };
    }
    private applyMenuScale(): void {
        const object = this.get3DObject()!;
        object.scale.set(this.menuScale, this.menuScale, 1);
        object.updateMatrix();
        this.getHtmlContainer()!.setScale(this.menuScale);
        const mainWidth = this.viewport.width - this.getImage('sdtp.shp').width;
        const mainHeight = this.viewport.height - this.getImage('lwscrnl.shp').height;
        this.mainContainer.getHtmlContainer()?.setSize(mainWidth, mainHeight);
        this.menuVideo?.getElement()?.setSize(mainWidth, mainHeight);
        // Extend only the decorative panels; text, buttons and previews keep their aspect ratio.
        for (const [background, width, source] of [
            [this.mainBackground, mainWidth, this.getImage('mnscrnl.shp').width],
            [this.statusBackground, mainWidth, this.getImage('lwscrnl.shp').width],
        ] as const) {
            background?.setHorizontalScale(width / source);
            if (background === this.mainBackground) background?.setVerticalScale(mainHeight / this.getImage('mnscrnl.shp').height);
        }
    }
    setViewport(viewport: Viewport): void {
        const previousHeight = this.viewport.height;
        this.viewport = this.fitViewport(viewport);
        this.setPosition(this.viewport.x, this.viewport.y);
        this.applyMenuScale();
        const statusBarImage = this.getImage("lwscrnl.shp");
        this.statusBar.setPosition(0, this.viewport.height - statusBarImage.height);
        const sidebarImage = this.getImage("sdtp.shp");
        const sidebarViewport = this.computeSidebarViewport(sidebarImage);
        this.sidebarContainer.setPosition(sidebarViewport.x, sidebarViewport.y);
        this.version.getUiObject().setPosition(0, sidebarViewport.height - 20);
        if (Math.abs(previousHeight - this.viewport.height) < 0.01) return;
        this.sidebarContainer.remove(...this.sidebarObjects);
        this.sidebarObjects.forEach((obj) => obj.destroy());
        this.createSidebarButtons(this.computeSidebarButtonsViewport(sidebarImage));
        this.updateButtons(this.sidebarButtonsRawConfigs ?? []);
        if (!this.sidebarCollapsed) {
            this.showButtons();
        }
    }
    setContentComponent(component?: UiObject): void {
        let container = this.mainContainer;
        if (this.contentComponent) {
            container.remove(this.contentComponent);
            this.contentComponent.destroy();
            this.contentComponent = undefined;
        }
        if (component) {
            container.add(component);
            this.contentComponent = component;
        }
    }
    setSlots(slotCount: number, hasBottomSlot: boolean, mpSlotEnabled: boolean = false): void {
        let totalSlots = this.sidebarSlots.length;
        if (!totalSlots) {
            throw new Error("Cannot call setButtons prior to render");
        }
        this.sidebarMpSlotContainer.setVisible(mpSlotEnabled);
        this.sidebarSlots[0].setVisible(!mpSlotEnabled);
        this.sidebarSlots.forEach((slot, index) => {
            let animRunner = slot.getAnimationRunner();
            if (index < slotCount + (mpSlotEnabled ? 1 : 0)) {
                (animRunner as any).buttonState = MenuButtonState.Unlit;
            }
            else if (index === totalSlots - 1) {
                (animRunner as any).buttonState = hasBottomSlot
                    ? MenuButtonState.Unlit
                    : MenuButtonState.Hidden;
            }
            else {
                (animRunner as any).buttonState = MenuButtonState.Hidden;
            }
        });
    }
    setButtons(buttons: ButtonConfig[], mpSlotEnabled: boolean = false): void {
        console.log('[MainMenu] setButtons called, sidebarButtons.length:', this.sidebarButtons.length);
        this.sidebarButtonsRawConfigs = buttons;
        this.sidebarMpSlotEnabled = mpSlotEnabled;
        this.updateButtons(buttons);
    }
    updateButtons(buttons: ButtonConfig[]): void {
        console.log('[MainMenu] updateButtons called, sidebarButtons.length:', this.sidebarButtons.length);
        let mpSlotEnabled = this.sidebarMpSlotEnabled;
        const hasBottomButton = !!buttons.find((btn) => !!btn.isBottom);
        this.setSlots(buttons.length - (hasBottomButton ? 1 : 0), hasBottomButton, mpSlotEnabled);
        this.updateSidebarMpContent();
        this.sidebarButtonConfigs = [];
        this.sidebarButtons.forEach((btn) => btn.applyOptions((options: any) => (options.buttonConfig = undefined)));
        buttons.forEach((buttonConfig, index) => {
            const slotIndex = buttonConfig.isBottom
                ? this.sidebarButtons.length - 1
                : mpSlotEnabled
                    ? index + 1
                    : index;
            console.log('[MainMenu] Setting button config for slotIndex:', slotIndex, 'buttonConfig:', buttonConfig);
            this.sidebarButtonConfigs[slotIndex] = buttonConfig;
            if (this.sidebarButtons[slotIndex]) {
                this.sidebarButtons[slotIndex].applyOptions((options: any) => (options.buttonConfig = {
                    label: buttonConfig.label,
                    action: buttonConfig.action,
                    tooltip: buttonConfig.tooltip,
                    disabled: !!buttonConfig.disabled,
                }));
            }
            else {
                console.warn('[MainMenu] sidebarButtons[' + slotIndex + '] is undefined');
            }
        });
        this.sidebarNeedsRefresh = true;
    }
    isSidebarCollapsed(): boolean {
        return this.sidebarCollapsed;
    }
    showButtons(): void {
        this.sidebarCollapsed = false;
        this.sidebarNeedsRefresh = true;
        this.sidebarMpSlot.getAnimationRunner().slideIn();
        this.sidebarSlots.forEach((slot) => {
            let animRunner = slot.getAnimationRunner();
            animRunner.slideIn();
        });
    }
    hideButtons(): void {
        this.sidebarCollapsed = true;
        this.updateSidebarButtons();
        this.sidebarNeedsRefresh = true;
        this.sidebarMpSlot.getAnimationRunner().slideOut();
        this.sidebarSlots.forEach((slot) => {
            let animRunner = slot.getAnimationRunner();
            animRunner.slideOut();
        });
    }
    setSidebarTitle(title: string): void {
        this.sidebarPreview.setTitle(title);
    }
    toggleSidebarPreview(visible: boolean): void {
        this.sidebarPreview.toggleSidebarPreview(visible);
    }
    setSidebarPreview(preview: UiObject): void {
        if (this.sidebarPreviewInner) {
            this.sidebarPreviewInner.destroy();
        }
        this.sidebarPreview.setPreview(preview);
        this.sidebarPreviewInner = preview;
    }
    getSidebarPreviewSize(): {
        width: number;
        height: number;
    } {
        return this.sidebarPreview.getPreviewSize();
    }
    toggleVideo(visible: boolean): void {
        console.log('[MainMenu] toggleVideo called, visible:', visible, 'menuVideo exists:', !!this.menuVideo);
        if (!this.menuVideo) {
            throw new Error("Cannot call toggleVideo prior to render");
        }
        this.menuVideo.getUiObject().setVisible(visible);
        this.menuVideo.getElement()?.applyOptions((options: any) => { options.active = visible; });
        console.log('[MainMenu] Video visibility set to:', visible);
    }
    showVersion(version: string, edition?: string): void {
        console.log('[MainMenu] showVersion called, version:', version, 'version element exists:', !!this.version);
        this.version.getUiObject().setVisible(true);
        this.version.getElement().applyOptions((options: any) => {
            options.value = releaseVersion;
            options.edition = edition;
        });
        console.log('[MainMenu] Version shown:', releaseVersion);
    }
    hideVersion(): void {
        this.version.getUiObject().setVisible(false);
    }
    setSidebarMpContent(content: SidebarMpContent): void {
        this.sidebarMpSlotContent = content;
        this.updateSidebarMpContent();
    }
    updateSidebarMpContent(): void {
        this.sidebarMpSlotContentEl.applyOptions((options: any) => {
            if (this.sidebarMpSlotContent) {
                options.text = this.sidebarMpSlotContent.text;
                options.icon = this.sidebarMpSlotContent.icon;
                options.tooltip = this.sidebarMpSlotContent.tooltip;
            }
        });
    }
    getImage(name: string): any {
        const image = this.images.get(name);
        if (!image) {
            throw new Error(`Missing image "${name}"`);
        }
        return image;
    }
    create3DObject(): void {
        console.log('[MainMenu] Creating 3D object');
        super.create3DObject();
        if (!this.rootObjects.length) {
            console.log('[MainMenu] Creating root objects');
            this.setPosition(this.viewport.x, this.viewport.y);
            const mainImage = this.getImage("mnscrnl.shp");
            const statusBarImage = this.getImage("lwscrnl.shp");
            const sidebarImage = this.getImage("sdtp.shp");
            const sidebarAnimImage = this.getImage("sdwrnanm.shp");
            const sidebarViewport = this.computeSidebarViewport(sidebarImage);
            console.log('[MainMenu] Image sizes:');
            console.log('  mainImage:', mainImage.width, 'x', mainImage.height);
            console.log('  statusBarImage:', statusBarImage.width, 'x', statusBarImage.height);
            console.log('  sidebarImage:', sidebarImage.width, 'x', sidebarImage.height);
            console.log('[MainMenu] Viewport:', this.viewport);
            console.log('[MainMenu] Status bar position will be:', 0, this.viewport.height - statusBarImage.height);
            const statusBarY = this.viewport.height - statusBarImage.height;
            console.log('[MainMenu] Status bar position:', 0, statusBarY);
            console.log('[MainMenu] Camera is inverted, so Y coordinates might need adjustment');
            this.rootObjects = this.jsxRenderer.render(jsx("fragment", null, jsx("container", {
                width: mainImage.width,
                height: mainImage.height,
                ref: (ref: UiObject) => (this.mainContainer = ref),
            }, jsx("sprite", { image: mainImage, palette: "shell.pal", ref: (ref: UiObjectSprite) => this.mainBackground = ref }), jsx(HtmlView, {
                component: MenuVideo,
                props: { src: this.videoSrc },
                hidden: true,
                ref: (ref: HtmlView) => (this.menuVideo = ref),
            })), jsx("container", {
                x: 0,
                y: statusBarY,
                ref: (ref: UiObject) => (this.statusBar = ref),
            }, jsx("sprite", { image: statusBarImage, palette: "shell.pal", ref: (ref: UiObjectSprite) => this.statusBackground = ref }), jsx(HtmlView, {
                component: MenuTooltip,
                props: { monitorContainer: this.getHtmlContainer() },
                width: statusBarImage.width,
                height: statusBarImage.height,
            })), jsx("container", {
                x: sidebarViewport.x,
                y: sidebarViewport.y,
                ref: (ref: UiObject) => (this.sidebarContainer = ref),
            }, jsx(SidebarPreview, {
                sdtpImg: sidebarImage,
                sdtpAnimImg: sidebarAnimImage,
                closed: true,
                ref: (ref: SidebarPreview) => (this.sidebarPreview = ref),
            }), jsx(HtmlView, {
                component: VersionString,
                props: { value: "" },
                width: sidebarViewport.width,
                y: sidebarViewport.height - 20,
                ref: (ref: HtmlView) => (this.version = ref),
                hidden: true,
            }))));
            console.log('[MainMenu] JSX rendered, rootObjects count:', this.rootObjects.length);
            console.log('[MainMenu] Root objects:', this.rootObjects);
            this.add(...this.rootObjects);
            this.createSidebarButtons(this.computeSidebarButtonsViewport(sidebarImage));
        }
    }
    createSidebarButtons(viewport: {
        x: number;
        y: number;
        width: number;
        height: number;
    }): void {
        let buttonBgImage = this.getImage("sdbtnbkgd.shp");
        let buttonAnimImage = this.getImage("sdbtnanm.shp");
        const slotCount = Math.floor(viewport.height / buttonBgImage.height);
        let bottomImage = this.getImage("sdbtm.shp");
        const remainingHeight = viewport.height - buttonBgImage.height * slotCount;
        const clippedBottomImage = bottomImage.clip(bottomImage.width, remainingHeight);
        this.sidebarSlots = [];
        this.sidebarButtons = [];
        this.sidebarObjects = this.jsxRenderer.render(jsx("fragment", null, new Array(slotCount).fill(0).map((_, slotIndex) => {
            let animRunner = new MenuSlotAnimationRunner(slotIndex);
            let hovered = false, pressed = false;
            return jsx("fragment", null, jsx("container", { x: viewport.x, y: viewport.y + buttonBgImage.height * slotIndex }, jsx("sprite", { image: buttonBgImage, palette: "shell2.pal" }), !slotIndex
                ? jsx("container", {
                    zIndex: 1,
                    hidden: true,
                    ref: (ref: UiObject) => (this.sidebarMpSlotContainer = ref),
                    x: 12,
                    y: -buttonBgImage.height,
                }, jsx("sprite", {
                    image: "sdmpbtn.shp",
                    palette: "shell.pal",
                    ref: (ref: any) => (this.sidebarMpSlot = ref),
                    animationRunner: new MenuMpSlotAnimRunner(),
                }), jsx(HtmlView, {
                    component: MenuMpSlotText,
                    props: { text: "" },
                    width: 146,
                    height: 2 * buttonBgImage.height,
                    innerRef: (ref: any) => (this.sidebarMpSlotContentEl = ref),
                }))
                : [], jsx("sprite", {
                image: buttonAnimImage,
                palette: "sdbtnanm.pal",
                ref: (ref: any) => this.sidebarSlots.push(ref),
                x: 12,
                animationRunner: animRunner,
            }), jsx(HtmlView, {
                x: 12,
                hidden: true,
                innerRef: (ref: any) => this.sidebarButtons.push(ref),
                component: MenuButton,
                props: {
                    box: { x: 0, y: 0, width: 146, height: buttonAnimImage.height },
                    buttonConfig: null,
                    onMouseEnter: () => {
                        hovered = true;
                        if (!pressed) (animRunner as any).buttonState = MenuButtonState.Hover;
                    },
                    onMouseLeave: () => {
                        hovered = false;
                        if (!pressed && !this.sidebarButtonConfigs[slotIndex]?.disabled)
                            (animRunner as any).buttonState = MenuButtonState.Normal;
                    },
                    onMouseDown: () => {
                        pressed = true;
                        (animRunner as any).buttonState = MenuButtonState.Active;
                        let mouseUpHandler = () => {
                            pressed = false;
                            (animRunner as any).buttonState = hovered ? MenuButtonState.Hover : MenuButtonState.Normal;
                            document.removeEventListener("mouseup", mouseUpHandler);
                        };
                        document.addEventListener("mouseup", mouseUpHandler);
                    },
                    onClick: () => {
                        this.onSidebarButtonClick(slotIndex);
                    },
                },
            })));
        }), jsx("sprite", {
            image: clippedBottomImage,
            palette: "shell.pal",
            x: viewport.x,
            y: viewport.y + buttonBgImage.height * slotCount,
        })));
        this.sidebarContainer.add(...this.sidebarObjects);
    }
    computeSidebarViewport(sidebarImage: any): {
        x: number;
        y: number;
        width: number;
        height: number;
    } {
        return {
            x: this.viewport.width - sidebarImage.width,
            y: 0,
            width: sidebarImage.width,
            height: this.viewport.height,
        };
    }
    computeSidebarButtonsViewport(sidebarImage: any): {
        x: number;
        y: number;
        width: number;
        height: number;
    } {
        return {
            x: 0,
            y: sidebarImage.height,
            width: sidebarImage.width,
            height: this.viewport.height - sidebarImage.height,
        };
    }
    update(deltaTime: number): void {
        super.update(deltaTime);
        if (this.sidebarNeedsRefresh) {
            let lastSlot = this.sidebarSlots[this.sidebarSlots.length - 1];
            let animRunner = lastSlot.getAnimationRunner();
            if (animRunner.isStopped()) {
                this.updateSidebarButtons();
                this._onSidebarToggle.dispatch(this, !this.sidebarCollapsed);
            }
        }
    }
    updateSidebarButtons(): void {
        if (this.sidebarCollapsed) {
            this.sidebarButtons.forEach((btn) => btn.hide());
            this.sidebarMpSlotContentEl.hide();
            this.sidebarSlots.forEach((slot) => {
                let animRunner = slot.getAnimationRunner();
                if ((animRunner as any).buttonState === MenuButtonState.Normal) {
                    (animRunner as any).buttonState = MenuButtonState.Unlit;
                }
            });
        }
        else {
            this.sidebarButtons.forEach((btn) => btn.show());
            this.sidebarMpSlotContentEl.show();
            this.sidebarSlots.forEach((slot, slotIndex) => {
                let animRunner = slot.getAnimationRunner();
                if ((animRunner as any).buttonState === MenuButtonState.Hidden) {
                    return;
                }
                const buttonConfig = this.sidebarButtonConfigs[slotIndex];
                (animRunner as any).buttonState = buttonConfig?.disabled
                    ? MenuButtonState.Unlit
                    : MenuButtonState.Normal;
            });
        }
        this.sidebarNeedsRefresh = false;
    }
    onSidebarButtonClick(slotIndex: number): void {
        const config = this.sidebarButtonConfigs[slotIndex];
        if (config && !config.disabled && !this.sidebarCollapsed) {
            config.onClick?.();
        }
    }
    destroy(): void {
        this.sidebarButtons.length = 0;
        this.remove(...this.rootObjects);
        this.rootObjects.forEach((obj) => obj.destroy());
        this.rootObjects.length = 0;
        super.destroy();
    }
}

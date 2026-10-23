import { canonicalAlliedBuildingHdFamily } from '@/engine/renderable/builder/alliedBuildingHdFamilies';
import { UI_FONT_FAMILY, UI_FONT_WEIGHT } from "@/engine/gfx/UiTypography";
import { UiText } from '@/gui/component/UiText';
import * as jsx from "@/gui/jsx/jsx";
import * as SidebarModel from "@/gui/screen/game/component/hud/viewmodel/SidebarModel";
import { SidebarItemStatus } from "@/gui/screen/game/component/hud/viewmodel/SidebarModel";
import { UiObject } from "@/gui/UiObject";
import { UiComponent, UiComponentProps } from "@/gui/jsx/UiComponent";
import { OverlayUtils } from "@/engine/gfx/OverlayUtils";
import { HtmlContainer } from "@/gui/HtmlContainer";
import { clamp } from "@/util/math";
import { ObjectArt } from "@/game/art/ObjectArt";
import { resolveSidebarItemTooltipText } from "@/gui/screen/game/TooltipTextResolver";
import { uiArt } from '@/gui/hd/UiArt';
import { UiArtPage } from '@/gui/hd/UiArtPage';
declare const THREE: any;
interface SidebarCardProps extends UiComponentProps {
    x?: number;
    y?: number;
    zIndex?: number;
    slots: number;
    slotSize?: {
        width: number;
        height: number;
    };
    cameoImages: any;
    cameoPalette: string;
    sidebarModel: any;
    onSlotClick?: (event: any) => void;
    textColor: string;
    cameoNameToIdMap: Map<string, number>;
    strings: any;
    persistentHoverTags?: {
        value: boolean;
    };
}
interface SlotClickEvent {
    target: any;
    button: number;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    isTouch: boolean;
    touchDuration: number;
}
export class SidebarCard extends UiComponent<SidebarCardProps> {
    static readonly MAX_QUANTITY = 99;
    private nameObjects: UiText[] = [];
    private slotContainers: any[] = [];
    private slotObjects: any[] = [];
    private progressOverlays: any[] = [];
    private visible: boolean = true;
    private labelObjects: any[] = [];
    private quantityObjects: any[] = [];
    private tagObjects: any[] = [];
    private justCreated: boolean = true;
    private lastItemCount: number = 0;
    private pagingOffset: number = 0;
    private declare slotOutline: UiObject;
    private declare tagImages: any[];
    private declare tagFrameByText: Map<string, number>;
    private lastActiveTab?: any;
    private hoverSlotIndex?: number;
    private pointerSlotIndex?: number;
    private focusedIdentity?: string;
    private releaseFocus?: () => void;
    private previewLeases = new Map<string, () => void>();
    private artworkPages = new UiArtPage();
    private cancelPreparation?: () => void;
    private pageRequest = 0;
    private pageKey?: string;
    private publishedItems: any[] = [];
    private disposed = false;
    constructor(props: SidebarCardProps) {
        super(props);
        this.handleWheel = (e: any) => {
            this.scrollToOffset(this.pagingOffset + (0 < e.wheelDeltaY ? 2 : -2));
        };
    }
    private handleWheel: (e: any) => void;
    createUiObject(): UiObject {
        const uiObject = new UiObject(new THREE.Object3D(), new HtmlContainer());
        uiObject.setPosition(this.props.x || 0, this.props.y || 0);
        uiObject.onFrame.subscribe(() => this.handleFrame());
        const unsubscribe = uiArt.subscribe(() => {
            this.pageKey = undefined;
            this.updateSlots(this.props.sidebarModel.activeTab.items, this.props.slots);
        });
        uiObject.onDispose.subscribe(() => {
            this.disposed = true; this.pageRequest++;
            unsubscribe(); this.releaseFocus?.();
            this.previewLeases.forEach(release => release()); this.previewLeases.clear();
            this.cancelPreparation?.(); this.artworkPages.dispose();
        });
        this.slotOutline = new UiObject(this.createSlotOutline());
        this.slotOutline.setVisible(false);
        // Keep the hover border in front of the translucent production clock.
        this.slotOutline.setZIndex((this.props.zIndex ?? 0) + 1.25);
        uiObject.add(this.slotOutline);
        this.tagImages = [
            this.createTextBox("", this.props.textColor, {
                fontSize: 12,
                fontWeight: "400",
                paddingTop: 2,
                paddingBottom: 2,
                paddingLeft: 2,
                paddingRight: 2,
            }),
        ];
        this.tagFrameByText = new Map();
        this.tagFrameByText.set("", 0);
        return uiObject;
    }
    defineChildren(): any[] {
        const { slots, cameoImages, cameoPalette, sidebarModel, onSlotClick, zIndex, } = this.props;
        const slotSize = this.getSlotSize();
        const horizontalSpacing = 3;
        const verticalSpacing = 2;
        const children = [];
        for (let slotIndex = 0; slotIndex < slots; slotIndex++) {
            const position = {
                x: (horizontalSpacing + slotSize.width) * (slotIndex % 2),
                y: (verticalSpacing + slotSize.height) * Math.floor(slotIndex / 2),
            };
            children.push(jsx.jsx("container", {
                x: position.x,
                y: position.y,
                zIndex: zIndex,
                ref: (element: any) => this.slotContainers.push(element),
                onWheel: this.handleWheel,
                onClick: (event: any) => {
                    const item = this.publishedItems[slotIndex];
                    if (item && !item.disabled) {
                        onSlotClick?.(this.createSlotClickEvent(item, event));
                    }
                },
                onMouseEnter: () => {
                    this.pointerSlotIndex = slotIndex;
                    this.updateHover();
                },
                onMouseLeave: () => {
                    if (this.pointerSlotIndex === slotIndex) {
                        this.pointerSlotIndex = undefined;
                        this.updateHover();
                    }
                },
            }, jsx.jsx(UiText, {
                value: '', textColor: '#fff', width: slotSize.width, height: 12,
                x: 0, y: slotSize.height - 12, fontSize: 10, paddingTop: 0,
                fontFamily: "'Fira Sans Condensed', Arial, sans-serif", fontWeight: '500',
                outlineColor: '#000', outlineWidth: 0.75, fitText: true, zIndex: 0.75,
                ref: (element: UiText) => this.nameObjects.push(element),
            }), jsx.jsx("sprite", {
                image: "gclock2.shp",
                palette: "sidebar.pal",
                zIndex: 1,
                frame: 0,
                opacity: 0.5,
                transparent: true,
                ref: (element: any) => this.progressOverlays.push(element),
            }), jsx.jsx("sprite", {
                images: this.tagImages,
                zIndex: 0.5,
                x: slotSize.width / 2,
                y: slotSize.height / 2,
                transparent: true,
                ref: (element: any) => this.tagObjects.push(element),
            }), jsx.jsx(UiText, {
                value: '', textColor: this.props.textColor, width: slotSize.width - 16, height: 22,
                x: 8, y: 0, fontSize: 12, fontWeight: '700', paddingTop: 5,
                outlineColor: '#17130c', outlineWidth: 1.25,
                fitText: true, zIndex: 2,
                ref: (element: UiText) => this.labelObjects.push(element),
            }), jsx.jsx(UiText, {
                value: '', textColor: this.props.textColor, width: 24, height: 22,
                x: slotSize.width - 26, y: 0, fontSize: 12, fontWeight: '700', paddingTop: 5,
                outlineColor: '#17130c', outlineWidth: 1.25,
                textAlign: 'right', fitText: true, zIndex: 2,
                ref: (element: UiText) => this.quantityObjects.push(element),
            }), jsx.jsx("sprite", {
                image: cameoImages,
                palette: cameoPalette,
                ref: (element: any) => this.slotObjects.push(element),
            })));
        }
        return children;
    }
    private updateHover(): void {
        const index = this.pointerSlotIndex;
        const item = this.visible && index !== undefined ? this.publishedItems[index] : undefined;
        const enabled = item && !item.disabled;
        const identity = enabled && item.target?.type === SidebarModel.SidebarItemTargetType.Techno
            ? canonicalAlliedBuildingHdFamily(item.target.rules.name) : undefined;
        if (identity !== this.focusedIdentity) {
            this.releaseFocus?.(); this.releaseFocus = undefined;
            this.focusedIdentity = identity;
            if (identity) this.releaseFocus = this.props.sidebarModel.focusArtwork?.(identity);
        }
        this.hoverSlotIndex = enabled ? index : undefined;
        this.slotOutline.setVisible(!!enabled);
        if (enabled) {
            const size = this.getSlotSize();
            this.slotOutline.setPosition((size.width + 3) * (index! % 2),
                (size.height + 2) * Math.floor(index! / 2));
        }
    }
    createSlotClickEvent(item: any, event: any): SlotClickEvent {
        return {
            target: item.target,
            button: event.button,
            altKey: event.altKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
            isTouch: event.isTouch,
            touchDuration: event.touchDuration,
        };
    }
    handleFrame(): void {
        const { sidebarModel, slots } = this.props;
        for (let i = 0; i < this.nameObjects.length; i++) {
            const item = this.publishedItems[i];
            const name = this.nameObjects[i];
            name.getUiObject().setVisible(!!item && this.visible && this.slotObjects[i]?.isHdArtwork);
            if (item) {
                const rules = item.target?.rules;
                const key = rules?.uiName;
                name.setValue(key ? this.props.strings.get(key) : rules?.name ?? '');
            }
        }
        const obj3D = this.getUiObject().get3DObject();
        obj3D.visible = this.visible;
        if (this.justCreated ||
            sidebarModel.activeTab.needsUpdate ||
            this.lastActiveTab !== sidebarModel.activeTab) {
            this.justCreated = false;
            const itemCount = sidebarModel.activeTab.items.length;
            if (this.lastActiveTab !== sidebarModel.activeTab ||
                this.lastItemCount !== itemCount) {
                if (this.lastItemCount > itemCount) {
                    this.pagingOffset = 0;
                }
                this.lastItemCount = itemCount;
            }
            this.lastActiveTab = sidebarModel.activeTab;
            sidebarModel.activeTab.needsUpdate = false;
            this.updateSlots(sidebarModel.activeTab.items, slots);
        }
    }
    updateSlots(items: any[], slotCount: number): void {
        if (this.disposed || this.visible === false) return;
        const visibleItems = items.slice(this.pagingOffset, this.pagingOffset + slotCount);
        const frames = uiArt.frames.get(this.props.cameoImages);
        const frameIds = visibleItems.map(item => this.props.cameoNameToIdMap.get(item.cameo + '.shp') ??
            this.props.cameoNameToIdMap.get((ObjectArt as any).MISSING_CAMEO + '.shp'));
        const key = `${uiArt.enabled}/${uiArt.revision}/${frameIds.join(',')}`;
        if (key === this.pageKey) {
            if (!this.cancelPreparation) this.publishSlots(visibleItems, slotCount);
            return;
        }
        this.pageKey = key;
        const request = ++this.pageRequest;
        this.cancelPreparation?.(); this.cancelPreparation = undefined;
        let published = false;
        const cancel = this.artworkPages.prepare(frameIds.map(id => frames?.[id!]).filter(Boolean), () => {
            if (this.disposed || this.pageRequest !== request) return;
            const currentItems = this.props.sidebarModel.activeTab.items.slice(this.pagingOffset, this.pagingOffset + slotCount);
            const currentFrames = currentItems.map(item => this.props.cameoNameToIdMap.get(item.cameo + '.shp') ??
                this.props.cameoNameToIdMap.get((ObjectArt as any).MISSING_CAMEO + '.shp'));
            // A click can change the model before the next UI frame starts a request.
            if (`${uiArt.enabled}/${uiArt.revision}/${currentFrames.join(',')}` !== key) return;
            published = true; this.cancelPreparation = undefined;
            // Use current queue/prices for this page, never a stale preparation snapshot.
            this.publishSlots(currentItems, slotCount);
        }, () => this.publishSlots([], slotCount));
        if (!published) this.cancelPreparation = cancel;
    }
    private publishSlots(items: any[], slotCount: number): void {
        if (this.disposed) return;
        const changedPage = items.length !== this.publishedItems.length || items.some((item, i) => item !== this.publishedItems[i]);
        this.publishedItems = items;
        const previews = new Set<string>(items.filter(item => !item.disabled
            && item.target?.type === SidebarModel.SidebarItemTargetType.Techno)
            .map(item => canonicalAlliedBuildingHdFamily(item.target.rules.name)));
        for (const [name, release] of this.previewLeases) if (!previews.has(name)) {
            release(); this.previewLeases.delete(name);
        }
        for (const name of previews) if (!this.previewLeases.has(name)) {
            const release = this.props.sidebarModel.previewArtwork?.(name);
            if (release) this.previewLeases.set(name, release);
        }
        // The pointer can stay still while an asynchronously prepared page
        // replaces its contents. Refresh focus against the newly displayed item.
        if (changedPage) this.updateHover();
        for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
            const item = items[slotIndex];
            const slotObject = this.slotObjects[slotIndex];
            const progressOverlay = this.progressOverlays[slotIndex];
            const labelObject = this.labelObjects[slotIndex];
            const quantityObject = this.quantityObjects[slotIndex];
            const tagObject = this.tagObjects[slotIndex];
            const name = this.nameObjects[slotIndex];
            if (item) name.setValue(item.target?.rules?.uiName ? this.props.strings.get(item.target.rules.uiName) : item.target?.rules?.name ?? '');
            if (!item) {
                slotObject.setVisible(false);
                progressOverlay.setVisible(false);
                labelObject.getUiObject().setVisible(false);
                quantityObject.getUiObject().setVisible(false);
                tagObject.setVisible(false);
                this.slotContainers[slotIndex].setTooltip(undefined);
            }
            else {
                this.updateCameo(item, slotObject);
                this.updatePersistentTag(item, tagObject);
                this.updateProgressOverlay(item, progressOverlay);
                this.updateStatusText(item, labelObject);
                this.updateQuantities(item, quantityObject);
                this.updateTooltip(item, this.slotContainers[slotIndex]);
            }
            name.getUiObject().setVisible(!!item && this.visible && slotObject?.isHdArtwork);
        }
    }
    updateCameo(item: any, slotObject: any): void {
        const cameoNameToIdMap = this.props.cameoNameToIdMap;
        let cameoName = item.cameo + ".shp";
        let frameId = cameoNameToIdMap.get(cameoName);
        if (frameId === undefined) {
            cameoName = (ObjectArt as any).MISSING_CAMEO + ".shp";
            frameId = cameoNameToIdMap.get(cameoName);
        }
        if (frameId === undefined) {
            throw new Error(`Missing cameo placeholder image "${(ObjectArt as any).MISSING_CAMEO}.shp"`);
        }
        slotObject.setFrame(frameId);
        slotObject.setVisible(true);
        slotObject.setLightMult(item.disabled ? 0.5 : 1);
    }
    updateProgressOverlay(item: any, progressOverlay: any): void {
        let frame = 0;
        const unavailableSuperWeapon = item.status === SidebarItemStatus.Idle && item.disabled &&
            item.target?.type === SidebarModel.SidebarItemTargetType.Techno &&
            item.target.rules.buildLimit === 1 && !!item.target.rules.superWeapon;
        // The rotating clock is coverage, not colored icon artwork. A neutral
        // translucent shade keeps the actual cameo visible under every phase.
        progressOverlay.setLightMult(0);
        if (item.status === SidebarItemStatus.InQueue || unavailableSuperWeapon) {
            // A stationary full mask also makes unavailable one-per-player
            // superweapon buildings unambiguous beside their separate power icons.
            frame = 1;
        }
        else if ([SidebarItemStatus.Started, SidebarItemStatus.OnHold].includes(item.status)) {
            const frameCount = progressOverlay.getFrameCount();
            frame = Math.max(1, Math.ceil(item.progress * (frameCount - 1))) % frameCount;
        }
        progressOverlay.setFrame(frame);
        progressOverlay.setVisible(frame > 0);
    }
    updateStatusText(item: any, labelObject: UiText): void {
        const isVisible = [SidebarItemStatus.Ready, SidebarItemStatus.OnHold].includes(item.status);
        labelObject.getUiObject().setVisible(isVisible);
        if (!isVisible) return;
        const held = item.status === SidebarItemStatus.OnHold;
        labelObject.setValue(this.props.strings.get(held ? 'TXT_HOLD' : 'TXT_READY'));
        labelObject.setTextAlign(held && item.quantity > 1 ? 'left' : 'center');
        labelObject.getUiObject().setPosition(held && item.quantity > 1 ? 2 : 8, 0);
    }
    updateQuantities(item: any, quantityObject: UiText): void {
        const threshold = item.status === SidebarItemStatus.InQueue ? 0 : 1;
        quantityObject.getUiObject().setVisible(item.quantity > threshold);
        quantityObject.setValue(item.quantity > SidebarCard.MAX_QUANTITY ? '∞' : String(item.quantity));
    }
    updateTooltip(item: any, container: any): void {
        const tooltip = resolveSidebarItemTooltipText(item, this.props.sidebarModel, this.props.strings);
        container.setTooltip(tooltip);
    }
    ensureTagFrame(text?: string): number {
        const resolvedText = text ?? "";
        const existingFrame = this.tagFrameByText.get(resolvedText);
        if (existingFrame !== undefined) {
            return existingFrame;
        }
        const frame = this.tagImages.length;
        const image = this.createTextBox(resolvedText, this.props.textColor, {
            fontSize: 12,
            fontWeight: "400",
            paddingTop: 2,
            paddingBottom: 2,
            paddingLeft: 2,
            paddingRight: 2,
        });
        this.tagImages = [...this.tagImages, image];
        this.tagFrameByText.set(resolvedText, frame);
        this.tagObjects.forEach((tagObject) => {
            const builder = tagObject?.builder as any;
            if (!builder) {
                return;
            }
            const currentFrame = builder.getFrame?.() ?? 0;
            builder.images = this.tagImages;
            builder.atlas = undefined;
            builder.initTexture?.();
            builder.frameGeometries?.forEach((geometry: any) => geometry.dispose());
            builder.frameGeometries?.clear?.();
            if (builder.mesh) {
                if (builder.mesh.material) {
                    builder.mesh.material.map = builder.atlas?.getTexture?.();
                    builder.mesh.material.needsUpdate = true;
                }
                builder.frameNo = -1;
                builder.setFrame(Math.min(currentFrame, builder.frameCount - 1));
            }
        });
        return frame;
    }
    updatePersistentTag(item: any, tagObject: any): void {
        if (!tagObject) {
            return;
        }
        if (!this.props.persistentHoverTags?.value) {
            tagObject.setVisible(false);
            return;
        }
        const tooltip = resolveSidebarItemTooltipText(item, this.props.sidebarModel, this.props.strings);
        if (!tooltip) {
            tagObject.setVisible(false);
            return;
        }
        const frame = this.ensureTagFrame(tooltip);
        tagObject.setFrame(frame);
        tagObject.setVisible(true);
    }
    getItemIndexAtSlot(slotIndex: number): number {
        return slotIndex + this.pagingOffset;
    }
    getCameoSize(): {
        width: number;
        height: number;
    } {
        return {
            width: this.props.cameoImages.width,
            height: this.props.cameoImages.height,
        };
    }
    getSlotSize(): {
        width: number;
        height: number;
    } {
        return this.props.slotSize ?? this.getCameoSize();
    }
    createSlotOutline(): any {
        const slotSize = this.getSlotSize();
        const width = slotSize.width;
        const height = slotSize.height;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([
            0, 0, 0,
            0, height, 0,
            width, height, 0,
            width, 0, 0,
            0, 0, 0,
        ]);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.LineBasicMaterial({
            color: this.props.textColor,
            transparent: true,
            side: THREE.DoubleSide,
        });
        return new THREE.Line(geometry, material);
    }
    hide(): void {
        this.visible = false;
        this.updateHover();
        this.pageRequest++;
        this.cancelPreparation?.(); this.cancelPreparation = undefined;
        this.pageKey = undefined;
        this.artworkPages.dispose();
        this.slotObjects.forEach(slot => slot.setVisible(false));
        this.previewLeases.forEach(release => release()); this.previewLeases.clear();
    }
    show(): void {
        this.visible = true;
        this.updateSlots(this.props.sidebarModel.activeTab.items, this.props.slots);
        this.updateHover();
    }
    scrollToOffset(offset: number): boolean {
        const oldOffset = this.pagingOffset;
        const maxOffset = Math.max(0, this.props.sidebarModel.activeTab.items.length - this.props.slots);
        this.pagingOffset = clamp(offset, 0, maxOffset);
        if (this.pagingOffset % 2) {
            this.pagingOffset++;
        }
        this.updateSlots(this.props.sidebarModel.activeTab.items, this.props.slots);
        return oldOffset !== this.pagingOffset;
    }
    pageDown(): boolean {
        return this.scrollToOffset(this.pagingOffset + this.props.slots);
    }
    pageUp(): boolean {
        return this.scrollToOffset(this.pagingOffset - this.props.slots);
    }
    createTextBox(text: string, color: string, additionalStyle?: any): any {
        const style = {
            color,
            backgroundColor: "rgba(0, 0, 0, .5)",
            fontFamily: UI_FONT_FAMILY,
            fontSize: 12,
            fontWeight: UI_FONT_WEIGHT,
            paddingTop: 5,
            paddingBottom: 5,
            paddingLeft: 2,
            paddingRight: 4,
            ...additionalStyle,
        };
        if (typeof text === "string" && text.includes("\n")) {
            const lines = text.split(/\r?\n/);
            const fontSize = Math.max(1, style.fontSize ?? 12);
            const lineSpacing = 2;
            const canvas = document.createElement("canvas");
            const alphaContext = canvas.getContext("2d", {
                alpha: !style.backgroundColor || !!style.backgroundColor.match(/^rgba/),
            });
            if (!alphaContext) {
                throw new Error("Failed to create sidebar tag canvas context");
            }
            alphaContext.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
            let maxWidth = 0;
            const capHeight = alphaContext.measureText("A");
            const lineHeight = Math.ceil(capHeight.actualBoundingBoxAscent + capHeight.actualBoundingBoxDescent || fontSize * 1.2);
            for (const line of lines) {
                const metrics = alphaContext.measureText(line);
                maxWidth = Math.max(maxWidth, Math.ceil(Math.max(metrics.width, Math.abs(metrics.actualBoundingBoxLeft || 0) +
                    Math.abs(metrics.actualBoundingBoxRight || 0))));
            }
            const paddingLeft = style.paddingLeft ?? 0;
            const paddingRight = style.paddingRight ?? 0;
            const paddingTop = style.paddingTop ?? 0;
            const paddingBottom = style.paddingBottom ?? 0;
            const textHeight = lines.length * lineHeight + Math.max(0, lines.length - 1) * lineSpacing;
            canvas.width = Math.max(1, maxWidth + paddingLeft + paddingRight);
            canvas.height = Math.max(1, textHeight + paddingTop + paddingBottom);
            const context = canvas.getContext("2d", {
                alpha: !style.backgroundColor || !!style.backgroundColor.match(/^rgba/),
            });
            if (!context) {
                throw new Error("Failed to create sidebar tag render context");
            }
            if (style.backgroundColor) {
                context.fillStyle = style.backgroundColor;
                context.fillRect(0, 0, canvas.width, canvas.height);
            }
            context.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
            context.fillStyle = style.color;
            context.textAlign = "center";
            context.textBaseline = "top";
            const centerX = canvas.width / 2;
            const topY = (canvas.height - textHeight) / 2;
            const maxTextWidth = Math.max(1, canvas.width - paddingLeft - paddingRight);
            for (let index = 0; index < lines.length; index += 1) {
                context.fillText(lines[index], centerX + 0.5, topY + index * (lineHeight + lineSpacing) + 0.5, maxTextWidth);
            }
            return canvas;
        }
        return OverlayUtils.createTextBox(text, style);
    }
}

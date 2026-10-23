import { PointerLock } from "../util/PointerLock";
import { clamp } from "../util/math";
import { CompositeDisposable } from "../util/disposable/CompositeDisposable";
import { PointerSprite } from "./PointerSprite";
import { PointerEvents } from "./PointerEvents";
import { PointerType } from "../engine/type/PointerType";
import { SimpleRunner } from "../engine/animation/SimpleRunner";
import { Animation } from "../engine/Animation";
import { AnimProps } from "../engine/AnimProps";
import { IniSection } from "../data/IniSection";
import { BoxedVar } from "../util/BoxedVar";
import { CanvasMetrics } from "./CanvasMetrics";
interface Position {
    x: number;
    y: number;
}
export class Pointer {
    private pointerLock: PointerLock;
    private sprite: PointerSprite;
    private document: Document;
    private canvas: HTMLCanvasElement;
    private canvasMetrics: CanvasMetrics;
    private mouseAcceleration: BoxedVar<boolean>;
    private disposed = false;
    private restoringPosition = false;
    private handoff = 0;
    private userLockMode: boolean = false;
    private userPointerVisible: boolean = true;
    private userPermissionGranted: boolean = false;
    private position: Position = { x: 0, y: 0 };
    private disposables: CompositeDisposable = new CompositeDisposable();
    private pointerType: PointerType = PointerType.Default;
    private pointerSubFrame: number = 0;
    public pointerEvents?: PointerEvents;
    static factory(shpFile: any, palette: any, canvasContainer: any, document: Document, canvasMetrics: CanvasMetrics, mouseAcceleration: BoxedVar<boolean>): Pointer {
        const sprite = PointerSprite.fromShpFile(shpFile, palette);
        sprite.setVisible(false);
        const canvas = canvasContainer.getCanvas();
        const pointerLock = new PointerLock(canvas, document);
        const pointer = new Pointer(pointerLock, sprite, document, canvas, canvasMetrics, mouseAcceleration);
        pointer.pointerEvents = new PointerEvents(canvasContainer, pointer.getPosition(), document, canvasMetrics);
        pointer.disposables.add(pointer.pointerEvents);
        return pointer;
    }
    constructor(pointerLock: PointerLock, sprite: PointerSprite, document: Document, canvas: HTMLCanvasElement, canvasMetrics: CanvasMetrics, mouseAcceleration: BoxedVar<boolean>) {
        this.pointerLock = pointerLock;
        this.sprite = sprite;
        this.document = document;
        this.canvas = canvas;
        this.canvasMetrics = canvasMetrics;
        this.mouseAcceleration = mouseAcceleration;
        this.onMouseMove = this.onMouseMove.bind(this);
    }
    private onMouseMove = (event: MouseEvent): void => {
        if (this.restoringPosition) return;
        const position = this.position;
        if (this.pointerLock.isActive()) {
            const movement = this.canvasMetrics.toCanvasOffset(event.movementX, event.movementY);
            position.x += movement.x;
            position.y += movement.y;
        }
        else {
            // Canvas placement can change without a window resize.
            this.canvasMetrics.notifyViewportChange();
            const pointerPosition = this.canvasMetrics.toCanvasPosition(event.pageX, event.pageY);
            position.x = pointerPosition.x;
            position.y = pointerPosition.y;
        }
        position.x = clamp(position.x, 0, this.canvasMetrics.width - 1);
        position.y = clamp(position.y, 0, this.canvasMetrics.height - 1);
        this.updateSpritePosition();
    };
    getPosition(): Position {
        return this.position;
    }
    getPointerLock(): PointerLock {
        return this.pointerLock;
    }
    private requestLockOnCanvasClick = (): void => {
        if (this.userLockMode && !this.disposed) {
            this.pointerLock.request({ unadjustedMovement: !this.mouseAcceleration.value })
                .catch((error) => {
                    console.warn("Couldn't acquire pointer lock.", error);
                    if (this.userLockMode && !this.disposed) {
                        this.canvas.addEventListener("click", this.requestLockOnCanvasClick, { once: true });
                    }
                });
        }
    };
    private handleFirstCanvasClick = async (): Promise<void> => {
        if (!this.userPermissionGranted && !this.disposed) {
            try {
                await this.pointerLock.request();
                if (!this.userLockMode) {
                    await this.pointerLock.exit();
                }
                this.userPermissionGranted = true;
            }
            catch (error) {
                console.warn("Couldn't acquire initial pointer lock", error);
                if (this.userLockMode) this.listenForFirstCanvasClick();
            }
        }
    };
    private onPointerLockChange = (isActive: boolean): void => {
        this.sprite.setVisible(this.userPointerVisible && isActive);
        this.canvas.removeEventListener("click", this.requestLockOnCanvasClick);
        if (isActive) {
            this.canvas.removeEventListener("click", this.handleFirstCanvasClick);
        }
        else if (this.userLockMode && this.userPermissionGranted && !this.disposed) {
            this.canvas.addEventListener("click", this.requestLockOnCanvasClick, { once: true });
        }
    };
    init(): void {
        this.listenForFirstCanvasClick();
        this.pointerLock.onChange.subscribe(this.onPointerLockChange);
        this.document.addEventListener("mousemove", this.onMouseMove, true);
        this.disposables.add(() => {
            this.pointerLock.onChange.unsubscribe(this.onPointerLockChange);
            this.canvas.removeEventListener("click", this.requestLockOnCanvasClick);
            this.canvas.removeEventListener("click", this.handleFirstCanvasClick);
            this.document.removeEventListener("mousemove", this.onMouseMove, true);
        });
    }
    private listenForFirstCanvasClick(): void {
        this.canvas.removeEventListener("click", this.requestLockOnCanvasClick);
        if (!this.disposed) {
            this.canvas.addEventListener("click", this.handleFirstCanvasClick, { once: true });
        }
    }
    lock(): void {
        this.handoff++;
        this.document.defaultView?.desktopApp?.preparePointer().catch(error => console.error("Could not prepare the menu cursor", error));
        this.restoringPosition = false;
        this.userLockMode = true;
        if (this.userPermissionGranted) {
            this.pointerLock
                .request({
                unadjustedMovement: !this.mouseAcceleration.value,
            })
                .catch((error) => {
                console.warn("Couldn't reacquire pointer lock. Will attempt to require lock on next click", error);
                this.userPermissionGranted = false;
                if (this.userLockMode) this.listenForFirstCanvasClick();
            });
        }
        else {
            this.listenForFirstCanvasClick();
        }
    }
    unlock(preservePosition = false): void {
        this.userLockMode = false;
        this.canvas.removeEventListener("click", this.requestLockOnCanvasClick);
        this.canvas.removeEventListener("click", this.handleFirstCanvasClick);
        const view = this.document.defaultView;
        const restore = preservePosition && this.pointerLock.isActive() && view?.desktopApp;
        const token = ++this.handoff;
        const saved = { ...this.position };
        const rect = this.canvas.getBoundingClientRect();
        const normalized = view && {
            x: clamp((rect.left + saved.x * rect.width / this.canvasMetrics.width) / view.innerWidth, 0, 1),
            y: clamp((rect.top + saved.y * rect.height / this.canvasMetrics.height) / view.innerHeight, 0, 1),
        };
        this.restoringPosition = !!restore;
        this.pointerLock.exit().then(async () => {
            if (restore && normalized && token === this.handoff && !this.disposed && !this.userLockMode) {
                const result = await restore.restorePointer(normalized);
                if (result.restored && token === this.handoff) {
                    Object.assign(this.position, saved);
                    this.updateSpritePosition();
                }
            }
        }).catch(error => console.error("Could not release or restore the menu cursor", error))
            .finally(() => { if (token === this.handoff) this.restoringPosition = false; });
    }
    setVisible(visible: boolean): void {
        this.userPointerVisible = visible;
        this.sprite.setVisible(visible && this.pointerLock.isActive());
    }
    getUserLockMode(): boolean {
        return this.userLockMode;
    }
    getSprite(): PointerSprite {
        return this.sprite;
    }
    setPointerType(type: PointerType, subFrame: number = 0): void {
        if (this.pointerType !== type || this.pointerSubFrame !== subFrame) {
            this.pointerType = type;
            this.pointerSubFrame = subFrame;
            this.sprite.setAnimationRunner(undefined);
            if ([
                PointerType.Scroll,
                PointerType.NoScroll,
                PointerType.Pan,
            ].includes(type)) {
                this.sprite.setFrame(type + subFrame);
            }
            else {
                const startFrame = type;
                const endFrame = (Object.keys(PointerType)
                    .map(Number)
                    .find((value) => !Number.isNaN(value) && type < value) ??
                    this.sprite.getFrameCount()) - 1;
                this.sprite.setFrame(startFrame);
                if (startFrame < endFrame) {
                    const runner = new SimpleRunner();
                    const animProps = new AnimProps(new IniSection("dummy"), this.sprite.getFrameCount());
                    animProps.loopCount = -1;
                    animProps.start = startFrame;
                    animProps.loopStart = startFrame;
                    animProps.loopEnd = endFrame;
                    const animation = new Animation(animProps, new BoxedVar(1.5));
                    runner.animation = animation;
                    this.sprite.setAnimationRunner(runner);
                }
            }
            this.updateSpritePosition();
        }
    }
    private updateSpritePosition(): void {
        const position = { ...this.position };
        const size = this.sprite.getSize();
        const halfWidth = Math.floor(size.width / 2);
        const halfHeight = Math.floor(size.height / 2);
        if (this.pointerType > PointerType.Mini) {
            position.x -= halfWidth;
            position.y -= halfHeight;
        }
        if ([
            PointerType.Scroll,
            PointerType.NoScroll,
            PointerType.Pan,
        ].includes(this.pointerType)) {
            position.x = clamp(position.x, 0, this.canvasMetrics.width - 1 - size.width);
            position.y = clamp(position.y, 0, this.canvasMetrics.height - 1 - size.height);
        }
        this.sprite.setPosition(position.x, position.y);
    }
    dispose(): void {
        this.disposed = true;
        this.disposables.dispose();
    }
}

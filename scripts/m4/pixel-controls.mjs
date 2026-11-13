// Serialized into either frozen runtime. Never run during formal timing.
export function installStaticUiClock() {
    const renderer = window.__ra2debug.mainMenu.jsxRenderer, prototype = Object.getPrototypeOf(renderer);
    const render = prototype.render, patched = new WeakSet(), initialized = new WeakSet();
    const clock = window.__m4StaticUiClock = { sidebarTabTime: 1000, handlers: 0, instances: 0, calls: 0, phases: [] };
    const visit = element => {
        if (Array.isArray(element)) { element.forEach(visit); return; }
        if (!element?.isJsxElement) return;
        const component = typeof element.type === 'function' && element.type.prototype;
        if (component?.handleFrame && String(component.handleFrame).includes('lastFlashUpdate') && !patched.has(component)) {
            const handle = component.handleFrame;
            component.handleFrame = function(_now, ...args) {
                if (!initialized.has(this)) {
                    this.lastFlashUpdate = undefined; this.flashing = false;
                    initialized.add(this); clock.instances++;
                }
                clock.calls++;
                const result = handle.call(this, clock.sidebarTabTime, ...args);
                const tab = args[1], baseFrame = args[2];
                clock.phases[baseFrame] = { baseFrame, lastFlashUpdate: this.lastFlashUpdate, flashing: this.flashing,
                    tabId: tab.id, tabFlashing: tab.flashing, disabled: tab.disabled, items: tab.items.length,
                    active: this.props.sidebarModel.activeTab === tab, frame: args[0].getFrame() };
                return result;
            };
            patched.add(component); clock.handlers++;
        }
        visit(element.props?.children);
    };
    prototype.render = function(element) { visit(element); return render.call(this, element); };
}

export async function captureStaticPixels({ shadowCompare = false } = {}) {
    const d = window.__ra2debug, renderer = d.renderer, g = d.game;
    d.gameScreen.gameAnimationLoop.stop(); d.gameScreen.gameTurnMgr.setPaused(true);
    d.gameScreen.uiAnimationLoop.stop();
    d.worldScene.animationClock.update = () => 0;
    const before = { tick: g.currentTick, state: g.debugGetState(), rng: g.prng.snapshot(), hash: g.getHash() };
    const gl = renderer.renderer.getContext(), width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const base = window.__m4Scene.panBase, images = [];
    const bytes = () => {
        renderer.render();
        const result = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, result); return result;
    };
    const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))]
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
    const png = value => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const pixels = new Uint8ClampedArray(value.length), stride = width * 4;
        for (let y = 0; y < height; y++) pixels.set(value.subarray(y * stride, (y + 1) * stride), (height - 1 - y) * stride);
        canvas.getContext('2d').putImageData(new ImageData(pixels, width, height), 0, 0);
        return canvas.toDataURL();
    };
    for (const [label, offset] of [['center', [0, 0]], ['leave', [-1400, -700]], ['reenter', [0, 0]], ['opposite', [1000, 450]]]) {
        d.worldScene.cameraPan.setPan({ x: base.x + offset[0], y: base.y + offset[1] });
        // Fixed update time and interpolation; publish asynchronous demand and
        // worker results without advancing a simulation tick.
        for (let i = 0; i < 160; i++) {
            renderer.update(1000, 0); renderer.render();
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        renderer.update(1000, 0);
        const first = bytes(), repeated = bytes();
        let differentBytes = 0;
        for (let i = 0; i < first.length; i++) if (first[i] !== repeated[i]) differentBytes++;
        let shadowComparison;
        if (shadowCompare) {
            renderer.setVehicleShadowInstancing(false); const off = bytes();
            renderer.setVehicleShadowInstancing(true); const on = bytes();
            let changed = 0;
            for (let i = 0; i < off.length; i++) if (off[i] !== on[i]) changed++;
            shadowComparison = { differentBytes: changed, baselineSha256: await digest(off),
                candidateSha256: await digest(on), batches: renderer.vehicleShadowDiagnostics() };
        }
        images.push({ label, tick: g.currentTick, camera: d.worldScene.cameraPan.getPan(),
            bytes: first.length, sha256: await digest(first), repeatedSha256: await digest(repeated),
            differentBytes, shadowComparison, png: png(first), hdVehicles: d.renderableManager.getRenderableContainer().getChildren()
                .filter(renderable => renderable.unitVxlHd?.active).length });
    }
    const after = { tick: g.currentTick, state: g.debugGetState(), rng: g.prng.snapshot(), hash: g.getHash() };
    return { schema: 'm4-static-pixel-control-v1', width, height, images, before, after,
        worldViewport: { ...d.worldScene.viewport },
        visualRandom: window.__m4StaticRandom, uiClock: window.__m4StaticUiClock,
        simulationUnchanged: JSON.stringify(before) === JSON.stringify(after),
        scope: 'Tick-zero scene, fixed update time/interpolation; compare captures between frozen baseline and final runtimes.' };
}

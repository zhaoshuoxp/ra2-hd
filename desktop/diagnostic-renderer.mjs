// Serialized into the isolated game's main world. No Node or filesystem access.
export function installDiagnosticProbe() {
    if (window.__ra2WinDiagnostic) return;
    const root = window.__ra2debug;
    const clone = value => value === undefined || typeof value === 'function' ? null : JSON.parse(JSON.stringify(value));
    const hooks = new WeakSet();
    let active, game, route, simMs = 0, simCalls = 0, updateMs = 0, stamp, lastStamp;
    const snapshot = () => {
        const d = window.__ra2debug, renderer = d.renderer, webgl = renderer?.renderer;
        const gl = webgl?.getContext(), debug = gl?.getExtension('WEBGL_debug_renderer_info');
        let nodes = 0, visibleNodes = 0, hdNodes = 0;
        d.worldScene?.scene.traverse(object => {
            nodes++;
            if (/hd/i.test(object.name)) hdNodes++;
        });
        d.worldScene?.scene.traverseVisible(() => { visibleNodes++; });
        const renderables = d.renderableManager?.getRenderableContainer().getChildren() ?? [];
        const bindings = renderables.map(r => {
            const builder = r.mainObj?.builder ?? r.shpRenderable?.builder;
            const batched = r.gameObject && (d.mapRenderable?.terrainLayer.getObjectHdBinding(r.gameObject)
                ?? d.mapRenderable?.overlayLayer.getObjectHdBinding(r.gameObject));
            const vxl = r.unitVxlHd?.family?.identity;
            return { identity: r.gameObject?.name ?? r.unit?.name ?? r.unitVxlHd?.family?.identity ?? null,
                vxl: vxl ?? null, vxlDensity: vxl ? d.sovietUnitsHd?.families[vxl]?.density ?? null : null,
                shp: builder?.hdOverride?.identity ?? batched?.identity ?? null,
                batchedFrame: batched?.frame ?? null, hdPageBound: !!builder?.getHdPage?.(), rhino: !!r.rhinoHd };
        });
        const graphics = d.generalOptions?.graphics;
        return { tick: d.game?.currentTick, players: d.game?.getCombatants().length,
            gameId: d.game?.id, startTimestamp: d.game?.startTimestamp,
            bots: d.game?.botManager.bots.size, gameOptions: clone(d.game?.gameOpts),
            desiredSpeed: d.game?.desiredSpeed?.value,
            graphics: graphics && { enabled: graphics.hdEnabled.value, density: graphics.hdDensity.value,
                models: graphics.models.value, shadows: graphics.shadows.value,
                renderResolution: graphics.renderResolution.value, resolution: graphics.resolution.value },
            performanceOptions: d.performance?.getOptions(), nodes, visibleNodes, hdNodes,
            renderables: renderables.length, bindings, output: clone(renderer?.outputMetrics),
            logicalSize: [renderer?.width, renderer?.height], viewport: [innerWidth, innerHeight],
            devicePixelRatio, visibility: document.visibilityState, focused: document.hasFocus(),
            gpuRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'UNAVAILABLE',
            glVersion: gl?.getParameter(gl.VERSION), context: gl?.getContextAttributes(),
            threeMemory: clone(webgl?.info.memory), shaderProgramCount: webgl?.info.programs?.length,
            appAccountedAllocations: Object.fromEntries(['terrainHd', 'environmentHd', 'sovietUnitsHd',
                'conscriptHd', 'powerPlantHd', 'napowrHd', 'sovietBuildingsHd', 'rhinoHd', 'preparedHdCache']
                .map(key => [key, clone(d[key])])),
            uiAllocation: clone(d.uiArt?.metrics?.()),
            gpuTime: 'UNAVAILABLE', actualProcessVram: 'UNAVAILABLE',
            queueWait: 'UNAVAILABLE', decodeCpuTime: 'UNAVAILABLE',
            materialAndProgramSwitches: 'UNAVAILABLE_LIGHTWEIGHT', gc: 'TRACE_ONLY',
        };
    };
    const hookLoop = loop => {
        if (!loop || hooks.has(loop)) return;
        hooks.add(loop);
        const tick = loop.tickGame;
        loop.tickGame = function (...args) {
            if (active?.frozen) return true;
            if (!active) return tick.apply(this, args);
            const at = performance.now();
            try { return tick.apply(this, args); }
            finally { simMs += performance.now() - at; simCalls++; }
        };
    };
    const hookScreen = screen => {
        if (!screen || hooks.has(screen)) return;
        hooks.add(screen);
        let loop = screen.gameAnimationLoop;
        Object.defineProperty(screen, 'gameAnimationLoop', { configurable: true, enumerable: true,
            get: () => loop, set: value => { loop = value; hookLoop(value); } });
        hookLoop(loop);
    };
    const hookRenderer = renderer => {
        if (!renderer || hooks.has(renderer)) return;
        hooks.add(renderer);
        const update = renderer.update, render = renderer.render;
        renderer.update = function (...args) {
            if (!active || root.game?.status !== 1 || !root.worldScene || !root.gameScreen?.gameAnimationLoop?.isStarted)
                return update.apply(this, args);
            const current = root.game;
            if (game !== current) {
                game = current; lastStamp = undefined;
                route = { ...root.worldScene.cameraPan.getPan() };
                active.firstGameFrameAt = performance.now(); active.tickStart = current.currentTick;
                active.cameraRoute = active.manualCamera ? { mode: 'manual-input', start: { ...route } } : { base: { ...route }, xOffset: -350, yOffset: 150,
                    xAmplitude: 350, yAmplitude: 150, timeDivisorSeconds: .9 };
                active.startState = { tick: current.currentTick, output: clone(renderer.outputMetrics),
                    shaderProgramCount: renderer.renderer.info.programs?.length,
                    workerPreparation: clone(root.sovietUnitsHd?.preparation),
                    preparedHdCache: clone(root.preparedHdCache) };
            }
            stamp = args[0];
            const seconds = (performance.now() - active.firstGameFrameAt) / 1000;
            if (!active.manualCamera) root.worldScene.cameraPan.setPan({ x: route.x - 350 + Math.sin(seconds / .9) * 350,
                y: route.y + 150 + Math.cos(seconds / .9) * 150 });
            const at = performance.now();
            try { return update.apply(this, args); }
            finally { updateMs = performance.now() - at; }
        };
        renderer.render = function (...args) {
            if (!active || !game || root.game !== game) return render.apply(this, args);
            const info = renderer.renderer.info, autoReset = info.autoReset;
            info.autoReset = false; info.reset();
            const at = performance.now();
            try { return render.apply(this, args); }
            finally {
                active.rows.push([stamp, lastStamp === undefined ? null : stamp - lastStamp,
                    simMs, simCalls, updateMs, performance.now() - at, info.render.calls, info.render.triangles]);
                info.autoReset = autoReset; lastStamp = stamp; simMs = 0; simCalls = 0;
            }
        };
    };
    for (const [key, hook] of [['renderer', hookRenderer], ['gameScreen', hookScreen]]) {
        let value = root[key];
        Object.defineProperty(root, key, { configurable: true, enumerable: true,
            get: () => value, set: next => { value = next; hook(next); } });
        hook(value);
    }
    const api = {
        snapshot,
        begin(label, frozen = false) {
            if (active) throw Error('A diagnostic phase is already active');
            game = undefined; lastStamp = undefined; simMs = 0; simCalls = 0;
            active = { label: api.traceOccurred && !label.startsWith('instrumented') ? `instrumented-${label}` : label,
                frozen, armedAt: performance.now(), rows: [],
                columns: ['rafTimestampMs', 'frameIntervalMs', 'simulationCpuMs', 'simulationCalls',
                    'renderUpdateCpuMs', 'renderSubmissionCpuMs', 'drawCalls', 'triangles'],
                visibilityEvents: [], focusEvents: [], resizeEvents: [] };
            if (label.startsWith('manual-') || label === 'instrumented-cpu-multiprocess-trace') active.manualCamera = true;
            api.manualCapturePhase = active.manualCamera ? { label: active.label, status: 'CAPTURING' } : null;
        },
        end() {
            if (!active) throw Error('No diagnostic phase is active');
            const result = active;
            result.elapsedMs = performance.now() - (result.firstGameFrameAt ?? result.armedAt);
            result.loadingToFirstGameFrameMs = result.firstGameFrameAt === undefined ? null : result.firstGameFrameAt - result.armedAt;
            result.endState = snapshot();
            result.tickEnd = root.game?.currentTick;
            if (result.manualCamera) {
                if (result.cameraRoute && root.worldScene) result.cameraRoute.end = { ...root.worldScene.cameraPan.getPan() };
                api.manualCapturePhase.status = 'COMPLETE';
            }
            active = undefined;
            if (!result.manualCamera && route && root.worldScene) root.worldScene.cameraPan.setPan(route);
            return result;
        },
        startDetailed() {
            if (api.detailed) throw Error('Detailed GL capture already active');
            if (!root.renderer?.renderer) return;
            const webgl = root.renderer.renderer, gl = webgl.getContext(), restores = [];
            const report = { methods: {}, programChanges: 0, textureUploadBytes: 'UNAVAILABLE',
                interpretation: 'CPU WebGL call durations and counts; no GPU execution timing or residency measurement.' };
            if (typeof webgl.state?.setMaterial === 'function') {
                const state = webgl.state, original = state.setMaterial;
                let lastMaterial;
                report.materialCalls = 0; report.materialChanges = 0;
                state.setMaterial = function (material, ...args) {
                    report.materialCalls++;
                    if (material !== lastMaterial) { report.materialChanges++; lastMaterial = material; }
                    return original.call(this, material, ...args);
                };
                restores.push(() => { state.setMaterial = original; });
            } else report.materialChanges = 'UNAVAILABLE';
            let lastProgram;
            for (const name of ['useProgram', 'compileShader', 'linkProgram', 'getProgramInfoLog',
                'texImage2D', 'texSubImage2D', 'compressedTexImage2D', 'compressedTexSubImage2D']) {
                const original = gl[name];
                if (typeof original !== 'function') continue;
                const metric = report.methods[name] = { calls: 0, cpuMs: 0, maximumCpuMs: 0 };
                gl[name] = function (...args) {
                    if (name === 'useProgram' && lastProgram !== args[0]) { report.programChanges++; lastProgram = args[0]; }
                    const at = performance.now();
                    try { return original.apply(this, args); }
                    finally {
                        const elapsed = performance.now() - at;
                        metric.calls++; metric.cpuMs += elapsed; metric.maximumCpuMs = Math.max(metric.maximumCpuMs, elapsed);
                    }
                };
                restores.push(() => { gl[name] = original; });
            }
            api.detailed = { report, restores };
        },
        endDetailed() {
            const detailed = api.detailed;
            if (!detailed) return null;
            detailed.restores.forEach(restore => restore()); delete api.detailed;
            return detailed.report;
        },
        setTraceActive(value) {
            api.traceActive = value;
            if (value) api.traceOccurred = true;
            if (value && active && !active.label.startsWith('instrumented')) active.label = `instrumented-${active.label}`;
        },
    };
    document.addEventListener('visibilitychange', () => active?.visibilityEvents.push(document.visibilityState));
    addEventListener('focus', () => active?.focusEvents.push('focus'));
    addEventListener('blur', () => active?.focusEvents.push('blur'));
    addEventListener('resize', () => active?.resizeEvents.push([innerWidth, innerHeight, devicePixelRatio]));
    window.__ra2WinDiagnostic = api;
}

// Serialized into the live page; diagnostic windows only.
export function diagnoseVehicleShadows() {
    const d = window.__ra2debug, renderer = d.renderer, r = renderer.renderer, gl = r.getContext();
    const groups = new Map(), draws = [], times = [], candidates = new Set();
    const renderables = d.renderableManager.getRenderableContainer().getChildren();
    for (const item of renderables) {
        if (!item.gameObject?.isVehicle()) continue;
        for (const builder of item.vxlBuilders ?? [])
            for (const mesh of builder.sections?.values() ?? []) candidates.add(mesh);
    }
    const direct = r.renderBufferDirect, shadowRender = r.shadowMap.render;
    let shadowMs = 0, shadowCalls = 0;
    renderer.setVehicleShadowDiagnosticTiming?.(true);
    r.shadowMap.render = function(...args) {
        const start = performance.now();
        try { return shadowRender.apply(this, args); }
        finally { shadowMs += performance.now() - start; }
    };
    r.renderBufferDirect = function(camera, scene, geometry, material, object, group) {
        const shadow = r.getRenderTarget() !== null;
        if (shadow) shadowCalls++;
        if (!times.length) {
            const hidden = !Array.isArray(object.material) && object.material.colorWrite === false
                && object.material.depthWrite === false;
            const row = { pass: shadow ? 'shadow' : 'colour', vehicle: candidates.has(object), hidden,
                geometry: geometry.id, customDepth: !!object.customDepthMaterial, instanced: !!object.isInstancedMesh,
                instances: object.isInstancedMesh ? object.count : 1, name: object.name,
                clipShadows: !!object.material.clipShadows, planes: object.material.clippingPlanes?.length ?? 0,
                layers: object.layers.mask, side: material.side };
            draws.push(row);
            if (shadow && row.vehicle && hidden) {
                const key = [geometry.id, material.side, row.customDepth, row.clipShadows, row.layers].join(':');
                groups.set(key, (groups.get(key) ?? 0) + 1);
            }
        }
        return direct.call(this, camera, scene, geometry, material, object, group);
    };
    try {
        for (let i = 0; i < 24; i++) {
            shadowMs = 0; shadowCalls = 0;
            const start = performance.now(); renderer.render();
            times.push({ totalSubmitMs: performance.now() - start, shadowSubmitMs: shadowMs, shadowCalls,
                batches: renderer.vehicleShadowDiagnostics?.() ?? null });
        }
    } finally {
        r.renderBufferDirect = direct; r.shadowMap.render = shadowRender;
        renderer.setVehicleShadowDiagnosticTiming?.(false);
    }
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const paired = [];
    if (renderer.setVehicleShadowInstancing) {
        const enabled = renderer.vehicleShadowDiagnostics().enabled;
        const bufferData = gl.bufferData, bufferSubData = gl.bufferSubData;
        const autoReset = r.info.autoReset;
        let inShadow = false, uploadMs = 0, uploadCalls = 0, uploadBytes = 0, shadowDraws = 0, colourDraws = 0;
        r.info.autoReset = false;
        r.renderBufferDirect = function(...args) {
            if (inShadow) shadowDraws++; else colourDraws++;
            return direct.apply(this, args);
        };
        for (const [name, original] of [['bufferData', bufferData], ['bufferSubData', bufferSubData]]) {
            gl[name] = function(...args) {
                if (!inShadow || args[0] !== gl.ARRAY_BUFFER) return original.apply(this, args);
                const start = performance.now(), data = args[name === 'bufferData' ? 1 : 2];
                try { return original.apply(this, args); }
                finally {
                    uploadMs += performance.now() - start; uploadCalls++;
                    uploadBytes += typeof data === 'number' ? data : name === 'bufferSubData' && args[4] !== undefined
                        ? args[4] * data.BYTES_PER_ELEMENT : data.byteLength;
                }
            };
        }
        renderer.setVehicleShadowDiagnosticTiming(true);
        try {
            for (const mode of [false, true, true, false]) {
                renderer.setVehicleShadowInstancing(mode);
                for (let i = 0; i < 16; i++) renderer.render();
                for (let i = 0; i < 16; i++) {
                    shadowMs = 0; uploadMs = 0; uploadCalls = 0; uploadBytes = 0; shadowDraws = 0; colourDraws = 0;
                    r.info.reset();
                    r.shadowMap.render = function(...args) {
                        const start = performance.now(); inShadow = true;
                        try { return shadowRender.apply(this, args); }
                        finally { shadowMs += performance.now() - start; inShadow = false; }
                    };
                    const start = performance.now(); renderer.render();
                    paired.push({ enabled: mode, submitMs: performance.now() - start, shadowMs, uploadMs, uploadCalls, uploadBytes,
                        shadowDraws, colourDraws, fullFrame: { ...r.info.render },
                        batches: renderer.vehicleShadowDiagnostics() });
                    r.shadowMap.render = shadowRender;
                }
            }
        } finally {
            r.shadowMap.render = shadowRender;
            r.renderBufferDirect = direct; r.info.autoReset = autoReset;
            gl.bufferData = bufferData; gl.bufferSubData = bufferSubData;
            renderer.setVehicleShadowInstancing(enabled);
            renderer.setVehicleShadowDiagnosticTiming(false);
        }
    }
    return { schema: 'm4-3a-shadow-diagnostic-v1', tick: d.game.currentTick,
        capability: { webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
            version: gl.getParameter(gl.VERSION), shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
            legacyAngleExtension: !!gl.getExtension('ANGLE_instanced_arrays'),
            drawElementsInstanced: typeof gl.drawElementsInstanced === 'function',
            vertexAttribDivisor: typeof gl.vertexAttribDivisor === 'function', supportsInstancing: renderer.supportsInstancing(),
            backend: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'UNAVAILABLE' },
        vehicleMeshes: candidates.size, draws, compatibleGroups: [...groups].map(([key, count]) => ({ key, count })),
        times, paired, batches: renderer.vehicleShadowDiagnostics?.() ?? null,
        gpuTime: 'UNAVAILABLE', presentationCount: 'UNAVAILABLE', actualVram: 'UNAVAILABLE',
        scope: 'Paused native scene; first frame classified and 24 CPU submission samples; no formal timing.' };
}

// Browser-only diagnostic installed by Playwright, never shipped in the application.
export function installDisplayProbe() {
    const d = window.__ra2debug;
    const renderer = d.renderer.renderer, canvas = renderer.domElement, gl = renderer.getContext();
    const models = () => {
        const plant = d.renderableManager.getRenderableByGameObject(window.__m12Plant);
        return [plant.mainObj, ...[...plant.animObjects.values()].flat(),
            ...window.__m11Units.map(u => d.renderableManager.getRenderableByGameObject(u).shpRenderable)]
            .filter(m => m?.get3DObject()?.visible && m.builder?.hdOverride);
    };
    function geometry(model) {
        const mesh = model.getShapeMesh(), b = model.builder, v = d.worldScene.viewport;
        const points = [];
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
            const p = d.worldScene.camera.position.clone().fromBufferAttribute(mesh.geometry.attributes.position, i)
                .applyMatrix4(mesh.matrixWorld).project(d.worldScene.camera);
            points.push([v.x + (p.x + 1) * v.width / 2, v.y + (1 - p.y) * v.height / 2]);
        }
        const bounds = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
            Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
        const rect = canvas.getBoundingClientRect(), logical = [Number(canvas.dataset.logicalWidth), Number(canvas.dataset.logicalHeight)];
        return { frame: b.getFrame(), offset: b.frameOffset, identity: b.hdOverride.identity,
            bounds, displayBounds: bounds.map((n, i) => n * (i % 2 ? rect.height / logical[1] : rect.width / logical[0])),
            vertices: Array.from(mesh.geometry.attributes.position.array), shadow: !!model.getShadowMesh() };
    }
    function capture(mode, png = false) {
        d.generalOptions.graphics.renderResolution.value = mode;
        const draws = [], originals = new Map(), originalRender = renderer.render;
        let inWorld = false;
        renderer.render = function(scene, ...args) {
            inWorld = scene === d.worldScene.scene;
            try { return originalRender.call(this, scene, ...args); } finally { inWorld = false; }
        };
        for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
            originals.set(name, gl[name]);
            gl[name] = function(...args) {
                if (inWorld) draws.push({ viewport: Array.from(gl.getParameter(gl.VIEWPORT)),
                    defaultFramebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING) === null });
                return originals.get(name).apply(this, args);
            };
        }
        const start = performance.now();
        try { d.renderer.render(); gl.finish(); } finally {
            renderer.render = originalRender;
            for (const [name, fn] of originals) gl[name] = fn;
        }
        const c = d.worldScene.camera, rect = canvas.getBoundingClientRect();
        const logical = [Number(canvas.dataset.logicalWidth), Number(canvas.dataset.logicalHeight)];
        const hud = d.gameScreen.hud;
        function uiBounds(object) {
            const points = [], camera = d.uiScene.camera ?? d.uiScene.getCamera();
            (object?.getUiObject?.() ?? object)?.get3DObject()?.traverseVisible(mesh => {
                const positions = mesh.geometry?.attributes.position;
                if (!positions) return;
                for (let i = 0; i < positions.count; i++) {
                    const p = camera.position.clone().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(camera);
                    points.push([(p.x + 1) * logical[0] / 2, (1 - p.y) * logical[1] / 2]);
                }
            });
            return points.length ? [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
                Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))] : null;
        }
        const ui = Object.fromEntries(['sidebarTop', 'sidebarRadar', 'sidebarCard', 'sidebarMenu', 'sidebarPower']
            .map(key => [key, uiBounds(hud[key])]));
        ui.commandButtons = hud.commandBarButtons.map(uiBounds);
        return { mode, tick: d.game.currentTick, buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
            output: d.renderer.outputMetrics, ratio: renderer.getPixelRatio(), dpr: devicePixelRatio,
            visualScale: visualViewport.scale, logical, display: [rect.x, rect.y, rect.width, rect.height], ui,
            camera: { position: c.position.toArray(), projection: c.projectionMatrix.toArray(),
                bounds: [c.left, c.right, c.top, c.bottom], zoom: c.zoom, rotation: c.rotation.toArray() },
            viewport: { ...d.worldScene.viewport }, models: models().map(geometry),
            target: d.helpers.getOwnedUnitClickPointById(window.__m11Units[0].id),
            hd: [d.conscriptHd, d.powerPlantHd],
            units: window.__m11Units.map(u => ({ id: u.id, moving: u.isMoving, firing: u.isFiring, owner: u.owner.name })),
            buildingHealth: window.__m12Plant.healthTrait.health,
            draws, glError: gl.getError(),
            renderAndFinishMs: performance.now() - start, gpuObjects: { ...renderer.info.memory },
            png: png ? canvas.toDataURL('image/png') : undefined };
    }
    function rebuildBatches() {
        const manager = d.worldScene.meshBatchManager;
        manager.updateMeshes();
        manager.processRenderQueue();
        d.worldScene.scene.updateMatrixWorld(true);
    }
    function artworkPair() {
        rebuildBatches();
        const hd = capture('4k', true), substitutions = [];
        try {
            for (const model of models()) {
                const b = model.builder, mesh = model.getShapeMesh();
                const original = new b.constructor(b.shpFile, b.palette, b.camera, b.scale, b.depth, b.depthOffset);
                // Rebuild only the native indexed body using the exact source/settings.
                for (const key of ['batchPalettes', 'useMeshBatching', 'opacity', 'forceTransparent', 'offset',
                    'frameOffset', 'flat', 'uiAnchorCompensation', 'shpSize', 'extraLight', 'align']) original[key] = b[key];
                original.setFrame(b.getFrame());
                const native = original.build();
                if (JSON.stringify([...native.geometry.attributes.position.array]) !== JSON.stringify([...mesh.geometry.attributes.position.array]))
                    throw Error('Indexed comparison changed geometry');
                substitutions.push({ mesh, geometry: mesh.geometry, material: mesh.material, original });
                mesh.geometry = native.geometry; mesh.material = native.material;
            }
            rebuildBatches();
            const original = capture('4k', true);
            return { hd, original };
        } finally {
            for (const s of substitutions) { s.mesh.geometry = s.geometry; s.mesh.material = s.material; }
            rebuildBatches(); d.renderer.render();
            for (const s of substitutions) s.original.dispose();
            const restored = canvas.toDataURL('image/png');
            if (restored !== hd.png) {
                window.__m14RestoreFailure = { before: hd.png, restored };
                throw Error('Artwork comparison did not restore exactly');
            }
        }
    }
    window.__m14 = { capture, artworkPair };
}

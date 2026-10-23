// Serialized into the C6 renderer; capture data only during its existing F9 trace.
export function installShaderIdentityProbe(identity) {
    const api = window.__ra2WinDiagnostic;
    if (!api || api.shaderIdentityInstalled) throw Error('Shader identity probe is unavailable or already installed');
    const start = api.startDetailed, end = api.endDetailed;
    api.shaderIdentityInstalled = identity;
    api.startDetailed = function (...args) {
        const result = start.apply(this, args);
        if (!api.detailed) throw Error('The C6 detailed GL probe did not start');
        const d = window.__ra2debug, renderer = d.renderer.renderer, gl = renderer.getContext();
        const report = { schemaVersion: 1, identity, status: 'CAPTURING',
            boundary: 'Bounded opt-in shader/material ownership instrumentation. CPU timings are instrumented; no GPU timing or residency measurement.',
            limits: { eventsPerKind: 64, sourceCharacters: 8 * 1024 * 1024 },
            links: [], waits: [], firstUses: [], deletions: [], dropped: {}, sourceCharacters: 0 };
        api.detailed.report.shaderIdentity = report;
        const shaders = new WeakMap(), attachments = new WeakMap(), ids = new WeakMap(), used = new WeakSet();
        const owners = [], restores = []; let active, serial = 0;
        const stamp = () => ({ atMs: performance.now(), tick: d.game?.currentTick ?? null,
            playing: !!d.gameScreen?.gameAnimationLoop?.isStarted });
        const id = program => { if (!ids.has(program)) ids.set(program, ++serial); return ids.get(program); };
        const append = (kind, row) => {
            if (report[kind].length < report.limits.eventsPerKind) report[kind].push(row);
            else report.dropped[kind] = (report.dropped[kind] ?? 0) + 1;
        };
        const texture = value => value ? { uuid: value.uuid, name: value.name,
            width: value.image?.width, height: value.image?.height, format: value.format, type: value.type } : null;
        const materialInfo = material => material ? { type: material.type, id: material.id, name: material.name,
            defines: { ...material.defines }, customKey: material.customProgramCacheKey(),
            transparent: material.transparent, side: material.side, forceSinglePass: material.forceSinglePass,
            alphaTest: material.alphaTest, clippingPlanes: material.clippingPlanes?.length ?? 0,
            hdPass: material.uniforms?.hdPass?.value, hdFiltering: material.uniforms?.hdFiltering?.value,
            map: texture(material.map), palette: texture(material.palette),
            particleTexture: texture(material.uniforms?.particleTexture?.value) } : null;
        const objectInfo = object => {
            if (!object) return null;
            const parents = []; let parent = object;
            while (parent && parents.length < 6) {
                parents.push({ id: parent.id, name: parent.name, type: parent.type }); parent = parent.parent;
            }
            return { id: object.id, name: object.name, type: object.type, parents, castShadow: object.castShadow,
                attributes: Object.keys(object.geometry?.attributes ?? {}), drawRange: { ...object.geometry?.drawRange } };
        };
        const patch = (target, name, factory) => {
            const original = target[name];
            if (typeof original !== 'function') throw Error(`Missing shader capture API: ${name}`);
            target[name] = factory(original); restores.push(() => { target[name] = original; });
        };
        try {
            patch(renderer, 'renderBufferDirect', original => function (...values) {
                const previous = active; active = { material: values[3], object: values[4] };
                try { return original.apply(this, values); } finally { active = previous; }
            });
            patch(gl, 'shaderSource', original => function (shader, source) {
                if (report.sourceCharacters + source.length <= report.limits.sourceCharacters) {
                    shaders.set(shader, source); report.sourceCharacters += source.length;
                } else report.dropped.sources = (report.dropped.sources ?? 0) + 1;
                return original.call(this, shader, source);
            });
            patch(gl, 'attachShader', original => function (program, shader) {
                if (!attachments.has(program)) attachments.set(program, []);
                if (attachments.get(program).length < 2) attachments.get(program).push(shader);
                return original.call(this, program, shader);
            });
            patch(gl, 'linkProgram', original => function (program) {
                if (report.links.length < report.limits.eventsPerKind) {
                    const row = { ...stamp(), program: id(program), material: materialInfo(active?.material),
                        object: objectInfo(active?.object), sources: (attachments.get(program) ?? [])
                            .map(shader => shaders.get(shader) ?? null), familyMatchesAtCaptureEnd: [] };
                    append('links', row); owners.push({ row, material: active?.material });
                } else report.dropped.links = (report.dropped.links ?? 0) + 1;
                return original.call(this, program);
            });
            patch(gl, 'getProgramInfoLog', original => function (program) {
                const at = performance.now();
                try { return original.call(this, program); }
                finally { append('waits', { ...stamp(), program: id(program), cpuMs: performance.now() - at,
                    material: materialInfo(active?.material), object: objectInfo(active?.object) }); }
            });
            patch(gl, 'useProgram', original => function (program) {
                if (program && ids.has(program) && !used.has(program)) {
                    used.add(program); append('firstUses', { ...stamp(), program: ids.get(program) });
                }
                return original.call(this, program);
            });
            patch(gl, 'deleteProgram', original => function (program) {
                if (program && ids.has(program)) append('deletions', { ...stamp(), program: ids.get(program) });
                return original.call(this, program);
            });
            report.started = stamp(); report.shaderChecksEnabled = renderer.debug.checkShaderErrors;
            api.detailed.shaderIdentityFinish = () => {
                // Resolve family hints at capture end, outside the measured link call.
                const renderables = d.renderableManager?.getRenderableContainer().getChildren() ?? [];
                for (const { row, material } of owners) {
                    if (!material?.map) continue;
                    const names = new Set();
                    for (const renderable of renderables) {
                        let matched = false;
                        renderable.get3DObject?.()?.traverse(object => {
                            const list = Array.isArray(object.material) ? object.material : [object.material];
                            if (list.some(value => value?.map === material.map)) matched = true;
                        });
                        if (matched) names.add(renderable.gameObject?.name ?? renderable.unit?.name ?? 'UNRESOLVED');
                        if (names.size >= 16) break;
                    }
                    row.familyMatchesAtCaptureEnd = [...names];
                }
                report.finished = stamp(); report.status = 'CAPTURED';
            };
            // Restore our outer wrappers first, then the original C6 timing wrappers.
            api.detailed.restores.unshift(...restores);
        } catch (error) {
            restores.forEach(restore => restore()); end.call(api); throw error;
        }
        return result;
    };
    api.endDetailed = function (...args) {
        const detailed = api.detailed;
        let result;
        try { detailed?.shaderIdentityFinish?.(); }
        catch (error) {
            detailed.report.shaderIdentity.status = 'FAILED';
            detailed.report.shaderIdentity.failure = error.message;
        } finally { result = end.apply(this, args); }
        return result;
    };
}

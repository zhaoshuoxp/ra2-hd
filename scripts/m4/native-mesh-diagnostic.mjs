// Post-window native Electron CPU diagnostic; live caches and geometry stay owned.
export async function measureNativeMeshBuilds() {
    const d = window.__ra2debug, g = d.game;
    d.gameScreen.uiAnimationLoop.stop();
    const before = { state: g.debugGetState(), rng: g.prng.snapshot(), hash: g.getHash() };
    const source = d.worldView.vxlGeometryPool;
    const scratch = new source.constructor(new source.cache.constructor(null, null), source.getModelQuality());
    const probeSection = source.cache.geometries.keys().next().value;
    const probeGeometry = scratch.get(probeSection);
    // Serialized pages can use another bundled Three namespace. Hook the
    // constructor produced by the actual builder, then verify the counter.
    const geometryPrototype = probeGeometry.constructor.prototype;
    const clone = geometryPrototype.clone;
    let cloneCalls = 0;
    const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
    const encoder = new TextEncoder(), sections = [];
    for (const section of source.cache.geometries.keys()) sections.push({ section,
        inputSha256: await digest(encoder.encode(JSON.stringify(section.toPlain()))) });
    sections.sort((a, b) => a.inputSha256.localeCompare(b.inputSha256));
    const rows = [];
    geometryPrototype.clone = function(...args) { cloneCalls++; return clone.apply(this, args); };
    let cloneControlCalls;
    try {
        const control = probeGeometry.clone(); control.dispose();
        cloneControlCalls = cloneCalls; cloneCalls = 0;
        scratch.cache.geometries.delete(probeSection); probeGeometry.dispose();
        for (const { section, inputSha256 } of sections.slice(0, 12)) {
            const samples = [], warmupMs = [];
            let firstUseMs, output;
            for (let iteration = -3; iteration < 8; iteration++) {
                const begun = performance.now(), geometry = scratch.get(section), ms = performance.now() - begun;
                if (iteration === -3) firstUseMs = ms;
                else if (iteration < 0) warmupMs.push(ms);
                else samples.push(ms);
                if (iteration === 7) {
                    output = {};
                    for (const [name, attribute] of [...Object.entries(geometry.attributes), ['index', geometry.index]]) {
                        const bytes = new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
                        output[name] = { type: attribute.array.constructor.name, itemSize: attribute.itemSize,
                            count: attribute.count, bytes: bytes.length, sha256: await digest(bytes) };
                    }
                }
                scratch.cache.geometries.delete(section); geometry.dispose();
            }
            rows.push({ name: section.name, inputSha256, dimensions: [section.sizeX, section.sizeY, section.sizeZ],
                firstUseMs, warmupMs, samplesMs: samples, output });
        }
    } finally { geometryPrototype.clone = clone; scratch.clear(); }
    const after = { state: g.debugGetState(), rng: g.prng.snapshot(), hash: g.getHash() };
    return { schema: 'm4-native-mesh-diagnostic-v1', availableSections: sections.length, rows,
        genericCloneCalls: cloneCalls, genericCloneControlCalls: cloneControlCalls, runtimePoolGet: source.get.toString(),
        counterPriming: 'One untimed builder result identifies its own geometry class; one explicit clone verifies the counter before measured scratch-cache misses.',
        simulationUnchanged: JSON.stringify(before) === JSON.stringify(after),
        scope: 'Actual frozen production Electron builder through a scratch native pool. Parsed input sections are warm; every build is a fresh scratch-cache miss. First use, two warmup builds and all eight retained builds are separate. No live cache is changed.' };
}

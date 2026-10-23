// Explicit M1.4 experiment only. No application entry imports this module.
export function installDisplayEdgeProbe() {
    const d = window.__ra2debug, renderer = d.renderer;
    if (!d?.game || window.__m14Edge) throw Error('Expected a fresh running M1.4 fixture');
    const pages = [...d.worldView.powerPlantHd.overrides.values()].flatMap(o => o.pages)
        .concat(d.worldView.conscriptHd.override.pages);
    const allowed = new Set(pages.map(p => p.base));
    const states = new Map();
    let mode = 'A', preparing = false;
    const originalRender = renderer.render;
    const declarations = `
      uniform vec2 m14TextureSize;
      uniform float m14Pass;
      varying vec4 vM14FrameRect;
      vec4 m14Resolve(vec2 cell, float row) {
        vec2 uv = (cell + 0.5) / m14TextureSize;
        if (any(lessThan(uv, vM14FrameRect.xy)) || any(greaterThan(uv, vM14FrameRect.zw))) return vec4(0.0);
        vec4 base = texture2D(map, uv);
        vec4 data = texture2D(remapMap, uv);
        float shade = (16.0 + floor(data.g * 255.0 + 0.5)) / 255.0;
        vec3 owner = texture2D(palette, vec2(shade, (row + 0.5) / paletteOffsetCount.y)).rgb;
        return vec4(mix(base.rgb, owner, data.r) * base.a, base.a);
      }
      vec4 m14Area(vec2 uv, float row) {
        vec2 p = uv * m14TextureSize;
        // Exact box coverage on the axis-aligned SHP texture footprint. Bound the
        // diagnostic to 1080/2160 output; no unsafe automatic atlas mip generation.
        vec2 footprint = clamp(abs(dFdx(p)) + abs(dFdy(p)), vec2(1.0), vec2(4.0));
        vec2 lo = p - footprint * 0.5, hi = p + footprint * 0.5;
        vec2 first = floor(lo);
        vec4 result = vec4(0.0);
        for (int y = 0; y < 6; y++) {
          if (first.y + float(y) >= hi.y) break;
          for (int x = 0; x < 6; x++) {
            vec2 cell = first + vec2(float(x), float(y));
            if (cell.x >= hi.x) break;
            vec2 weight = max(vec2(0.0), min(cell + 1.0, hi) - max(cell, lo));
            result += m14Resolve(cell, row) * weight.x * weight.y;
          }
        }
        return result / (footprint.x * footprint.y);
      }
    `;
    const treatment = `
      vec4 m14Filtered = m14Area(vMapUv, paletteRow);
      diffuseColor.rgb = m14Filtered.rgb / max(m14Filtered.a, 0.000001);
      if (m14Pass > 0.5) {
        // Treat alpha 254 export-rounding interiors as opaque. Only fractional
        // coverage goes through the sorted, depth-tested edge pass.
        if (m14Pass < 1.5 && m14Filtered.a < 0.995) discard;
        if (m14Pass > 1.5 && (m14Filtered.a >= 0.995 || m14Filtered.a <= 0.001)) discard;
        diffuseColor.a = m14Pass < 1.5 ? opacity : m14Filtered.a * opacity;
      }
    `;
    function prepareBatch(batch) {
        let state = states.get(batch);
        const material = batch.material;
        if (!state) {
            const marker = '  diffuseColor = clamp(diffuseColor, 0.0, 1.0);';
            if (!material.fragmentShader.includes('float paletteRow') || !material.fragmentShader.includes(marker))
                throw Error('Unexpected HD shader');
            state = { vertex: material.vertexShader, fragment: material.fragmentShader,
                key: material.customProgramCacheKey, fringes: [], attribute: batch.geometry.getAttribute('m14FrameRect') };
            states.set(batch, state);
            material.vertexShader = material.vertexShader.replace('void main() {',
                'attribute vec4 m14FrameRect; varying vec4 vM14FrameRect;\nvoid main() {\nvM14FrameRect = m14FrameRect;');
            material.fragmentShader = material.fragmentShader.replace('void main() {', declarations + '\nvoid main() {')
                .replace(marker, treatment + '\n' + marker);
            material.uniforms.m14TextureSize = { value: [material.map.image.width, material.map.image.height] };
            material.uniforms.m14Pass = { value: 0 };
            material.customProgramCacheKey = () => 'm14-edge-area-v1';
            material.needsUpdate = true;
            const Attribute = batch.geometry.attributes.position.constructor;
            batch.geometry.setAttribute('m14FrameRect', new Attribute(new Float32Array(batch.geometry.attributes.position.count * 4), 4));
        }
        material.uniforms.m14Pass.value = mode === 'C' ? 1 : 0;
        const geometry = batch.geometry, count = geometry.drawRange.count / batch.indicesPerItem;
        const rect = geometry.attributes.m14FrameRect, uv = geometry.attributes.uv;
        for (let item = 0; item < count; item++) {
            const offset = item * batch.verticesPerItem;
            let left = 1, top = 1, right = 0, bottom = 0;
            for (let i = offset; i < offset + batch.verticesPerItem; i++) {
                left = Math.min(left, uv.getX(i)); right = Math.max(right, uv.getX(i));
                top = Math.min(top, uv.getY(i)); bottom = Math.max(bottom, uv.getY(i));
            }
            for (let i = offset; i < offset + batch.verticesPerItem; i++) rect.setXYZW(i, left, top, right, bottom);
            if (mode !== 'C') continue;
            let fringe = state.fringes[item];
            if (!fringe) {
                if (!state.fringeMaterial) {
                    const edge = material.clone();
                    edge.defines = { ...material.defines };
                    edge.transparent = true; edge.depthWrite = false; edge.premultipliedAlpha = true; edge.alphaTest = 0.001;
                    edge.uniforms.m14Pass = { value: 2 };
                    edge.customProgramCacheKey = () => 'm14-edge-area-fringe-v1';
                    // Share immutable texture-size metadata across both passes.
                    edge.uniforms.m14TextureSize = material.uniforms.m14TextureSize;
                    state.fringeMaterial = edge;
                }
                const Mesh = Object.getPrototypeOf(batch.constructor);
                fringe = new Mesh(new geometry.constructor(), state.fringeMaterial);
                fringe.matrixAutoUpdate = false; fringe.frustumCulled = false;
                fringe.name = 'm14-diagnostic-edge';
                state.fringes[item] = fringe;
                batch.parent.add(fringe);
            }
            for (const [name, source] of Object.entries(geometry.attributes)) {
                const values = source.array.slice(offset * source.itemSize, (offset + batch.verticesPerItem) * source.itemSize);
                let target = fringe.geometry.getAttribute(name);
                if (!target) fringe.geometry.setAttribute(name, new source.constructor(values, source.itemSize, source.normalized));
                else { target.array.set(values); target.needsUpdate = true; }
            }
            if (!fringe.geometry.index) {
                const indices = geometry.index.array.slice(item * batch.indicesPerItem, (item + 1) * batch.indicesPerItem);
                fringe.geometry.setIndex(new geometry.index.constructor(indices.map(i => i - offset), 1));
            }
            fringe.geometry.computeBoundingSphere();
            fringe.matrix.copy(batch.matrix); fringe.matrixWorld.copy(batch.matrixWorld);
            fringe.renderOrder = batch.renderOrder;
            fringe.visible = true;
        }
        rect.needsUpdate = true;
        for (let i = mode === 'C' ? count : 0; i < state.fringes.length; i++) state.fringes[i].visible = false;
    }
    function restore() {
        for (const [batch, state] of states) {
            const material = batch.material;
            material.vertexShader = state.vertex; material.fragmentShader = state.fragment;
            material.customProgramCacheKey = state.key;
            delete material.uniforms.m14TextureSize; delete material.uniforms.m14Pass;
            material.needsUpdate = true;
            if (state.attribute) batch.geometry.setAttribute('m14FrameRect', state.attribute);
            else batch.geometry.deleteAttribute('m14FrameRect');
            for (const fringe of state.fringes) { fringe.removeFromParent(); fringe.geometry.dispose(); }
            state.fringeMaterial?.dispose();
        }
        states.clear();
    }
    function prepare() {
        if (mode === 'A') return;
        const batches = [];
        d.worldScene.meshBatchManager.get3DObject().traverse(object => {
            if (object.verticesPerItem && object.material?.type === 'HdSpriteMaterial' && allowed.has(object.material.map)) batches.push(object);
        });
        for (const state of states.values()) for (const fringe of state.fringes) fringe.visible = false;
        batches.forEach(prepareBatch);
    }
    renderer.render = function(...args) {
        if (!preparing) { preparing = true; try { prepare(); } finally { preparing = false; } }
        return originalRender.apply(this, args);
    };
    window.__m14Edge = {
        setMode(value) {
            if (!['A', 'B', 'C'].includes(value)) throw Error('Unknown edge diagnostic');
            if (value === 'A') restore();
            mode = value;
        },
        info: () => ({ mode, patchedBatches: states.size,
            visibleEdgeMeshes: [...states.values()].flatMap(s => s.fringes).filter(m => m.visible).length }),
        dispose() { mode = 'A'; restore(); renderer.render = originalRender; delete window.__m14Edge; },
    };
}

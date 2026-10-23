// Injected only by the explicit M1.2a browser harness, never by the game entry.
export function installClarityProbe() {
    if (window.__m12aProbe || !window.__ra2debug?.game || !window.__m12Plant)
        throw Error('M1.2a requires its isolated, initialized GAPOWR game fixture');
    const d = window.__ra2debug, renderer = d.renderer.renderer;
    const plant = window.__m12Plant, r = d.renderableManager.getRenderableByGameObject(plant);
    const pages = [...d.worldView.powerPlantHd.overrides.values()].flatMap(o => o.pages);
    const allowedMaps = new Set(pages.slice(0, 2).map(p => p.base));
    const originals = new Map();
    const functions = `
      uniform float m12aMode;
      uniform vec2 m12aTextureSize;
      vec4 m12aResolved(vec2 p, float row) {
        vec4 b = texture2D(map, p);
        vec4 data = texture2D(remapMap, p);
        float shade = (16.0 + floor(data.g * 255.0 + 0.5)) / 255.0;
        vec3 owner = texture2D(palette, vec2(shade, (row + 0.5) / paletteOffsetCount.y)).rgb;
        return vec4(mix(b.rgb, owner, data.r) * b.a, b.a);
      }
      vec3 m12aColorLinear(vec2 p, float row) {
        vec2 pos = p * m12aTextureSize - 0.5;
        vec2 cell = floor(pos), f = fract(pos);
        vec2 p00 = (cell + 0.5) / m12aTextureSize;
        vec2 stepUV = 1.0 / m12aTextureSize;
        vec4 a = m12aResolved(p00, row), b = m12aResolved(p00 + vec2(stepUV.x, 0.0), row);
        vec4 c = m12aResolved(p00 + vec2(0.0, stepUV.y), row), e = m12aResolved(p00 + stepUV, row);
        vec4 result = mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
        return result.rgb / max(result.a, 0.00001);
      }
    `;
    const treatment = `
      // B: interpolate resolved colors in linear light; retain nearest alpha and discrete shade lookup.
      if (m12aMode > 0.5 && m12aMode < 1.5) diffuseColor.rgb = m12aColorLinear(vMapUv, paletteRow);
      // C: lift only dark non-owner pixels; retain existing sampling and alpha.
      if (m12aMode > 1.5 && m12aMode < 2.5) {
        float luminance = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float shadowWeight = (1.0 - remapData.r) * smoothstep(0.002, 0.012, luminance)
            * (1.0 - smoothstep(0.025, 0.18, luminance));
        diffuseColor.rgb *= 1.0 + 0.28 * shadowWeight;
      }
      // D: an inward-only coverage threshold trial, not smoothed or expanded artwork.
      if (m12aMode > 2.5 && diffuseColor.a < 0.5) discard;
    `;
    function patch() {
        d.worldScene.meshBatchManager.get3DObject().traverse(object => {
            const material = object.material;
            if (!material || material.type !== 'HdSpriteMaterial' || !allowedMaps.has(material.map)) return;
            if (originals.has(material)) return;
            const fragment = material.fragmentShader;
            const marker = '  diffuseColor = clamp(diffuseColor, 0.0, 1.0);';
            if (!fragment.includes(marker) || !fragment.includes('float paletteRow')) throw Error('Unexpected HD shader');
            originals.set(material, { fragment, key: material.customProgramCacheKey });
            material.fragmentShader = fragment.replace('void main() {', functions + '\nvoid main() {')
                .replace(marker, treatment + '\n' + marker);
            material.uniforms.m12aMode = { value: 0 };
            material.uniforms.m12aTextureSize = { value: [material.map.image.width, material.map.image.height] };
            material.customProgramCacheKey = () => 'm12a-diagnostic-color-shadow-edge-v1';
            material.needsUpdate = true;
        });
    }
    const geometry = model => {
        const mesh = model.getShapeMesh(), builder = model.builder;
        const frame = builder.hdOverride.frames[builder.getFrame() + builder.frameOffset];
        const points = [];
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
            const point = r.getPosition().clone().fromBufferAttribute(mesh.geometry.attributes.position, i)
                .applyMatrix4(mesh.matrixWorld).project(d.worldScene.camera);
            const v = d.worldScene.viewport;
            points.push([v.x + (point.x + 1) * v.width / 2, v.y + (1 - point.y) * v.height / 2]);
        }
        return { frame: builder.getFrame(), aggregateFrame: builder.getFrame() + builder.frameOffset,
            rect: frame.sampleRect, page: frame.page, vertices: Array.from(mesh.geometry.attributes.position.array),
            uv: Array.from(mesh.geometry.attributes.uv.array), projected: points,
            projectedBounds: [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
                Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))],
            map: { width: mesh.material.map.image.width, height: mesh.material.map.image.height,
                colorSpace: mesh.material.map.colorSpace, minFilter: mesh.material.map.minFilter,
                magFilter: mesh.material.map.magFilter, flipY: mesh.material.map.flipY,
                premultiplyAlpha: mesh.material.map.premultiplyAlpha, mipmaps: mesh.material.map.generateMipmaps },
            paletteRow: mesh.getPaletteIndex(), extraLight: mesh.getExtraLight().toArray(), opacity: mesh.getOpacity(),
            alphaTest: mesh.material.alphaTest, depthWrite: mesh.material.depthWrite, transparent: mesh.material.transparent,
            palette: { colorSpace: mesh.material.palette.colorSpace,
                colors: Array.from(mesh.material.palette.image.getContext('2d').getImageData(16, mesh.getPaletteIndex(), 16, 1).data) } };
    };
    function dumpTextures() {
            const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__m12Plant);
            const active = [...r.animObjects.values()].flat().find(m => m.get3DObject()?.visible && m.builder.frameOffset === 3);
            return [r.mainObj, active].map(model => {
                const b = model.builder, frame = b.hdOverride.frames[b.getFrame() + b.frameOffset];
                const { x, y, width, height } = frame.sampleRect;
                const page = b.hdOverride.pages[frame.page];
                const values = {};
                for (const role of ['base', 'data']) {
                    const image = page[role].image, bytes = new Uint8Array(width * height * 4);
                    for (let row = 0; row < height; row++) bytes.set(image.data.subarray(((y + row) * image.width + x) * 4,
                        ((y + row) * image.width + x + width) * 4), row * width * 4);
                    let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
                    values[role] = btoa(binary);
                }
                return { member: b.frameOffset === 0 ? 'ggpowr' : 'ggpowr_a', frame: b.getFrame(), width, height, values };
            });

    }
    function capture(mode, full = false) {
        if (mode !== -1) {
            patch();
            for (const material of originals.keys()) material.uniforms.m12aMode.value = mode;
        }
        d.renderer.render();
        if (full) window.__m12aTextureDump = dumpTextures();
        const canvas = renderer.domElement, ratio = canvas.width / 1920;
        const hit = d.helpers.getOwnedBuildingClickTargetsById(plant.id).centerScreenPoint;
        const left = Math.round(hit.x) - 300, top = Math.round(hit.y) - 210;
        const crop = document.createElement('canvas'); crop.width = 500 * ratio; crop.height = 340 * ratio;
        crop.getContext('2d').drawImage(canvas, left * ratio, top * ratio, crop.width, crop.height, 0, 0, crop.width, crop.height);
        const active = [...r.animObjects.values()].flat().find(model => model.get3DObject()?.visible && model.builder.frameOffset === 3);
        return { mode, tick: d.game.currentTick, health: plant.healthTrait.health, png: crop.toDataURL('image/png'),
            full: full ? canvas.toDataURL('image/png') : undefined,
            cropLogical: [left, top, 500, 340], intendedCss: [500, 340], buffer: [canvas.width, canvas.height],
            viewport: { ...d.worldScene.viewport }, canvasCss: [canvas.style.width, canvas.style.height],
            devicePixelRatio, browserVisualScale: visualViewport.scale, outputColorSpace: renderer.outputColorSpace,
            camera: { bounds: [d.worldScene.camera.left, d.worldScene.camera.right, d.worldScene.camera.top, d.worldScene.camera.bottom],
                position: d.worldScene.camera.position.toArray(), matrix: d.worldScene.camera.matrixWorld.toArray() },
            body: geometry(r.mainObj), active: active && geometry(active),
            glError: renderer.getContext().getError(), drawCalls: renderer.info.render.calls,
            gpu: { ...renderer.info.memory }, patchedBatchMaterials: originals.size };
    }
    window.__m12aProbe = {
        capture,
        captureAll(full = false) { return [-1, 0, 1, 2, 3, 0].map(mode => capture(mode, full && mode === -1)); },
        restore() {
            for (const [material, state] of originals) {
                material.fragmentShader = state.fragment; material.customProgramCacheKey = state.key;
                delete material.uniforms.m12aMode; delete material.uniforms.m12aTextureSize;
                material.needsUpdate = true;
            }
            originals.clear(); d.renderer.render();
        },
    };
}

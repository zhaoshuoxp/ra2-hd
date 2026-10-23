/* Offline viewer for the selected immutable atlases. Decode only active pages. */
const payload = JSON.parse(document.querySelector('#review-data').textContent);
const $ = id => document.getElementById(id), cache = new Map();
let frame = 0, playing = false, lastTime = 0, generation = 0;
function option(value, label) { const o = document.createElement('option'); o.value = value; o.textContent = label; return o; }
for (const entry of payload.families) $('family').append(option(entry.key, `${entry.name} · ${entry.theater}`));
async function decode(id) {
    if (cache.has(id)) { const value = cache.get(id); cache.delete(id); cache.set(id, value); return value; }
    const image = new Image(); image.src = 'data:image/png;base64,' + $('asset-' + id).textContent;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
    const value = { width: image.width, height: image.height, bytes: ctx.getImageData(0, 0, image.width, image.height).data };
    cache.set(id, value); while (cache.size > 18) cache.delete(cache.keys().next().value);
    return value;
}
function current() { return payload.families.find(f => f.key === $('family').value); }
function state() { return current().states[Number($('state').value)]; }
function refreshStates() {
    $('state').replaceChildren(...current().states.map((s, i) => option(i, s.label)));
    frame = 0; configureFrame(); draw();
}
function configureFrame() {
    $('frame').max = Math.max(0, state().frames.length - 1); $('frame').value = Math.min(frame, Number($('frame').max));
    $('timing').textContent = `${state().rate.toFixed(2)} ${state().type === "member" ? "preview steps/s" : "art frames/s"} · ${state().frames.length} slots`;
}
const ramps = [63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8];
const owners = { green: [60, 210, 45], blue: [0, 75, 255], cyan: [49, 215, 230], gold: [255, 220, 0] };
const linear = byte => byte <= 10.31475 ? byte / 3294.6 : ((byte / 255 + .055) / 1.055) ** 2.4;
const srgb = value => Math.round(255 * (value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055));
async function extract(member, nativeFrame, density) {
    const logical = member.logical.frames[nativeFrame], variant = member.variants.find(v => v.density === density);
    if (!logical || logical.empty) return;
    const item = variant.frames[nativeFrame], page = variant.pages.find(p => p.id === item.page);
    const [base, data, map] = await Promise.all([decode(page.baseAsset), decode(page.dataAsset), page.mapAsset ? decode(page.mapAsset) : undefined]);
    const [x, y, width, height] = item.sampleRect, result = new ImageData(width, height), mode = $('owner').value;
    for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
        let sx = x + px, sy = y + py;
        if (map) {
            const code = (Math.floor(sy / 4) * map.width + Math.floor(sx / 4)) * 4;
            const id = map.bytes[code] + map.bytes[code + 1] * 256 + map.bytes[code + 2] * 65536;
            const columns = base.width / 4;
            sx = id % columns * 4 + sx % 4; sy = Math.floor(id / columns) * 4 + sy % 4;
        }
        const source = (sy * base.width + sx) * 4, target = (py * width + px) * 4;
        result.data.set(base.bytes.subarray(source, source + 4), target);
        const alpha = data.bytes[source] / 255, shade = data.bytes[source + 1];
        if (mode === 'mask' && alpha) {
            result.data[target] = 255; result.data[target + 1] = 220; result.data[target + 2] = 0;
        } else if (owners[mode] && alpha) {
            if (member.turret) {
                const baseLinear = [0, 1, 2].map(c => linear(base.bytes[source + c]));
                const color = owners[mode].map(linear), scale = Math.max(...color, 1e-6);
                const reference = [1, linear(24), linear(24)], chroma = Math.max(0, baseLinear[0] - Math.max(baseLinear[1], baseLinear[2]));
                for (let c = 0; c < 3; c++) result.data[target + c] = srgb(Math.max(0, Math.min(1,
                    baseLinear[c] + alpha * chroma * (color[c] / scale - reference[c]))));
            } else {
                for (let c = 0; c < 3; c++) result.data[target + c] = Math.round(base.bytes[source + c] * (1 - alpha) +
                    Math.floor(owners[mode][c] / 255 * ramps[shade] * 4) * alpha);
            }
        }
    }
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d').putImageData(result, 0, 0);
    return { canvas, logical };
}
function assembly(entry, sequence, number) {
    const target = { member: sequence.member, frame: sequence.frames[number], offset: sequence.offset };
    if ($('assembly').value === 'member' || ['BUILDUP', 'UNBUILD', 'turret', 'member'].includes(sequence.type)) return [target];
    const layers = entry.rest.filter(layer => layer.member !== target.member &&
        !(layer.type === 'IDLE' && !['body', 'IDLE', 'ACTIVE'].includes(sequence.type)) &&
        !(layer.type === 'SUPER' && sequence.type === 'SUPER') &&
        !(layer.type === 'body' && ['FACTORY_DEPLOYING', 'FACTORY_ROOF_DEPLOYING'].includes(sequence.type)) &&
        !(sequence.type === 'SPECIAL' && entry.name === 'YAGRND' && layer.type === 'ACTIVE'));
    return [...layers.map(layer => ({ ...layer, frame: sequence.damaged ? layer.damagedFrame ?? layer.frame : layer.frame })), target];
}
async function draw() {
    document.body.dataset.ready = 'loading';
    const token = ++generation, entry = current(), sequence = state();
    const index = Math.min(frame, sequence.frames.length - 1);
    $('frame').value = index; $('position').textContent = `Slot ${index + 1}/${sequence.frames.length} · native frame ${sequence.frames[index]}`;
    $('details').textContent = `${entry.name} · ${entry.theater} · ${sequence.label}. Both views use their independent exported pages. Turrets are shown separately at their native component canvas; assembled sockets are verified in gameplay. Empty native slots remain blank. Playback uses the source art rate; gameplay speed is visible in the native clips. The atlas viewer illustrates state assembly; game depth, shadows and controllers are shown in the native captures below.`;
    try {
        for (const density of [2, 4]) {
            const layers = assembly(entry, sequence, index), decoded = [];
            for (const layer of layers) decoded.push([layer, await extract(entry.members[layer.member], layer.frame, density)]);
            if (token !== generation) return;
            const canvas = $('canvas-' + density), member = entry.members[sequence.member];
            const bounds = $('assembly').value === 'member' || ['turret', 'member'].includes(sequence.type) ? member.logical.canvas : entry.canvas;
            canvas.width = bounds[0] * density; canvas.height = bounds[1] * density;
            const ctx = canvas.getContext('2d');
            for (const [layer, image] of decoded) if (image) {
                const local = entry.members[layer.member].logical.canvas;
                const offset = layer.offset ?? { x: 0, y: 0 };
                ctx.drawImage(image.canvas, (image.logical.trimOrigin[0] + (bounds[0] - local[0]) / 2 + offset.x) * density,
                    (image.logical.trimOrigin[1] + (bounds[1] - local[1]) / 2 + offset.y) * density);
            }
            canvas.style.width = ($('view').value === 'buffer' ? canvas.width : bounds[0]) + 'px';
            canvas.style.height = ($('view').value === 'buffer' ? canvas.height : bounds[1]) + 'px';
            $('size-' + density).textContent = `${density}X · ${canvas.width} × ${canvas.height} physical pixels`;
        }
        $('error').textContent = ''; document.body.dataset.ready = 'true';
    } catch (error) { $('error').textContent = error.stack; document.body.dataset.ready = 'error'; }
}
$('family').onchange = () => { playing = false; $('play').textContent = 'Play'; refreshStates(); };
$('state').onchange = () => { frame = 0; configureFrame(); draw(); };
for (const name of ['owner', 'view', 'assembly']) $(name).onchange = draw;
$('frame').oninput = () => { frame = Number($('frame').value); draw(); };
$('play').onclick = () => { playing = !playing; lastTime = 0; $('play').textContent = playing ? 'Pause' : 'Play'; };
async function animate(time) {
    if (playing && time - lastTime >= 1000 / state().rate) {
        lastTime = time; frame = (frame + 1) % state().frames.length; await draw();
    }
    requestAnimationFrame(animate);
}
refreshStates(); requestAnimationFrame(animate);
window.__review = { payload, draw, cache, extract, current, state };

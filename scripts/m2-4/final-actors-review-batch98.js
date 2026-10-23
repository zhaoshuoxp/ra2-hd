const data = JSON.parse(document.getElementById("review-data").textContent);
const cache = new Map;
function picture(url) {
  if (!cache.has(url)) {
    const im = new Image;
    im.src = url;
    cache.set(url, im);
  }
  return cache.get(url);
}
function element(tag, text, parent) {
  const node = document.createElement(tag);
  if (text)
    node.textContent = text;
  if (parent)
    parent.append(node);
  return node;
}
for (const actor of Object.values(data.actors)) {
  let setSequence = function() {
    selected = actor.sequences.find((s) => s.name === sequence.value);
    facing.replaceChildren();
    for (const f of selected.facings) {
      const o = element("option", `Facing ${f}`, facing);
      o.value = f;
    }
    phase.max = selected.frameCount - 1;
    phase.value = 0;
    number = 0;
  }, draw = function() {
    const slot = selected.startFrame + Number(facing.value) * selected.facingMult + number, frame = actor.frames[slot];
    if (!frame)
      return;
    label.textContent = `Phase ${number + 1}/${selected.frameCount} · source ${slot}`;
    for (const { density, canvas } of canvases) {
      const ratio = 4;
      canvas.width = actor.canvas[0] * ratio;
      canvas.height = actor.canvas[1] * ratio;
      canvas.style.width = actor.canvas[0] * Number(zoom.value) + "px";
      canvas.style.height = actor.canvas[1] * Number(zoom.value) + "px";
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = density !== 1;
      const im = picture(frame.images[density]);
      const paint = () => ctx.drawImage(im, frame.origin[0] * ratio, frame.origin[1] * ratio, im.width * ratio / density, im.height * ratio / density);
      if (im.complete)
        paint();
      else
        im.onload = paint;
    }
  }, animate = function(time) {
    if (playing && time - last >= 100) {
      number = (number + 1) % selected.frameCount;
      phase.value = number;
      draw();
      last = time;
    }
    requestAnimationFrame(animate);
  };
  const section = element("section", null, document.getElementById("actors"));
  element("h2", `${actor.name} / ${actor.count} authored poses`, section);
  element("p", actor.name === "CIV1" ? "Pale yellow sleeveless blouse, brown skirt, red hair and white shoes. Check smooth contours and consistent costume through every facing." : "Original olive-gray anatomy, stripe placement and long tail. Check continuous edges, clear structure and stable movement.", section);
  const controls = element("div", null, section);
  controls.className = "controls";
  const sequence = element("select", null, controls), facing = element("select", null, controls), zoom = element("select", null, controls);
  for (const s of actor.sequences) {
    const o = element("option", s.name, sequence);
    o.value = s.name;
  }
  for (const value of [1, 2, 4]) {
    const o = element("option", `${value}× display${value === 1 ? " / native scale" : ""}`, zoom);
    o.value = value;
  }
  zoom.value = "2";
  const play = element("button", "Play preview", controls), phase = element("input", null, controls);
  phase.type = "range";
  phase.min = 0;
  const label = element("span", null, controls), comparison = element("div", null, section);
  comparison.className = "comparison";
  const canvases = [1, 2, 4].map((d) => {
    const c = element("div", null, comparison);
    c.className = "cell";
    element("h3", d === 1 ? "Original" : `${d}X authored`, c);
    return { density: d, canvas: element("canvas", null, c) };
  });
  element("p", "The phase preview compares identical source indices and original anchors. Preview playback is illustrative; the recordings below show native timing. Contact shadow is omitted in all artwork columns.", section).className = "note";
  let selected = actor.sequences[0], number = 0, playing = false, last = 0;
  sequence.onchange = () => {
    setSequence();
    draw();
  };
  facing.onchange = draw;
  zoom.onchange = draw;
  phase.oninput = () => {
    number = Number(phase.value);
    draw();
  };
  play.onclick = () => {
    playing = !playing;
    play.textContent = playing ? "Pause preview" : "Play preview";
  };
  setSequence();
  draw();
  requestAnimationFrame(animate);
  const details = element("details", null, section);
  element("summary", `Browse all ${actor.count} authored poses`, details);
  const gallery = element("div", null, details);
  gallery.className = "gallery";
  let filled = false;
  details.ontoggle = () => {
    if (!details.open || filled)
      return;
    filled = true;
    for (const frame of actor.frames) {
      const card = element("figure", null, gallery);
      element("figcaption", `${actor.name} / source ${frame.slot} / 4X`, card);
      const im = element("img", null, card);
      im.src = frame.images[4];
      im.alt = `${actor.name} authored source ${frame.slot}`;
      im.loading = "lazy";
    }
  };
}
function addImageCard(row, parent) {
  const card = element("figure", null, parent);
  element("figcaption", row.title, card);
  const im = element("img", null, card);
  im.style.cursor = "zoom-in";
  im.onclick = () => {
    const dialog = document.createElement("dialog");
    dialog.style.maxWidth = "95vw";
    dialog.style.maxHeight = "95vh";
    const close = element("button", "Close", dialog);
    close.onclick = () => {
      dialog.close();
      dialog.remove();
    };
    const full = element("img", null, dialog);
    full.src = row.image;
    full.style.maxWidth = "none";
    full.style.display = "block";
    document.body.append(dialog);
    dialog.showModal();
  };
  im.src = row.image;
  im.alt = row.title;
  im.loading = "lazy";
}
for (const row of data.native) addImageCard(row, document.getElementById("native"));
for (const row of data.lighting) addImageCard(row, document.getElementById("lamp-images"));
for (const row of data.clips) {
  const card = element("figure", null, document.getElementById("clips"));
  element("figcaption", row.title, card);
  const video = element("video", null, card);
  video.src = row.video;
  video.controls = true;
  video.loop = true;
  video.muted = true;
  video.preload = "none";
}

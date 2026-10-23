"""Create a standalone static review without changing captured PNGs or prior delivery files."""
import argparse
import base64
import hashlib
import html
import io
import json
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image


def digest(data):
    return hashlib.sha256(data).hexdigest()


class Scan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images, self.videos, self.links, self.ids, self.scripts = [], [], [], set(), 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "img":
            self.images.append(attrs)
        if tag == "video":
            self.videos.append(attrs)
        if tag == "a":
            self.links.append(attrs["href"])
        if tag == "script":
            self.scripts += 1
        if "id" in attrs:
            self.ids.add(attrs["id"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    manifest_output = output.with_suffix(".json")
    if output.exists() or manifest_output.exists():
        raise ValueError("Preserve earlier reviews; choose a new output filename.")
    manifest_path = source / "review-manifest.json"
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    index_hash = digest((source / "index.html").read_bytes())
    images = {}
    for entry in manifest["files"]:
        path = (source / entry["file"]).resolve()
        assert path.is_relative_to(source)
        data = path.read_bytes()
        assert digest(data) == entry["sha256"], entry["file"]
        with Image.open(io.BytesIO(data)) as image:
            assert image.format == "PNG" and list(image.size) == entry["size"]
            image.verify()
        images[entry["file"]] = {**entry, "bytes": len(data),
                                 "uri": "data:image/png;base64," + base64.b64encode(data).decode("ascii")}
    emitted = []
    videos, video_sections = {}, []
    for entry in manifest.get('videoFiles', []):
        path = (source / entry['file']).resolve()
        assert path.is_relative_to(source)
        data = path.read_bytes()
        assert digest(data) == entry['sha256'] and data.startswith(bytes.fromhex('1a45dfa3'))
        assert entry['rescaled'] is False
        videos[entry['file']] = {**entry, 'bytes': len(data),
            'uri': 'data:video/webm;base64,' + base64.b64encode(data).decode('ascii')}
    emitted_videos = []
    if videos:
        video_sections.append('<section id="motion"><h2>Native animation recordings</h2>'
            '<p>Recorded from the live game framebuffer at the original clock. Playback controls do not alter the game or source art. '
            'Powered fixtures and original neutral idle behavior are labeled separately.</p>')
        for index, entry in enumerate(manifest['videos']):
            video_sections.append(f'<details id="motion-{index}"><summary>{html.escape(entry["name"])}</summary><div class="comparisons">')
            for label, file in entry['videos'].items():
                video = videos[file]
                emitted_videos.append(file)
                width, height = video['size']
                density = entry.get('densityLabels', {}).get(label, label)
                assert density in ['Original', '2X', '4X']
                video_sections.append(f'<figure data-density="{density}"><figcaption>{html.escape(label)} · {width} × {height} pixels</figcaption>'
                    f'<div class="viewer"><video src="{video["uri"]}" controls loop preload="none" '
                    f'width="{width}" height="{height}" data-source="{html.escape(file)}" data-sha256="{video["sha256"]}"></video></div></figure>')
            video_sections.append('</div></details>')
        video_sections.append('</section>')
        assert len(emitted_videos) == len(videos) and set(emitted_videos) == set(videos)

    def figure(file, label):
        image = images[file]
        emitted.append(file)
        width, height = image["size"]
        loading = "eager" if len(emitted) == 2 else "lazy"
        return (f'<figure data-density="{label}"><figcaption>{label} · {width} × {height} pixels</figcaption>'
                f'<div class="viewer"><img src="{image["uri"]}" alt="{html.escape(file)}" '
                f'width="{width}" height="{height}" loading="{loading}" decoding="async" '
                f'data-source="{html.escape(file)}" data-sha256="{image["sha256"]}"></div></figure>')

    sections = []
    for title, key, prefix in [("Matched in-game scenes", "scenes", "scene"),
                               ("Native object states", "states", "state"),
                               ("Source atlas comparisons", "comparisons", "atlas")]:
        if not manifest[key]:
            continue
        sections.append(f'<section id="{prefix}"><h2>{title}</h2>')
        for index, entry in enumerate(manifest[key]):
            opened = " open" if prefix == "scene" and index == 0 else ""
            sections.append(f'<details id="{prefix}-{index}"{opened}><summary>{html.escape(entry["name"])}</summary>')
            sections.append('<div class="comparisons">')
            if "images" in entry:
                for label, file in entry["images"].items():
                    sections.append(figure(file, label))
                if prefix == "state" and "Original" not in entry["images"]:
                    sections.append('<p class="original-note">Original state captures were not collected for this case. '
                                    'Use 2X, 4X or Compare all to inspect the recorded native states.</p>')
            else:
                label = "2X" if "atlas-2X-" in entry["image"] else "4X"
                sections.append(figure(entry["image"], label))
            sections.append("</div></details>")
        sections.append("</section>")
    assert set(emitted) == set(images) and len(emitted) == len(images)
    content = '''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title><style>
body{margin:24px;background:#141923;color:#eef2f8;font:20px/1.5 system-ui}
h1{font-size:34px}h2{font-size:28px}p{max-width:1100px}a{color:#a5c8ff}
body>input{width:20px;height:20px;margin:12px 4px 12px 18px}label{margin-right:12px;cursor:pointer}
details{margin:20px 0;border:1px solid #526077;border-radius:6px;padding:12px}
summary{font-size:22px;cursor:pointer}.comparisons{display:flex;gap:18px;flex-wrap:wrap}
figure{margin:14px 0;flex:1 1 500px;min-width:0}figcaption{margin:8px 0;color:#bfcbdc}
.viewer{overflow:auto;max-height:80vh;background:#070b12;border:1px solid #526077}
.viewer img{display:block;width:auto;height:auto;max-width:none;max-height:none}
#fit:checked~main .viewer img{max-width:100%;height:auto}
#density-original:checked~main figure:not([data-density="Original"]),
#density-2:checked~main figure:not([data-density="2X"]),
#density-4:checked~main figure:not([data-density="4X"]){display:none}
.original-note{display:none}#density-original:checked~main .original-note{display:block}
.status{color:#a8dec5}nav a{display:inline-block;margin-right:22px}
</style><h1>__TITLE__</h1>
<p class="status">__STATUS__</p>
<p>All __IMAGE_COUNT__ PNGs are embedded as their exact captured bytes. This file displays its pictures without JavaScript,
an image folder, a server or a network connection. Default viewing preserves 1:1 pixels; scroll inside each image.
Fit preview changes only display size. Expand each case to inspect it.</p>
<p>Matched scene captures retain the same source map, seed, camera and output. __STATE_NOTE__
Atlas boards complement native gameplay evidence. Windows and user visual acceptance are not claimed.</p>
<nav><a href="#scene">Scenes</a>__STATE_LINK____ATLAS_LINK__
<a href="__MANIFEST__" download="review-manifest.json">Image hashes and provenance</a></nav>
<input id="density-original" name="density" type="radio"><label for="density-original">Original</label>
<input id="density-2" name="density" type="radio" checked><label for="density-2">2X</label>
<input id="density-4" name="density" type="radio"><label for="density-4">4X</label>
<input id="density-all" name="density" type="radio"><label for="density-all">Compare all</label>
<input id="fit" type="checkbox"><label for="fit">Fit preview</label><main>__SECTIONS__</main></html>
'''
    metadata_uri = "data:application/json;base64," + base64.b64encode(manifest_bytes).decode("ascii")
    content = content.replace("__MANIFEST__", metadata_uri).replace("__SECTIONS__", "\n".join(video_sections + sections))
    if videos:
        content = content.replace('<a href="#scene">Scenes</a>', '<a href="#motion">Animations</a><a href="#scene">Scenes</a>')
    content = content.replace("__TITLE__", html.escape(manifest.get("title", "M2.4 Snow embedded review")))
    content = content.replace("__STATUS__", html.escape(manifest.get("summary",
        "Mac technical checks passed. Visual direction awaits review. Complete SNOW and M2.4 coverage remain pending.")))
    content = content.replace("__IMAGE_COUNT__", str(len(emitted)))
    content = content.replace("__STATE_LINK__", '<a href="#state">Object states</a>' if manifest["states"] else "")
    content = content.replace("__ATLAS_LINK__", '<a href="#atlas">Atlas comparisons</a>' if manifest["comparisons"] else "")
    content = content.replace("__STATE_NOTE__", "Object states use disclosed legal native fixtures; action ticks can differ between densities."
                              if manifest["states"] else "Unchanged house-state evidence is reused from the accepted representative review.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x") as stream:
        stream.write(content)
    scan = Scan()
    scan.feed(output.read_text())
    assert not scan.scripts and len(scan.images) == len(manifest["files"]) == len(emitted)
    for attrs in scan.images:
        expected = images[attrs["data-source"]]
        data = base64.b64decode(attrs["src"].split(",", 1)[1], validate=True)
        assert digest(data) == attrs["data-sha256"] == expected["sha256"]
        assert [int(attrs["width"]), int(attrs["height"])] == expected["size"]
    assert len(scan.videos) == len(videos)
    for attrs in scan.videos:
        expected = videos[attrs['data-source']]
        assert attrs['src'].startswith('data:video/webm;base64,')
        data = base64.b64decode(attrs['src'].split(',', 1)[1], validate=True)
        assert digest(data) == attrs['data-sha256'] == expected['sha256']
        assert [int(attrs['width']), int(attrs['height'])] == expected['size']
    assert all(link.startswith("data:") or link[1:] in scan.ids for link in scan.links)
    assert digest((source / "index.html").read_bytes()) == index_hash
    assert manifest_path.read_bytes() == manifest_bytes
    for file, image in images.items():
        assert digest((source / file).read_bytes()) == image["sha256"]
    receipt = {"schema": "m2-4-static-embedded-review-v1",
               "status": f"PASS_ALL_{len(emitted)}_EXACT_EMBEDDED_PNGS",
               "source": str(source), "sourceManifestSha256": digest(manifest_bytes), "sourceIndexSha256": index_hash,
               "output": str(output), "outputSha256": digest(output.read_bytes()), "outputBytes": output.stat().st_size,
               "images": [{k: v for k, v in image.items() if k != "uri"} for image in images.values()],
               "videos": [{k: v for k, v in video.items() if k != 'uri'} for video in videos.values()],
               "javascriptRequired": False, "externalImageSources": 0, "sourceFilesPreserved": True,
               "visualDirection": manifest.get("visualDirection", "PENDING"),
               "artworkChanged": False, "applicationChanged": False}
    with manifest_output.open("x") as stream:
        json.dump(receipt, stream, indent=2)
        stream.write("\n")
    print(json.dumps({key: value for key, value in receipt.items() if key not in ['images', 'videos']}))


if __name__ == "__main__":
    main()

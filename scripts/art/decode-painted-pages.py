"""Cache hash-verified RGBA pages for the independent runtime budget check."""
import argparse
import struct
from pathlib import Path

from PIL import Image

from buildup import read, sha

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("authoring", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
authoring = read(args.authoring)
count = 0
for r in authoring["families"]:
    if r["key"] not in authoring["hdRepaintProgress"]["registeredCandidateKeys"]:
        continue
    for binding in read(r["newFamilyPath"])["members"]:
        root = Path(".local/hd-packs") / binding["packId"] / binding["revision"]
        assert sha(root / "manifest.json") == binding["sha256"]
        for variant in read(root / "manifest.json")["variants"]:
            for page in variant["pages"]:
                for role in ("base", "data", "map"):
                    if role not in page:
                        continue
                    file = root / page[role]
                    assert sha(file) == page[role + "Sha256"]
                    assert file.stat().st_size == page[role + "Bytes"]
                    destination = args.output / (page[role + "Sha256"] + ".rgba")
                    if destination.exists():
                        continue
                    image = Image.open(file).convert("RGBA")
                    with destination.open("xb") as stream:
                        stream.write(struct.pack("<II", *image.size) + image.tobytes())
                    count += 1
print(count, "new verified decoded pages")

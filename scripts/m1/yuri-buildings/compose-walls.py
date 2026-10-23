"""Three native damage levels and sixteen connections from rigid wall parts."""
import sys
from PIL import Image
from production_common import ROOT, Family, row_for, decode, clip

output = sys.argv[1]
source = ROOT / 'production-art-v1/GAFWLL/parts-raw.png'
sheet = Image.open(source).convert('RGBA')
# The generated rows have unequal heights. These measured gutters separate
# complete objects; an assumed equal-height grid would truncate tall posts.
rows = (0, 407, 803, sheet.height)
dry = row_for('GAFWLL')
dry_member = dry['members'][0]

for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        f = Family('GAFWLL', theater, density, output)
        member = f.row['members'][0]
        for damage in range(3):
            parts = []
            for column, connection in enumerate((0, 5, 10)):
                bounds = (round(column * sheet.width / 3), rows[damage],
                          round((column + 1) * sheet.width / 3), rows[damage + 1])
                parts.append(f.register(sheet.crop(bounds), decode(dry, dry_member, damage * 16 + connection).getbbox(),
                                        source, proportional=True, source_region=bounds))
            arms = {}
            center = dry_member['canvas'][0] // 2
            for bit, axis, lo, hi in ((1, 1, center, dry_member['canvas'][0]), (4, 1, 0, center),
                                      (2, 2, center, dry_member['canvas'][0]), (8, 2, 0, center)):
                arm = f.blank()
                arm.paste(parts[axis].crop((lo * density, 0, hi * density, f.size[1])), (lo * density, 0))
                arms[bit] = arm
            for connection in range(16):
                n = damage * 16 + connection
                if connection in (5, 10):
                    image = parts[1 if connection == 5 else 2].copy()
                else:
                    image = f.blank()
                    for bit in (1, 8):
                        if connection & bit:
                            image.alpha_composite(arms[bit])
                    image.alpha_composite(parts[0])
                    for bit in (2, 4):
                        if connection & bit:
                            image.alpha_composite(arms[bit])
                image = clip(image, f.native_mask(member, n))
                f.put(member, n, f.snow(member, n, image),
                    f'Fixed rigid native connection bits {connection}; damage level {damage}; neutral brick/gold/spikes; no owner paint')
        f.export()

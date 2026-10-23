"""Convert the generated PNG master into native application icon containers."""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
icons = ROOT / 'desktop/icons'
master = icons / 'app-icon-master.png'

def resize(size, destination):
    subprocess.run(['magick', str(master), '-resize', f'{size}x{size}', '-depth', '8',
                    f'PNG32:{destination}'], check=True)

resize(1024, icons / 'app-icon.png')
with tempfile.TemporaryDirectory(prefix='ra2-app-icons-') as temporary:
    iconset = Path(temporary) / 'AppIcon.iconset'
    iconset.mkdir()
    for size in [16, 32, 128, 256, 512]:
        resize(size, iconset / f'icon_{size}x{size}.png')
        resize(size * 2, iconset / f'icon_{size}x{size}@2x.png')
    subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(icons / 'app-icon.icns')], check=True)
subprocess.run(['magick', str(icons / 'app-icon.png'), '-define',
                'icon:auto-resize=256,128,64,48,32,24,16', str(icons / 'app-icon.ico')], check=True)

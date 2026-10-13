"""Scan supplied collections and create display copies. Never write originals.
Run when adding/removing assets; start refreshes this manifest automatically.
"""
from pathlib import Path
import json
from PIL import Image, ImageOps

root = Path(__file__).resolve().parent.parent
source = root / 'assets NEW'
preview = root / 'assets' / 'updated-previews'

def collection(folder, size):
    result = []
    for path in sorted((source / folder).glob('*.jpg')):
        destination = preview / folder / path.name
        destination.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(path) as original:
            # Imposed print coordinates refer to encoded pixels, not EXIF's
            # display rotation. These JPEGs carry orientation=3 (180 degrees).
            image = original.copy() if folder in ('EDITION 1', 'CUSTOM EDITION BACKS') else ImageOps.exif_transpose(original)
            width, height = image.size
            if not destination.exists() or destination.stat().st_mtime < path.stat().st_mtime:
                image.thumbnail(size)
                image.convert('RGB').save(destination, quality=90, optimize=True)
        result.append({'id': ('custom:' if folder == 'CUSTOM EDITION BACKS' and path.name == '00. COVER.jpg' else '') + path.stem, 'name': path.name, 'src': str(path.relative_to(root)),
                       'previewSrc': str(destination.relative_to(root)), 'width': width, 'height': height,
                       'orientation': 'horizontal' if width > height else 'vertical'})
    return result

gallery = collection('IMAGE GALLERY', (1400, 1400))
heroes = collection('HERO IMAGES', (2560, 1440))
first = collection('EDITION 1', (1800, 2546))
custom = collection('CUSTOM EDITION BACKS', (1800, 2546))
assert len(heroes) == 6 and len(first) == 18 and len(custom) == 10
# Removed gallery IDs remain resolvable in saved snapshots, never in the gallery.
legacy = []
for path in sorted((root / 'assets').glob('*.jpg')):
    if path.stem in {a['id'] for a in gallery}:
        continue
    with Image.open(path) as image:
        w, h = image.size
    legacy.append({'id': path.stem, 'name': path.name, 'src': 'assets/' + path.name,
                   'previewSrc': 'assets/previews/' + path.name, 'width': w, 'height': h,
                   'orientation': 'horizontal' if w > h else 'vertical'})
text = ''.join('export const ' + name + ' = ' + json.dumps(data, indent=2) + ';\n'
               for name, data in [('ASSETS', gallery), ('LEGACY_ASSETS', legacy),
                                  ('HERO_ASSETS', heroes), ('FIRST_ASSETS', first), ('CUSTOM_ASSETS', custom)])
manifest = root / 'js/assets-data.js'
manifest.with_suffix('.tmp').write_text(text)
manifest.with_suffix('.tmp').replace(manifest)
print(f'Assets: {len(gallery)} gallery, {len(heroes)} heroes, {len(first)} first, {len(custom)} custom; {len(legacy)} saved-asset fallbacks.')

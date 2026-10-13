"""Verify source paths, unique IDs, preview orientation and original-copy hashes."""
from pathlib import Path
import hashlib, json, re, sys
from PIL import Image
root = Path(__file__).resolve().parent.parent
collections = dict((name, json.loads(data)) for name, data in re.findall(r'export const (\w+) = (.*?);\n', (root/'js/assets-data.js').read_text(), re.S))
entries = [a for name, group in collections.items() if name != 'LEGACY_ASSETS' for a in group]
assert len(entries) == 75
assert len({a['id'] for a in entries}) == 75
for asset in entries:
    src, preview = root/asset['src'], root/asset['previewSrc']
    assert src.is_file() and preview.is_file()
    assert src.name == preview.name == asset['name']
    with Image.open(src) as original, Image.open(preview) as display:
        assert abs(display.width/display.height - asset['width']/asset['height']) < .005
        if src.parent.name in ('EDITION 1', 'CUSTOM EDITION BACKS'):
            # The preview must remain in raw unrotated print coordinates even
            # when original EXIF orientation requests a display rotation.
            for x, y in [(.2,.2),(.8,.2),(.2,.8),(.8,.8)]:
                a=original.convert('RGB').getpixel((int(x*original.width),int(y*original.height)))
                b=display.convert('RGB').getpixel((int(x*display.width),int(y*display.height)))
                assert max(abs(v-w) for v,w in zip(a,b)) < 45, (src, x, y, a, b)
if len(sys.argv)>1:
    origin=Path(sys.argv[1])
    for asset in entries:
        relative=Path(asset['src']).relative_to('assets NEW')
        assert hashlib.sha256((origin/relative).read_bytes()).digest() == hashlib.sha256((root/asset['src']).read_bytes()).digest()
    print('PASS: all 75 original copies are byte-identical to the supplied source files.')
print('PASS: 75 unique source/preview paths, original filenames, aspect ratios and raw print-layout orientation.')

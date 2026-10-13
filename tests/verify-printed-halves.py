"""Render the actual PDF and inspect left/right portions and top-page rotations.
Run after node --test tests/*.test.js. Requires Pillow and pdftoppm.
"""
from pathlib import Path
import subprocess
from PIL import Image

root = Path(__file__).resolve().parent.parent
folder = root / 'tmp/pdfs/split-render'
folder.mkdir(exist_ok=True)
for path in folder.glob('sheet-*.png'):
    path.unlink()
subprocess.run(['pdftoppm', '-scale-to', '1000', '-png',
                str(root / 'tmp/pdfs/spread-halves-proof.pdf'), str(folder / 'sheet')], check=True)
paths = sorted(folder.glob('sheet-*.png'))
assert len(paths) == 18
for path in paths[2::2]:
    image = Image.open(path).convert('RGB')
    width, height = image.size
    # Photo mapping: TL=odd right/blue, TR=even left/red, BL=even left/red, BR=odd right/blue.
    for x, y, color in [(0.25,0.20,'blue'),(0.75,0.20,'red'),(0.25,0.70,'red'),(0.75,0.70,'blue')]:
        r,g,b = image.getpixel((round(width*x), round(height*y)))
        assert (r>150 and b<80) if color=='red' else (b>150 and r<80), (path, x, y, (r,g,b))
    # The source has white corner markers. Their positions prove the complete
    # top-page portion rotates 180 degrees, while the bottom portions stay upright.
    for x,y in [(0.107143,0.424242),(0.892857,0.424242),(0.107143,0.575758),(0.892857,0.575758)]:
        pixel = image.getpixel((round(width*x),round(height*y)))
        assert min(pixel)>230, (path, 'incorrect portion or quadrant rotation',x,y,pixel)
print('PASS: all eight rasterized A2 interiors show distinct correct left/right portions and individually rotated top pages.')

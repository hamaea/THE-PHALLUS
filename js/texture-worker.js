// Image decoding and page/spread composition stay off the interaction thread.
const sources = new Map();
async function source(url) {
  if (sources.has(url)) { const bitmap = sources.get(url); sources.delete(url); sources.set(url, bitmap); return bitmap; }
  const response = await fetch(url);
  if (!response.ok) throw new Error('Unable to load preview image.');
  const bitmap = await createImageBitmap(await response.blob());
  sources.set(url, bitmap);
  while (sources.size > 8) { const [key, old] = sources.entries().next().value; old.close(); sources.delete(key); }
  return bitmap;
}
function fit(ctx, image, sx, sy, sw, sh, x, y, w, h, contain) {
  const scale = (contain ? Math.min : Math.max)(w / sw, h / sh);
  const dw = sw * scale, dh = sh * scale;
  ctx.drawImage(image, sx, sy, sw, sh, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      const { id, descriptor: d, url } = data;
      const w = d.previewWidth || 768, h = d.previewWidth ? Math.round(w * 594 / 420) : d.cover ? 1112 : 1086;
      const canvas = new OffscreenCanvas(w, h), ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      if (url) {
        const image = await source(url);
        ctx.save();
        if (d.flipX) { ctx.translate(w, 0); ctx.scale(-1, 1); }
        if (d.rotation === 180) { ctx.translate(w, h); ctx.rotate(Math.PI); }
        const r = d.rect || { x: 0, y: 0, width: 1, height: 1 };
        const frame = d.frame || { x: 0, width: 1 };
        if (d.imposedPhoto) {
          // Fit to the complete portrait A2 image-side sheet, then clip this
          // folded quarter. Oversized cover margins are geometry, not a crop.
          const pageH = Math.round(w * 297 / 210);
          const imposed = new OffscreenCanvas(w, pageH), pageContext = imposed.getContext('2d');
          const scale = Math.max((w * 2) / image.width, (pageH * 2) / image.height);
          const dw = image.width * scale, dh = image.height * scale;
          pageContext.drawImage(image, (w * 2 - dw) / 2 - r.x * w * 2,
            (pageH * 2 - dh) / 2 - r.y * pageH * 2, dw, dh);
          fit(ctx, imposed, 0, 0, w, pageH, 0, 0, w, h, false);
        } else fit(ctx, image, r.x * image.width, r.y * image.height, r.width * image.width, r.height * image.height,
          frame.x * w, 0, frame.width * w, h, Boolean(d.contain));
        ctx.restore();
      }
      // ImageBitmap ignores Texture.flipY. Perform the flip at bitmap creation.
      const bitmap = await createImageBitmap(canvas, { imageOrientation: 'flipY' });
      self.postMessage({ id, bitmap }, [bitmap]);
    } catch (error) { self.postMessage({ id: data.id, error: error.message }); }
  });
};

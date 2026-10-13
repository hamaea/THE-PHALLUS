import '../vendor/pdf-lib.min.js';
import { generatePurchasedPdf, generateOrderPdf } from './pdf.js';
import { assetById, assetUrl } from './assets.js';
self.onmessage = async ({ data }) => {
  try {
    const loadBytes = async asset => {
      const response = await fetch(assetUrl(asset));
      if (!response.ok) throw new Error(`Could not load original ${asset.name}.`);
      return response.arrayBuffer();
    };
    const options = { ...data.options, onProgress: message => self.postMessage({ progress: message }) };
    const bytes = data.order ? await generateOrderPdf(data.order,assetById,loadBytes,options)
      : await generatePurchasedPdf(data.orders,data.orderId,data.itemId,assetById,loadBytes,options);
    self.postMessage({ bytes }, [bytes.buffer]);
  } catch (error) { self.postMessage({ error: error.message }); }
};

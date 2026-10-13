import { pageImageFrame } from './book.js';
import { printPlan, quadrantRect, A2 } from './imposition.js';
import { assetById } from './assets.js';
import { exportItem, quantityOf, editionName } from './commerce.js';
const mm = value => value * 72 / 25.4;

// Embed original JPEGs once, then reuse them. Layout, text, clipping and transforms
// remain vector-based. No screenshot or canvas rasterization of whole sheets.
export async function generateBookPdf(book, assets, loadBytes, { debug = false, proof = false, duplex = true, pdfLib = globalThis.PDFLib, onProgress = () => {} } = {}) {
  if (!pdfLib) throw new Error('The local PDF library did not load. Refresh and try again.');
  const { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState,
    concatTransformationMatrix, rectangle, clip, endPath } = pdfLib;
  const pdf = await PDFDocument.create();
  pdf.setTitle('THE PHALLUS - A2 imposed edition');
  pdf.setSubject('A2 print layouts: cover, then interior sheets 1-8; front/back pairs.');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const width = mm(A2.widthMm), height = mm(A2.heightMm), images = new Map();
  const plan = printPlan(book, { duplex });
  const ids = new Set([...(proof ? [] : book.placements.map(p => p.assetId)),
    ...plan.map(sheet => sheet.face === 'reverse' ? sheet.reverseId : sheet.kind === 'cover' || book.edition === 'first' && !proof ? sheet.sourceId : null)].filter(Boolean));
  for (const id of ids) {
    const asset = assets.get(id) || assetById.get(id);
    if (!asset) throw new Error(`Missing export image: ${id}`);
    onProgress(`Loading original image ${images.size + 1} / ${ids.size}…`);
    images.set(id, await pdf.embedJpg(await loadBytes(asset)));
  }
  const text = (page, value, x, y, size = 12, color = rgb(0, 0, 0)) => page.drawText(value, { x, y, size, font, color });
  const fitImage = (page, image, rect, contain = false) => {
    const scale = (contain ? Math.min : Math.max)(rect.width / image.width, rect.height / image.height);
    const imageWidth = image.width * scale, imageHeight = image.height * scale;
    page.pushOperators(pushGraphicsState(), rectangle(rect.x, rect.y, rect.width, rect.height), clip(), endPath());
    page.drawImage(image, { x: rect.x + (rect.width - imageWidth) / 2,
      y: rect.y + (rect.height - imageHeight) / 2, width: imageWidth, height: imageHeight });
    page.pushOperators(popGraphicsState());
  };
  const renderReaderPage = (pdfPage, readerPage, pageWidth, pageHeight) => {
    if (proof || readerPage.placeholder) {
      const black = !proof && readerPage.tone === 'black', ink = black ? rgb(1, 1, 1) : rgb(0, 0, 0);
      pdfPage.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: black ? rgb(0, 0, 0) : rgb(1, 1, 1) });
      text(pdfPage, `PAGE ${readerPage.pageNumber}`, 40, pageHeight / 2, 46, ink);
      text(pdfPage, proof ? 'TOP ^' : 'FIRST EDITION / PLACEHOLDER', 40, pageHeight / 2 - 25, 12, ink);
      if (proof) for (const [label, x, y] of [['TL', 20, pageHeight - 40], ['TR', pageWidth - 50, pageHeight - 40], ['BL', 20, 25], ['BR', pageWidth - 50, 25]]) text(pdfPage, label, x, y, 22);
    } else {
      const frame = pageImageFrame(book, readerPage.pageNumber);
      if (frame) {
        // Clip to THIS page, then fit to the source's full page/spread box.
        // Page 1 sees its left portion; Page 2 sees its right portion. Neither
        // quadrant refits the entire source to a single page.
        pdfPage.pushOperators(pushGraphicsState(), rectangle(0, 0, pageWidth, pageHeight), clip(), endPath());
        fitImage(pdfPage, images.get(frame.placement.assetId), { x: frame.x * pageWidth,
          y: 0, width: frame.width * pageWidth, height: frame.height * pageHeight });
        pdfPage.pushOperators(popGraphicsState());
      }
    }
    if (debug) {
      pdfPage.drawRectangle({ x: 4, y: 4, width: 80, height: 17, color: rgb(1, 1, 1) });
      text(pdfPage, `PAGE ${readerPage.pageNumber}`, 8, 8, 10);
    }
  };
  for (const [index, sheet] of plan.entries()) {
    onProgress(`Rendering A2 side ${index + 1} / ${plan.length}…`);
    const page = pdf.addPage([width, height]);
    if (sheet.face === 'reverse' || book.edition === 'first' && !proof && sheet.kind === 'interior') {
      const image = images.get(sheet.face === 'reverse' ? sheet.reverseId : sheet.sourceId);
      if (!image) throw new Error('Missing print layout.');
      fitImage(page, image, { x: 0, y: 0, width, height }, true);
      continue;
    }
    if (sheet.kind === 'cover') {
      const image = images.get(sheet.sourceId);
      if (image) fitImage(page, image, { x: 0, y: 0, width, height }, !book.cover.assetId || book.edition === 'first');
      else {
        text(page, 'THE PHALLUS', 50, height / 2 + 40, 36);
        text(page, 'A2 COVER / IMAGE PLACEHOLDER', 50, height / 2, 20);
      }
      if (debug) {
        page.drawRectangle({ x: 4, y: 4, width: 260, height: 17, color: rgb(1, 1, 1) });
        text(page, 'COVER / 420 x 594 mm / IMAGE SIDE', 8, 8, 10);
      }
      continue;
    }
    for (const quadrant of sheet.quadrants) {
      const rect = quadrantRect(quadrant.position, width, height);
      // Rotate THIS complete reader-page coordinate space, never a shared top row.
      page.pushOperators(pushGraphicsState(), quadrant.rotation === 180
        ? concatTransformationMatrix(-1, 0, 0, -1, rect.x + rect.width, rect.y + rect.height)
        : concatTransformationMatrix(1, 0, 0, 1, rect.x, rect.y));
      renderReaderPage(page, quadrant.page, rect.width, rect.height);
      page.pushOperators(popGraphicsState());
      if (debug) {
        page.drawRectangle({ x: rect.x + 4, y: rect.y + rect.height - 22, width: 200, height: 18, color: rgb(1, 1, 1) });
        text(page, `SHEET ${sheet.sheet} / PAGE ${quadrant.pageNumber} / ${quadrant.rotation} deg`, rect.x + 8, rect.y + rect.height - 17, 10);
        page.drawRectangle({ ...rect, borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 0.5 });
      }
    }
  }
  return pdf.save();
}

export async function generatePurchasedPdf(orders, orderId, itemId, assets, loadBytes, options) {
  const item = exportItem(orders, orderId, itemId);
  return generateBookPdf(item.book, assets, loadBytes, options);
}

export async function generateOrderPdf(order, assets, loadBytes, options = {}) {
  if (order?.status !== 'simulated-paid' || !order.items?.length) throw new Error('A completed order is required.');
  const pdfLib = options.pdfLib || globalThis.PDFLib;
  const { PDFDocument, PDFName, PDFNumber, PDFString } = pdfLib;
  const pdf = await PDFDocument.create(), labels = [], bookmarks = [];
  const outlines = pdf.context.obj({Type:'Outlines'}), outlineRef = pdf.context.register(outlines);
  pdf.setTitle('THE PHALLUS - Complete A2 Order');
  for (const [index,item] of order.items.entries()) {
    const quantity = quantityOf(item);
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Invalid order quantity.');
    const bytes = await generateBookPdf(item.book,assets,loadBytes,{...options,duplex:true,
      onProgress:message => options.onProgress?.(`Book ${index+1} / ${order.items.length}: ${message}`)});
    const source = await PDFDocument.load(bytes);
    const pages = await pdf.copyPages(source,source.getPageIndices());
    for (let copy=0;copy<quantity;copy++) {
      const start = pdf.getPageCount(), title = `${editionName(item)} ${index+1} / COPY ${copy+1}`;
      // Reuse embedded original images/resources between copies, but give each
      // copy independent page dictionaries. Never interleave different books.
      for (const page of pages) {
        const node = page.node.clone(pdf.context);
        pdf.addPage(pdfLib.PDFPage.of(node,pdf.context.register(node),pdf));
      }
      labels.push(PDFNumber.of(start),pdf.context.obj({S:'D',St:1,P:PDFString.of(`${title} / A2 SIDE `)}));
      const bookmark = pdf.context.obj({Title:PDFString.of(title),Parent:outlineRef,
        Dest:[pdf.getPage(start).ref,PDFName.of('Fit')]});
      bookmarks.push({node:bookmark,ref:pdf.context.register(bookmark)});
    }
  }
  bookmarks.forEach((mark,index) => {
    if (index) mark.node.set(PDFName.of('Prev'),bookmarks[index-1].ref);
    if (index+1<bookmarks.length) mark.node.set(PDFName.of('Next'),bookmarks[index+1].ref);
  });
  outlines.set(PDFName.of('First'),bookmarks[0].ref); outlines.set(PDFName.of('Last'),bookmarks.at(-1).ref);
  outlines.set(PDFName.of('Count'),PDFNumber.of(bookmarks.length));
  pdf.catalog.set(PDFName.of('Outlines'),outlineRef);
  pdf.catalog.set(PDFName.of('PageLabels'),pdf.context.obj({Nums:labels}));
  return pdf.save();
}

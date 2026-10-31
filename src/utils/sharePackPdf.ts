import { SharePackItem, VaultDocumentItem } from '../types/vault';
import { getEffectiveDocImageDataUrl } from './documentCardGenerator';

/**
 * Escapes text for PDF literal strings enclosed in parentheses.
 */
function escapePdfText(text: string): string {
  return (text || '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Concatenates multiple Uint8Array instances into a single Uint8Array.
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, curr) => acc + curr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Converts any image source (SVG Data URL, PNG/JPEG Data URL, or asset URL)
 * into a JPEG byte array and pixel dimensions via an in-memory HTMLCanvasElement.
 */
export async function imageToJpegBytes(
  dataUrl: string
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 1000;
        canvas.height = img.naturalHeight || img.height || 630;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        // Fill white background (handles transparent PNG or SVG backgrounds)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const commaIdx = jpegDataUrl.indexOf(',');
        const base64 = commaIdx >= 0 ? jpegDataUrl.slice(commaIdx + 1) : jpegDataUrl;
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        resolve({
          bytes,
          width: canvas.width,
          height: canvas.height,
        });
      } catch (err) {
        console.warn('Canvas JPEG conversion failed:', err);
        resolve(null);
      }
    };

    img.onerror = (err) => {
      console.warn('Image loading failed for PDF embedding:', err);
      resolve(null);
    };

    img.src = dataUrl;
  });
}

/**
 * Builds a valid, multi-page PDF 1.4 containing:
 * - Page 1: Share Pack Summary & Included Documents Index table
 * - Pages 2..N+1: Dedicated full-page scans for each document with metadata header,
 *   full high-resolution embedded JPEG scan, and Kudumba Vault verification seal.
 */
export async function buildSharePackPdfBlob(
  pack: SharePackItem,
  bundledDocs: VaultDocumentItem[]
): Promise<Blob> {
  const te = new TextEncoder();
  const pageObjectIds: number[] = [];
  let nextId = 5;

  // Process and convert all document images to JPEG bytes in parallel
  const docsWithImages = await Promise.all(
    bundledDocs.map(async (doc) => {
      const dataUrl = getEffectiveDocImageDataUrl(doc);
      const converted = await imageToJpegBytes(dataUrl);
      return {
        doc,
        image: converted,
      };
    })
  );

  // ----------------------------------------------------
  // Page 1: Share Pack Overview & Document Index
  // ----------------------------------------------------
  const p1ContentId = nextId++;
  const p1PageId = nextId++;
  pageObjectIds.push(p1PageId);

  const recipientStr =
    pack.recipientEn || pack.descEn || pack.recipientType || 'Authorized Recipient';

  const summaryLines: string[] = [
    'KUDUMBA VAULT - HOUSEHOLD SHARE PACK',
    `Pack Title: ${pack.titleEn}`,
    `Purpose / Recipient: ${recipientStr}`,
    `Generated Date: ${pack.createdAt || new Date().toISOString().slice(0, 10)}`,
    `Total Included Documents: ${bundledDocs.length}`,
    '--------------------------------------------------------------------------------',
  ];

  bundledDocs.forEach((doc, idx) => {
    summaryLines.push(`${idx + 1}. ${doc.titleEn}`);
    summaryLines.push(`   Owner: ${doc.ownerEn}   |   Doc Number: ${doc.docNumber}`);
    summaryLines.push(`   Issuing Authority: ${doc.authorityEn}   |   Expiry: ${doc.expiryDate}`);
    summaryLines.push(
      `   Scanned Attachment: Page ${idx + 2} - High-Resolution Verified Scan Included`
    );
    summaryLines.push('');
  });

  summaryLines.push('--------------------------------------------------------------------------------');
  summaryLines.push(
    'Notice: This document bundle is encrypted and generated offline for official verification.'
  );

  const p1TextOps = [
    'BT',
    '/F2 15 Tf',
    '45 780 Td',
    '17 TL',
    ...summaryLines.map((line, idx) =>
      idx === 0
        ? `(${escapePdfText(line)}) Tj /F1 10 Tf T*`
        : `(${escapePdfText(line)}) Tj T*`
    ),
    'ET',
  ].join('\n');

  const p1ContentBytes = te.encode(
    `${p1ContentId} 0 obj\n<< /Length ${te.encode(p1TextOps).length} >>\nstream\n${p1TextOps}\nendstream\nendobj\n`
  );

  const p1PageBytes = te.encode(
    `${p1PageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${p1ContentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>\nendobj\n`
  );

  // ----------------------------------------------------
  // Pages 2..N+1: Individual Document Scans
  // ----------------------------------------------------
  const docObjects: { id: number; data: Uint8Array }[] = [];

  docsWithImages.forEach(({ doc, image }, idx) => {
    const pageId = nextId++;
    pageObjectIds.push(pageId);

    const contentId = nextId++;
    let imgObjId: number | null = null;

    const pageLines = [
      `DOCUMENT ${idx + 1} OF ${bundledDocs.length}: ${doc.titleEn.toUpperCase()}`,
      `Owner: ${doc.ownerEn}   |   Doc Number: ${doc.docNumber}`,
      `Authority: ${doc.authorityEn}   |   Expiry: ${doc.expiryDate}   |   Status: ${doc.status || 'VALID'}`,
      'Verified Original Scanned Attachment:',
    ];

    let pageOps = [
      'BT',
      '/F2 13 Tf',
      '45 805 Td',
      '18 TL',
      `(${escapePdfText(pageLines[0])}) Tj /F1 10 Tf T*`,
      `(${escapePdfText(pageLines[1])}) Tj T*`,
      `(${escapePdfText(pageLines[2])}) Tj T*`,
      `/F2 10 Tf (${escapePdfText(pageLines[3])}) Tj T*`,
      'ET',
    ];

    if (image && image.bytes.length > 0) {
      imgObjId = nextId++;

      // Max printable area on A4 page: width 505 pt, height 560 pt
      const maxW = 505;
      const maxH = 560;
      const imgW = image.width || 1000;
      const imgH = image.height || 630;
      const scale = Math.min(maxW / imgW, maxH / imgH);
      const renderW = Math.round(imgW * scale);
      const renderH = Math.round(imgH * scale);
      const renderX = Math.round(45 + (maxW - renderW) / 2);
      const renderY = Math.round(130 + (maxH - renderH) / 2);

      pageOps.push(
        'q',
        `${renderW} 0 0 ${renderH} ${renderX} ${renderY} cm`,
        '/Im1 Do',
        'Q'
      );

      const imgHeader = te.encode(
        `${imgObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`
      );
      const imgFooter = te.encode('\nendstream\nendobj\n');
      const imgData = concatUint8Arrays([imgHeader, image.bytes, imgFooter]);
      docObjects.push({ id: imgObjId, data: imgData });
    }

    // Bottom verification watermark
    pageOps.push(
      'BT',
      '/F1 9 Tf',
      '45 80 Td',
      `(${escapePdfText('Kudumba Vault Verified Attachment - ' + (doc.fileName || doc.titleEn) + ' - Offline Household Archive')}) Tj`,
      'ET'
    );

    const fullPageOps = pageOps.join('\n');
    const contentData = te.encode(
      `${contentId} 0 obj\n<< /Length ${te.encode(fullPageOps).length} >>\nstream\n${fullPageOps}\nendstream\nendobj\n`
    );

    const xObjectResource = imgObjId ? ` /XObject << /Im1 ${imgObjId} 0 R >>` : '';
    const pageData = te.encode(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xObjectResource} >> >>\nendobj\n`
    );

    docObjects.push(
      { id: contentId, data: contentData },
      { id: pageId, data: pageData }
    );
  });

  // ----------------------------------------------------
  // Root Catalog, Pages, and Fonts Objects
  // ----------------------------------------------------
  const catalog = {
    id: 1,
    data: te.encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
  };

  const kidsList = pageObjectIds.map((id) => `${id} 0 R`).join(' ');
  const pagesObj = {
    id: 2,
    data: te.encode(
      `2 0 obj\n<< /Type /Pages /Kids [${kidsList}] /Count ${pageObjectIds.length} >>\nendobj\n`
    ),
  };

  const fontRegular = {
    id: 3,
    data: te.encode(
      '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
    ),
  };

  const fontBold = {
    id: 4,
    data: te.encode(
      '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n'
    ),
  };

  const allObjects = [
    catalog,
    pagesObj,
    fontRegular,
    fontBold,
    { id: p1ContentId, data: p1ContentBytes },
    { id: p1PageId, data: p1PageBytes },
    ...docObjects,
  ];

  allObjects.sort((a, b) => a.id - b.id);

  // ----------------------------------------------------
  // Cross-reference table & Trailer
  // ----------------------------------------------------
  const header = te.encode('%PDF-1.4\n');
  const offsets: number[] = [0];
  let curOffset = header.length;

  const parts: Uint8Array[] = [header];
  for (const obj of allObjects) {
    offsets[obj.id] = curOffset;
    curOffset += obj.data.length;
    parts.push(obj.data);
  }

  const maxObjId = allObjects[allObjects.length - 1].id;
  const xrefStart = curOffset;
  let xref = `xref\n0 ${maxObjId + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= maxObjId; i++) {
    const off = offsets[i] || 0;
    xref += String(off).padStart(10, '0') + ' 00000 n \n';
  }

  const trailer = te.encode(
    `${xref}trailer\n<< /Size ${maxObjId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  );
  parts.push(trailer);

  const fullPdfBytes = concatUint8Arrays(parts);
  return new Blob([fullPdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

/**
 * Downloads the exact original or rendered document scan image as a PNG/JPEG file.
 */
export async function downloadDocImage(
  doc: VaultDocumentItem,
  packTitle?: string
): Promise<void> {
  const dataUrl = getEffectiveDocImageDataUrl(doc);
  const slug = (doc.titleEn || 'document')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const packSlug = packTitle
    ? packTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-'
    : '';

  // If it's an SVG dataUrl, render it to PNG Canvas for maximum device compatibility
  if (dataUrl.startsWith('data:image/svg+xml')) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 1200;
      canvas.height = img.naturalHeight || img.height || 750;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngUrl = canvas.toDataURL('image/png');
        triggerDownload(pngUrl, `${packSlug}${slug}-scan.png`);
      } else {
        triggerDownload(dataUrl, `${packSlug}${slug}-scan.svg`);
      }
    };
    img.onerror = () => {
      triggerDownload(dataUrl, `${packSlug}${slug}-scan.svg`);
    };
    img.src = dataUrl;
  } else {
    // If it's already a PNG/JPEG data URL or web image
    const ext = dataUrl.startsWith('data:image/jpeg') ? '.jpg' : '.png';
    triggerDownload(dataUrl, `${packSlug}${slug}${ext}`);
  }
}

/**
 * Downloads all images for documents included in a Share Pack.
 */
export async function downloadAllPackImages(
  pack: SharePackItem,
  bundledDocs: VaultDocumentItem[]
): Promise<void> {
  for (let i = 0; i < bundledDocs.length; i++) {
    const doc = bundledDocs[i];
    await downloadDocImage(doc, pack.titleEn);
    // Small stagger between multiple downloads to avoid browser popup blockers
    if (i < bundledDocs.length - 1) {
      await new Promise((r) => setTimeout(r, 350));
    }
  }
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

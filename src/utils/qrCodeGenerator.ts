/**
 * Pure TypeScript Standalone QR Code & UPI URI Generator.
 * Zero external dependencies. Generates valid SVG / Data URL QR codes.
 */

// Galois Field (GF(256)) math with primitive polynomial 0x11d (285)
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  LOG_TABLE[0] = 0;
})();

function gfMultiply(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
}

function rsComputePoly(ecCount: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < ecCount; i++) {
    const factor = new Uint8Array([1, EXP_TABLE[i]]);
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      for (let k = 0; k < factor.length; k++) {
        next[j + k] ^= gfMultiply(poly[j], factor[k]);
      }
    }
    poly = next;
  }
  return poly;
}

function rsCalculateRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const poly = rsComputePoly(ecCount);
  const remainder = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[ecCount - 1] = 0;
    for (let j = 0; j < ecCount; j++) {
      remainder[j] ^= gfMultiply(poly[j + 1], factor);
    }
  }
  return remainder;
}

// Version table: [version, totalCodewords, dataCodewordsL, ecCodewordsL, alignPatternCount]
// For UPI URIs (~70 to 140 bytes), versions 4, 5, 6, 7 cover all payload lengths
interface QrVersionInfo {
  version: number;
  size: number;
  dataBytes: number;
  ecBytes: number;
  alignPos: number[];
}

const QR_VERSIONS: QrVersionInfo[] = [
  { version: 4, size: 33, dataBytes: 78, ecBytes: 36, alignPos: [6, 26] },
  { version: 5, size: 37, dataBytes: 106, ecBytes: 48, alignPos: [6, 30] },
  { version: 6, size: 41, dataBytes: 134, ecBytes: 60, alignPos: [6, 34] },
  { version: 7, size: 45, dataBytes: 154, ecBytes: 72, alignPos: [6, 22, 38] },
  { version: 8, size: 49, dataBytes: 192, ecBytes: 88, alignPos: [6, 24, 42] },
];

export interface UpiUriParams {
  upiId: string;
  merchantName: string;
  amount: number;
  transactionNote?: string;
  refId?: string;
}

/**
 * Builds standard UPI Deep Link URI.
 * Format: upi://pay?pa=<UPI_ID>&pn=<NAME>&am=<AMOUNT>&cu=INR&tn=<NOTE>&tr=<REF_ID>
 */
export function buildUpiPaymentUri(params: UpiUriParams): string {
  const cleanId = params.upiId.trim();
  const cleanName = params.merchantName.trim();
  const cleanAmount = params.amount > 0 ? params.amount.toFixed(2) : '0.00';
  const cleanNote = (params.transactionNote || 'Kudumba Vault Subscription').trim().slice(0, 40);

  const queryParts = [
    `pa=${encodeURIComponent(cleanId)}`,
    `pn=${encodeURIComponent(cleanName)}`,
    `am=${cleanAmount}`,
    `cu=INR`,
    `tn=${encodeURIComponent(cleanNote)}`,
  ];

  if (params.refId) {
    queryParts.push(`tr=${encodeURIComponent(params.refId.trim())}`);
  }

  return `upi://pay?${queryParts.join('&')}`;
}

/**
 * Generates an SVG string representation of a QR matrix.
 */
export function generateQrMatrix(text: string): { size: number; modules: boolean[][] } {
  const textBytes = new TextEncoder().encode(text);
  
  // Find appropriate version
  let versionInfo = QR_VERSIONS.find((v) => v.dataBytes >= textBytes.length + 3);
  if (!versionInfo) {
    versionInfo = QR_VERSIONS[QR_VERSIONS.length - 1];
  }

  const { size, dataBytes, ecBytes, alignPos } = versionInfo;

  // 1. Prepare bit stream: [Mode: 8-bit Byte = 0100] [Count: 8 bits] [Data] [Terminator: 0000]
  const bitStream: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitStream.push((val >> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(textBytes.length, 8); // Character count indicator
  for (const byte of textBytes) {
    pushBits(byte, 8);
  }
  // Terminator
  const maxDataBits = dataBytes * 8;
  const termLen = Math.min(4, maxDataBits - bitStream.length);
  pushBits(0, termLen);

  // Pad to byte boundary
  while (bitStream.length % 8 !== 0) {
    bitStream.push(0);
  }

  // Pad bytes: alternating 0xEC, 0x11
  const padPatterns = [0xec, 0x11];
  let padIdx = 0;
  while (bitStream.length < maxDataBits) {
    pushBits(padPatterns[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bitStream to data codewords Uint8Array
  const dataWords = new Uint8Array(dataBytes);
  for (let i = 0; i < dataBytes; i++) {
    let word = 0;
    for (let b = 0; b < 8; b++) {
      word = (word << 1) | bitStream[i * 8 + b];
    }
    dataWords[i] = word;
  }

  // Error correction remainder
  const ecWords = rsCalculateRemainder(dataWords, ecBytes);

  // Combine data + EC into all codewords
  const totalWords = new Uint8Array(dataBytes + ecBytes);
  totalWords.set(dataWords, 0);
  totalWords.set(ecWords, dataBytes);

  // Initialize matrix: null = unset, true = black, false = white
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

  // Function patterns: Finder Patterns (7x7) + Separators (8x8)
  function applyFinder(startX: number, startY: number) {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const px = startX + x;
        const py = startY + y;
        if (px >= 0 && px < size && py >= 0 && py < size) {
          if (x >= 0 && x <= 6 && y >= 0 && y <= 6) {
            const isBorder = x === 0 || x === 6 || y === 0 || y === 6;
            const isCenter = x >= 2 && x <= 4 && y >= 2 && y <= 4;
            matrix[py][px] = isBorder || isCenter;
          } else {
            matrix[py][px] = false;
          }
        }
      }
    }
  }

  applyFinder(0, 0);
  applyFinder(size - 7, 0);
  applyFinder(0, size - 7);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }

  // Alignment patterns
  for (const ay of alignPos) {
    for (const ax of alignPos) {
      if (matrix[ay][ax] !== null) continue; // Skip if already overlaps finder pattern
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const isBorder = Math.abs(dx) === 2 || Math.abs(dy) === 2;
          const isCenter = dx === 0 && dy === 0;
          matrix[ay + dy][ax + dx] = isBorder || isCenter;
        }
      }
    }
  }

  // Dark module
  matrix[size - 8][8] = true;

  // Format reserve bits (will be set with mask)
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = 0; i < 8; i++) {
    if (matrix[8][size - 1 - i] === null) matrix[8][size - 1 - i] = false;
    if (matrix[size - 1 - i][8] === null) matrix[size - 1 - i][8] = false;
  }

  // Data Placement (zigzag right to left, up and down)
  let wordIdx = 0;
  let bitIdx = 7;
  let upward = true;

  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const y of rows) {
      for (let xOffset = 0; xOffset < 2; xOffset++) {
        const x = right - xOffset;
        if (matrix[y][x] === null) {
          let bit = false;
          if (wordIdx < totalWords.length) {
            bit = ((totalWords[wordIdx] >> bitIdx) & 1) === 1;
            bitIdx--;
            if (bitIdx < 0) {
              bitIdx = 7;
              wordIdx++;
            }
          }
          // Mask pattern 0: (row + col) % 2 === 0
          const mask = (y + x) % 2 === 0;
          matrix[y][x] = bit !== mask;
        }
      }
    }
    upward = !upward;
  }

  // Format string for Mask 0 and Error Correction L (format bits: 111011111000100)
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  // Apply format bits around top-left, top-right, bottom-left
  const formatMapTopLeft = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  for (let i = 0; i < 15; i++) {
    const [y, x] = formatMapTopLeft[i];
    matrix[y][x] = formatBits[i] === 1;
  }

  const formatMapEdges = [
    [8, size - 1], [8, size - 2], [8, size - 3], [8, size - 4], [8, size - 5], [8, size - 6], [8, size - 7], [8, size - 8],
    [size - 7, 8], [size - 6, 8], [size - 5, 8], [size - 4, 8], [size - 3, 8], [size - 2, 8], [size - 1, 8],
  ];
  for (let i = 0; i < 15; i++) {
    const [y, x] = formatMapEdges[i];
    matrix[y][x] = formatBits[i] === 1;
  }

  return {
    size,
    modules: matrix.map((row) => row.map((cell) => cell ?? false)),
  };
}

/**
 * Generates an SVG string representation of the QR code.
 */
export function generateQrSvg(text: string, options: { margin?: number; sizePx?: number } = {}): string {
  const margin = options.margin ?? 3;
  const qr = generateQrMatrix(text);
  const totalSize = qr.size + margin * 2;
  const sizePx = options.sizePx ?? 280;

  let pathD = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) {
        pathD += `M${x + margin},${y + margin}h1v1h-1z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">
    <rect width="${totalSize}" height="${totalSize}" fill="#ffffff" />
    <path d="${pathD.trim()}" fill="#0b0b0c" />
  </svg>`;
}

/**
 * Returns a Data URL of the generated QR SVG.
 */
export function generateQrDataUrl(text: string, options: { margin?: number; sizePx?: number } = {}): string {
  const svg = generateQrSvg(text, options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

import bidiFactory from "bidi-js";

const bidi = bidiFactory();

const RTL_RANGE =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

/** True if the string contains any right-to-left (Hebrew/Arabic) characters. */
export function hasRtl(str: string): boolean {
  return RTL_RANGE.test(str);
}

/**
 * Whether a block of text should be laid out right-to-left. We treat a block as
 * RTL when its first strong-direction character is RTL (mirrors the browser's
 * `dir="auto"` heuristic used in the web UI).
 */
export function isRtlBlock(str: string): boolean {
  for (const ch of str) {
    if (RTL_RANGE.test(ch)) return true;
    // Basic Latin letters => LTR block.
    if (/[A-Za-z]/.test(ch)) return false;
  }
  return false;
}

/**
 * Reorder a logical-order string into visual order using the Unicode
 * Bidirectional Algorithm. pdfkit / fontkit shape glyphs but do NOT perform
 * bidi reordering, so Hebrew would otherwise render in reversed character
 * order. We do the reordering here before handing text to pdfkit.
 */
export function toVisual(str: string, baseRtl = isRtlBlock(str)): string {
  if (!hasRtl(str)) return str;
  const levels = bidi.getEmbeddingLevels(str, baseRtl ? "rtl" : "ltr");
  const segments = bidi.getReorderSegments(str, levels);
  const chars = Array.from(str);
  for (const [start, end] of segments) {
    const slice = chars.slice(start, end + 1).reverse();
    for (let i = 0; i < slice.length; i++) chars[start + i] = slice[i];
  }
  return chars.join("");
}

import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { marked, type Token } from "marked";
import bidiFactory from "bidi-js";
import { RUBIK_FONT_BASE64 } from "./font-data";

export const runtime = "nodejs";

// Pure-JS PDF generation (pdfkit + bidi-js). No native binaries, no headless
// browser — so this runs on any runtime (Node, Deno, edge/serverless).
//
// Hebrew support:
//   1. An embedded font (Rubik) that covers Latin + Hebrew + digits + punctuation.
//   2. bidi-js applies the full Unicode Bidirectional Algorithm (UAX #9) to
//      reorder each line into visual order, and pdfkit's font layout is forced
//      to LTR so it draws the pre-ordered glyphs without re-running bidi.

const bidi = bidiFactory();
const fontBuffer = Buffer.from(RUBIK_FONT_BASE64, "base64");

// Common mirrored bracket/paren pairs. bidi-js occasionally leaves these
// unmirrored for pure-RTL contexts, so we handle them explicitly.
const MIRROR: Record<string, string> = {
  "(": ")",
  ")": "(",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{",
  "<": ">",
  ">": "<",
};

const HEBREW_RE = /[\u0590-\u05FF]/;

function hasHebrew(s: string): boolean {
  return HEBREW_RE.test(s);
}

/** Decide the base paragraph direction from its content. */
function baseDir(s: string): "rtl" | "ltr" {
  const he = (s.match(/[\u0590-\u05FF]/g) || []).length;
  const lat = (s.match(/[A-Za-z]/g) || []).length;
  return he > 0 && he >= lat ? "rtl" : "ltr";
}

/**
 * Reorder a logical-order string into visual order using the Unicode Bidi
 * Algorithm, so it can be drawn left-to-right glyph by glyph.
 */
function toVisual(str: string, dir: "rtl" | "ltr"): string {
  const levels = bidi.getEmbeddingLevels(str, dir);
  const chars = Array.from(str);

  // Mirror brackets/parens that sit in an RTL run (odd embedding level).
  const mirrorMap = bidi.getMirroredCharactersMap(str, levels);
  mirrorMap.forEach((ch, idx) => {
    chars[idx] = ch;
  });
  for (let i = 0; i < chars.length; i++) {
    const lvl = levels.levels[i];
    if (lvl % 2 === 1 && MIRROR[chars[i]] && !mirrorMap.has(i)) {
      chars[i] = MIRROR[chars[i]];
    }
  }

  const segments = bidi.getReorderSegments(str, levels);
  for (const [start, end] of segments) {
    const slice = chars.slice(start, end + 1).reverse();
    for (let i = 0; i < slice.length; i++) chars[start + i] = slice[i];
  }
  return chars.join("");
}

type PdfKitFont = {
  font: {
    layout: (
      text: string,
      features?: unknown,
      script?: unknown,
      language?: unknown,
      direction?: string,
    ) => { glyphs: { advanceWidth: number }[]; positions: Record<string, number>[] };
    getVariation: (settings: Record<string, number>) => PdfKitFont["font"];
    ascent: number;
    descent: number;
  };
  scale: number;
  ascender: number;
  descender: number;
  layoutCache: unknown;
  layoutCached: (text: string) => unknown;
  layoutRun: (text: string, features?: unknown) => unknown;
};

/**
 * Point a registered pdfkit font at a specific weight of the variable font and
 * force its text layout to LTR (we reorder to visual order ourselves, so we
 * must stop pdfkit/fontkit from applying bidi a second time).
 */
function configureFont(fontObj: PdfKitFont, weight: number) {
  fontObj.font = fontObj.font.getVariation({ wght: weight });
  fontObj.ascender = fontObj.font.ascent * fontObj.scale;
  fontObj.descender = fontObj.font.descent * fontObj.scale;
  fontObj.layoutCache = null;
  fontObj.layoutCached = function (text: string) {
    return this.layoutRun(text);
  };
  fontObj.layoutRun = function (text: string, features?: unknown) {
    const run = this.font.layout(text, features, undefined, undefined, "ltr");
    for (let i = 0; i < run.positions.length; i++) {
      const position = run.positions[i];
      for (const key in position) {
        position[key] *= this.scale;
      }
      position.advanceWidth = run.glyphs[i].advanceWidth * this.scale;
    }
    return run;
  };
}

type Signature = {
  legalName: string;
  signatureData: string; // base64 PNG data URL
  signedAt: number;
};

export async function POST(req: NextRequest) {
  try {
    const { title, content, signature } = (await req.json()) as {
      title: string;
      content: string;
      signature?: Signature;
    };
    if (!content) {
      return NextResponse.json({ error: "Missing content" }, { status: 400 });
    }

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      info: { Title: title || "Contract" },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));

    // Register regular + bold from the single embedded variable font.
    doc.registerFont("Regular", fontBuffer);
    doc.registerFont("Bold", fontBuffer);
    const docInternal = doc as unknown as { _font: PdfKitFont };
    doc.font("Regular");
    configureFont(docInternal._font, 400);
    doc.font("Bold");
    configureFont(docInternal._font, 700);

    const FONT_REGULAR = "Regular";
    const FONT_BOLD = "Bold";
    const COLOR_TEXT = "#1a1a1a";
    const COLOR_MUTED = "#6b7280";
    const COLOR_LINK = "#2563eb";

    const PAGE_LEFT = 60;
    const CONTENT_WIDTH = 475;

    /**
     * Draw a single logical string with correct bidi ordering + alignment.
     * Falls back to LTR left-aligned for pure-Latin text.
     */
    function writeLine(
      text: string,
      opts: {
        font?: string;
        size?: number;
        color?: string;
        indent?: number;
        link?: string;
        forceDir?: "rtl" | "ltr";
      } = {},
    ) {
      const {
        font = FONT_REGULAR,
        size = 12,
        color = COLOR_TEXT,
        indent = 0,
        link,
        forceDir,
      } = opts;
      const dir = forceDir ?? baseDir(text);
      const visual = hasHebrew(text) || dir === "rtl" ? toVisual(text, dir) : text;
      // Strip bidi control characters before rendering since the font doesn't map glyphs for them.
      const cleanVisual = visual.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "");
      const left = PAGE_LEFT + indent * 20;
      const width = CONTENT_WIDTH - indent * 20;
      doc
        .font(font)
        .fontSize(size)
        .fillColor(color)
        .text(cleanVisual, left, doc.y, {
          width,
          align: dir === "rtl" ? "right" : "left",
          link,
          underline: !!link,
        });
    }

    // Title
    writeLine(title || "Contract", { font: FONT_BOLD, size: 22 });
    doc.moveDown(1);

    const tokens = marked.lexer(content);

    const headingSizes: Record<number, number> = {
      1: 19,
      2: 17,
      3: 15,
      4: 13,
      5: 12,
      6: 11,
    };

    // Flatten inline tokens to a plain string (bold/italic/link styling within a
    // mixed-direction line can't be expressed with per-run fonts without
    // breaking bidi ordering, so we render the text content correctly ordered).
    function inlineText(tokens: Token[] | undefined, fallback: string): string {
      if (!tokens) return fallback;
      let out = "";
      for (const t of tokens) {
        if ("tokens" in t && t.tokens) out += inlineText(t.tokens, "");
        else if ("text" in t && typeof t.text === "string") out += t.text;
        else if ("raw" in t && typeof t.raw === "string") out += t.raw;
      }
      return out || fallback;
    }

    function firstLink(tokens: Token[] | undefined): string | undefined {
      if (!tokens) return undefined;
      for (const t of tokens) {
        if (t.type === "link" && "href" in t) return t.href as string;
        if ("tokens" in t && t.tokens) {
          const nested = firstLink(t.tokens);
          if (nested) return nested;
        }
      }
      return undefined;
    }

    function renderTokens(tokenList: Token[], indent = 0) {
      for (const token of tokenList) {
        switch (token.type) {
          case "heading": {
            doc.moveDown(0.6);
            writeLine(inlineText(token.tokens, token.text), {
              font: FONT_BOLD,
              size: headingSizes[token.depth] ?? 12,
              indent,
            });
            doc.moveDown(0.3);
            break;
          }
          case "paragraph": {
            writeLine(inlineText(token.tokens, token.text), {
              indent,
              link: firstLink(token.tokens),
              color: firstLink(token.tokens) ? COLOR_LINK : COLOR_TEXT,
            });
            doc.moveDown(0.5);
            break;
          }
          case "list": {
            // Ordered lists honor an explicit `start` (e.g. a list beginning at 3).
            const startNum =
              typeof token.start === "number" && !Number.isNaN(token.start)
                ? token.start
                : 1;
            const LRM = "\u200E"; // Left-to-Right Mark
            for (let i = 0; i < token.items.length; i++) {
              const item = token.items[i];
              const text = inlineText(item.tokens, item.text);
              const dir = baseDir(text);
              // Wrap ordered markers in LRM so "1." stays a cohesive LTR token
              // and doesn't get reordered to ".1" inside an RTL line.
              const marker = token.ordered
                ? `${LRM}${startNum + i}.${LRM}`
                : "\u2022";
              // Attach the marker on the correct side for the text direction.
              const line =
                dir === "rtl" ? `${text} ${marker}` : `${marker} ${text}`;
              writeLine(line, { indent: indent + 1, forceDir: dir });
              doc.moveDown(0.2);
            }
            doc.moveDown(0.3);
            break;
          }
          case "code": {
            doc.moveDown(0.2);
            doc
              .font(FONT_REGULAR)
              .fontSize(10)
              .fillColor(COLOR_MUTED)
              .text(token.text, PAGE_LEFT + 10 + indent * 20, doc.y, {
                width: CONTENT_WIDTH - 20 - indent * 20,
              });
            doc.fillColor(COLOR_TEXT).fontSize(12);
            doc.moveDown(0.5);
            break;
          }
          case "blockquote": {
            doc.moveDown(0.2);
            const text = inlineText(token.tokens, token.raw).trim();
            const bqX = PAGE_LEFT + indent * 20 + 4;
            const bqY = doc.y;
            writeLine(text, {
              indent,
              color: COLOR_MUTED,
              size: 12,
            });
            const bqEnd = doc.y;
            doc
              .strokeColor("#d1d5db")
              .lineWidth(2)
              .moveTo(bqX, bqY)
              .lineTo(bqX, bqEnd)
              .stroke();
            doc.moveDown(0.5);
            break;
          }
          case "hr": {
            doc.moveDown(0.5);
            const hrY = doc.y;
            doc
              .strokeColor("#d1d5db")
              .lineWidth(0.5)
              .moveTo(PAGE_LEFT + indent * 20, hrY)
              .lineTo(535, hrY)
              .stroke();
            doc.moveDown(0.5);
            break;
          }
          case "table": {
            doc.moveDown(0.3);
            const colCount = token.header.length;
            const colWidth = (CONTENT_WIDTH - indent * 20) / colCount;
            const startX = PAGE_LEFT + indent * 20;

            const drawRow = (cells: { text: string }[], bold: boolean) => {
              const rowY = doc.y;
              let maxY = rowY;
              for (let c = 0; c < colCount; c++) {
                const raw = cells[c]?.text ?? "";
                const dir = baseDir(raw);
                const visual = hasHebrew(raw) ? toVisual(raw, dir) : raw;
                // Strip bidi control characters before rendering since the font doesn't map glyphs for them.
                const cleanVisual = visual.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "");
                doc
                  .font(bold ? FONT_BOLD : FONT_REGULAR)
                  .fontSize(11)
                  .fillColor(COLOR_TEXT)
                  .text(cleanVisual, startX + c * colWidth + 4, rowY, {
                    width: colWidth - 8,
                    align: dir === "rtl" ? "right" : "left",
                  });
                if (doc.y > maxY) maxY = doc.y;
              }
              doc.y = maxY;
            };

            drawRow(token.header, true);
            doc.moveDown(0.15);
            for (const row of token.rows) {
              drawRow(row, false);
              doc.moveDown(0.1);
            }
            doc.fontSize(12);
            doc.moveDown(0.5);
            break;
          }
          case "space": {
            doc.moveDown(0.3);
            break;
          }
          default: {
            if ("text" in token && typeof token.text === "string") {
              writeLine(token.text, { indent });
              doc.moveDown(0.3);
            }
            break;
          }
        }
      }
    }

    renderTokens(tokens);

    // Signature block
    if (signature) {
      doc.moveDown(2);
      const sigRuleY = doc.y;
      doc
        .strokeColor("#d1d5db")
        .lineWidth(0.5)
        .moveTo(60, sigRuleY)
        .lineTo(535, sigRuleY)
        .stroke();
      doc.moveDown(0.8);

      if (signature.signatureData.startsWith("data:image/png;base64,")) {
        const base64 = signature.signatureData.replace(
          /^data:image\/png;base64,/,
          "",
        );
        const imgBuf = Buffer.from(base64, "base64");
        doc.image(imgBuf, 60, doc.y, { width: 200, height: 80 });
        doc.y += 80;
        doc.moveDown(0.3);
      }

      writeLine(signature.legalName, { font: FONT_BOLD, size: 12 });
      doc.moveDown(0.15);

      const signedDate = new Date(signature.signedAt).toLocaleDateString(
        "en-US",
        { year: "numeric", month: "long", day: "numeric" },
      );
      writeLine(signedDate, { size: 10, color: COLOR_MUTED });
    }

    doc.end();

    const buf = await new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${(title || "contract").replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf"`,
      },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json(
      { error: "PDF generation failed", details: String(err) },
      { status: 500 },
    );
  }
}

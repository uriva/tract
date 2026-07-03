import { NextRequest, NextResponse } from "next/server";
import path from "path";
import PDFDocument from "pdfkit";
import { marked, type Token } from "marked";
import { isRtlBlock, toVisual } from "./text";

// Directory holding the embedded fonts (bundled at build time).
const FONT_DIR = path.join(process.cwd(), "src/app/api/pdf/fonts");

// Markdown tokens → pdfkit calls. No HTML, no CSS.
export async function POST(req: NextRequest) {
  try {
  const { title, content, signature } = (await req.json()) as {
    title: string;
    content: string;
    signature?: {
      legalName: string;
      signatureData: string; // base64 PNG data URL
      signedAt: number;
    };
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

  // Embed a Hebrew-capable font (Heebo, same as the web UI). The built-in
  // Adobe fonts (Helvetica/Courier) have no Hebrew glyphs, which is why Hebrew
  // previously rendered as gibberish/boxes. Heebo has no italic, so italics
  // reuse the regular/bold faces.
  doc.registerFont("Heebo", path.join(FONT_DIR, "Heebo-Regular.ttf"));
  doc.registerFont("Heebo-Bold", path.join(FONT_DIR, "Heebo-Bold.ttf"));

  const FONT_REGULAR = "Heebo";
  const FONT_BOLD = "Heebo-Bold";
  const FONT_ITALIC = "Heebo";
  const FONT_MONO = "Heebo";
  const COLOR_TEXT = "#1a1a1a";
  const COLOR_MUTED = "#6b7280";
  const COLOR_LINK = "#2563eb";

  // The page content box (A4 width 595 - left/right margins of 60 each = 475).
  const CONTENT_WIDTH = 475;

  // pdfkit/fontkit shape glyphs but do not run the bidi algorithm, so we must
  // reorder logical text into visual order ourselves and right-align RTL blocks.
  type TextOpts = NonNullable<Parameters<typeof doc.text>[1]>;

  function drawText(str: string, opts: TextOpts = {}): void {
    doc.text(toVisual(str), opts);
  }

  // Same as drawText but positions the run at an explicit x/y (block start).
  function drawTextAt(
    str: string,
    x: number,
    y: number | undefined,
    opts: TextOpts = {},
  ): void {
    doc.text(toVisual(str), x, y, opts);
  }

  // Alignment for a block, based on whether its text reads right-to-left.
  function blockAlign(text: string): "left" | "right" {
    return isRtlBlock(text) ? "right" : "left";
  }

  // Title
  const titleText = title || "Contract";
  doc
    .font(FONT_BOLD)
    .fontSize(20)
    .fillColor(COLOR_TEXT);
  drawText(titleText, { align: blockAlign(titleText) });
  doc.moveDown(1);

  const tokens = marked.lexer(content);

  const headingSizes: Record<number, number> = {
    1: 18,
    2: 16,
    3: 14,
    4: 13,
    5: 12,
    6: 11,
  };

  // Render inline tokens into pdfkit using .text() continuation. `align` is the
  // base direction of the containing block so wrapped lines align correctly.
  function renderInline(tokens: Token[], align: "left" | "right" = "left") {
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const continued = i < tokens.length - 1;
      const opts: TextOpts = { continued, align };

      if (t.type === "text") {
        doc.font(FONT_REGULAR);
        drawText(t.text, opts);
      } else if (t.type === "strong") {
        doc.font(FONT_BOLD);
        if (t.tokens) {
          renderInline(t.tokens, align);
        } else {
          drawText(t.text, opts);
        }
        doc.font(FONT_REGULAR);
      } else if (t.type === "em") {
        doc.font(FONT_ITALIC);
        if (t.tokens) {
          renderInline(t.tokens, align);
        } else {
          drawText(t.text, opts);
        }
        doc.font(FONT_REGULAR);
      } else if (t.type === "codespan") {
        doc.font(FONT_MONO).fontSize(10);
        drawText(t.text, opts);
        doc.fontSize(12).font(FONT_REGULAR);
      } else if (t.type === "link") {
        doc.fillColor(COLOR_LINK);
        drawText(t.text, { ...opts, link: t.href, underline: true });
        doc.fillColor(COLOR_TEXT);
      } else if (t.type === "br") {
        doc.text("", { continued: false });
      } else if ("text" in t && typeof t.text === "string") {
        drawText(t.text, opts);
      } else if ("raw" in t && typeof t.raw === "string") {
        drawText(t.raw, opts);
      }
    }
  }

  function renderTokens(tokens: Token[], indent = 0) {
    const leftMargin = 60 + indent * 20;

    for (const token of tokens) {
      switch (token.type) {
        case "heading": {
          doc.moveDown(0.5);
          const sz = headingSizes[token.depth] ?? 12;
          doc.font(FONT_BOLD).fontSize(sz).fillColor(COLOR_TEXT);
          drawTextAt(token.text, leftMargin, undefined, {
            width: CONTENT_WIDTH - indent * 20,
            align: blockAlign(token.text),
          });
          doc.fontSize(12).font(FONT_REGULAR);
          doc.moveDown(0.3);
          break;
        }
        case "paragraph": {
          const align = blockAlign(token.text);
          doc.font(FONT_REGULAR).fontSize(12).fillColor(COLOR_TEXT);
          doc.text("", leftMargin, undefined, {
            width: CONTENT_WIDTH - indent * 20,
            align,
          });
          if (token.tokens) {
            renderInline(token.tokens, align);
          } else {
            drawText(token.text, { align });
          }
          doc.moveDown(0.4);
          break;
        }
        case "list": {
          const itemWidth = CONTENT_WIDTH - indent * 20;
          for (let i = 0; i < token.items.length; i++) {
            const item = token.items[i];
            const rtl = isRtlBlock(item.text);
            const align: "left" | "right" = rtl ? "right" : "left";
            // RTL bullets sit on the right of the text; for a right-aligned
            // block the bullet is emitted before the text but rendered visually
            // trailing, so we append it to the marker with an RTL-safe order.
            const marker = token.ordered ? `${i + 1}.` : "\u2022";
            const bullet = rtl ? ` ${marker}` : `${marker} `;
            doc.font(FONT_REGULAR).fontSize(12).fillColor(COLOR_TEXT);
            if (rtl) {
              // Emit text first, then the bullet, both right-aligned.
              const first = item.tokens?.[0];
              if (
                first &&
                (first.type === "text" || first.type === "paragraph") &&
                "tokens" in first &&
                first.tokens
              ) {
                doc.text("", leftMargin, undefined, {
                  width: itemWidth,
                  align,
                });
                renderInline(first.tokens, align);
                drawText(bullet, { continued: false, align });
                if (item.tokens && item.tokens.length > 1) {
                  renderTokens(item.tokens.slice(1), indent + 1);
                }
              } else {
                drawTextAt(`${item.text}${bullet}`, leftMargin, undefined, {
                  width: itemWidth,
                  align,
                });
              }
              doc.moveDown(0.15);
              continue;
            }
            drawTextAt(bullet, leftMargin, undefined, {
              continued: true,
              width: itemWidth,
              align,
            });
            if (item.tokens) {
              // Render first text inline after bullet
              const first = item.tokens[0];
              if (
                first &&
                (first.type === "text" || first.type === "paragraph")
              ) {
                if ("tokens" in first && first.tokens) {
                  renderInline(first.tokens, align);
                } else if ("text" in first) {
                  drawText(first.text, { align });
                }
                // Render remaining tokens (nested lists, etc.)
                if (item.tokens.length > 1) {
                  renderTokens(item.tokens.slice(1), indent + 1);
                }
              } else {
                doc.text("");
                renderTokens(item.tokens, indent + 1);
              }
            } else {
              drawText(item.text, { align });
            }
            doc.moveDown(0.15);
          }
          doc.moveDown(0.3);
          break;
        }
        case "code": {
          doc.moveDown(0.2);
          doc.font(FONT_MONO).fontSize(10).fillColor(COLOR_MUTED);
          drawTextAt(token.text, leftMargin + 10, undefined, {
            width: CONTENT_WIDTH - 20 - indent * 20,
          });
          doc.font(FONT_REGULAR).fontSize(12).fillColor(COLOR_TEXT);
          doc.moveDown(0.4);
          break;
        }
        case "blockquote": {
          doc.moveDown(0.2);
          const bqText =
            token.tokens
              ?.map((t) => ("text" in t ? t.text : t.raw))
              .join("")
              .trim() ?? token.raw;
          const bqRtl = isRtlBlock(bqText);
          // Accent bar goes on the leading edge (left for LTR, right for RTL).
          const bqX = bqRtl ? 535 - indent * 20 - 4 : leftMargin + 4;
          const bqY = doc.y;
          doc.font(FONT_ITALIC).fontSize(12).fillColor(COLOR_MUTED);
          drawTextAt(bqText, leftMargin + 14, undefined, {
            width: CONTENT_WIDTH - 14 - indent * 20,
            align: bqRtl ? "right" : "left",
          });
          const bqEnd = doc.y;
          doc
            .strokeColor("#d1d5db")
            .lineWidth(2)
            .moveTo(bqX, bqY)
            .lineTo(bqX, bqEnd)
            .stroke();
          doc.font(FONT_REGULAR).fillColor(COLOR_TEXT);
          doc.moveDown(0.4);
          break;
        }
        case "hr": {
          doc.moveDown(0.5);
          const hrY = doc.y;
          doc
            .strokeColor("#d1d5db")
            .lineWidth(0.5)
            .moveTo(leftMargin, hrY)
            .lineTo(535, hrY)
            .stroke();
          doc.moveDown(0.5);
          break;
        }
        case "table": {
          doc.moveDown(0.3);
          const colCount = token.header.length;
          const colWidth = (CONTENT_WIDTH - indent * 20) / colCount;

          // Header
          doc.font(FONT_BOLD).fontSize(11);
          for (let c = 0; c < colCount; c++) {
            const cell = token.header[c];
            drawTextAt(cell.text, leftMargin + c * colWidth, undefined, {
              width: colWidth,
              continued: c < colCount - 1,
              align: blockAlign(cell.text),
            });
          }
          doc.moveDown(0.2);

          // Rows
          doc.font(FONT_REGULAR).fontSize(11);
          for (const row of token.rows) {
            for (let c = 0; c < colCount; c++) {
              const cell = row[c];
              drawTextAt(cell.text, leftMargin + c * colWidth, undefined, {
                width: colWidth,
                continued: c < colCount - 1,
                align: blockAlign(cell.text),
              });
            }
            doc.moveDown(0.1);
          }
          doc.fontSize(12);
          doc.moveDown(0.4);
          break;
        }
        case "space": {
          doc.moveDown(0.3);
          break;
        }
        default: {
          // Fallback: render raw text
          if ("text" in token && typeof token.text === "string") {
            doc.font(FONT_REGULAR).fontSize(12).fillColor(COLOR_TEXT);
            drawTextAt(token.text, leftMargin, undefined, {
              width: CONTENT_WIDTH - indent * 20,
              align: blockAlign(token.text),
            });
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

    // Horizontal rule
    const sigRuleY = doc.y;
    doc
      .strokeColor("#d1d5db")
      .lineWidth(0.5)
      .moveTo(60, sigRuleY)
      .lineTo(535, sigRuleY)
      .stroke();
    doc.moveDown(0.8);

    // Signature image
    if (signature.signatureData.startsWith("data:image/png;base64,")) {
      const base64 = signature.signatureData.replace(/^data:image\/png;base64,/, "");
      const imgBuf = Buffer.from(base64, "base64");
      doc.image(imgBuf, 60, doc.y, { width: 200, height: 80 });
      doc.moveDown(0.3);
      // Move below the image
      doc.y += 80;
    }

    // Name line
    doc.font(FONT_BOLD).fontSize(12).fillColor(COLOR_TEXT);
    drawTextAt(signature.legalName, 60, undefined, {
      width: CONTENT_WIDTH,
      align: blockAlign(signature.legalName),
    });
    doc.moveDown(0.15);

    // Date
    const signedDate = new Date(signature.signedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    doc
      .font(FONT_REGULAR)
      .fontSize(10)
      .fillColor(COLOR_MUTED)
      .text(signedDate, 60, undefined, { width: 475 });
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

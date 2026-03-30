import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { marked, type Token } from "marked";

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

  const FONT_REGULAR = "Helvetica";
  const FONT_BOLD = "Helvetica-Bold";
  const FONT_ITALIC = "Helvetica-Oblique";
  const FONT_BOLD_ITALIC = "Helvetica-BoldOblique";
  const FONT_MONO = "Courier";
  const COLOR_TEXT = "#1a1a1a";
  const COLOR_MUTED = "#6b7280";
  const COLOR_LINK = "#2563eb";

  // Title
  doc
    .font(FONT_BOLD)
    .fontSize(20)
    .fillColor(COLOR_TEXT)
    .text(title || "Contract", { align: "left" });
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

  // Render inline tokens into pdfkit using .text() continuation
  function renderInline(tokens: Token[]) {
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const continued = i < tokens.length - 1;
      const opts = { continued };

      if (t.type === "text") {
        doc.font(FONT_REGULAR).text(t.text, opts);
      } else if (t.type === "strong") {
        doc.font(FONT_BOLD);
        if (t.tokens) {
          renderInline(t.tokens);
        } else {
          doc.text(t.text, opts);
        }
        doc.font(FONT_REGULAR);
      } else if (t.type === "em") {
        doc.font(FONT_ITALIC);
        if (t.tokens) {
          renderInline(t.tokens);
        } else {
          doc.text(t.text, opts);
        }
        doc.font(FONT_REGULAR);
      } else if (t.type === "codespan") {
        doc.font(FONT_MONO).fontSize(10).text(t.text, opts).fontSize(12);
        doc.font(FONT_REGULAR);
      } else if (t.type === "link") {
        doc
          .fillColor(COLOR_LINK)
          .text(t.text, { ...opts, link: t.href, underline: true });
        doc.fillColor(COLOR_TEXT);
      } else if (t.type === "br") {
        doc.text("", { continued: false });
      } else if ("text" in t && typeof t.text === "string") {
        doc.text(t.text, opts);
      } else if ("raw" in t && typeof t.raw === "string") {
        doc.text(t.raw, opts);
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
          doc
            .font(FONT_BOLD)
            .fontSize(sz)
            .fillColor(COLOR_TEXT)
            .text(token.text, leftMargin, undefined, {
              width: 475 - indent * 20,
            });
          doc.fontSize(12).font(FONT_REGULAR);
          doc.moveDown(0.3);
          break;
        }
        case "paragraph": {
          doc.font(FONT_REGULAR).fontSize(12).fillColor(COLOR_TEXT);
          doc.text("", leftMargin, undefined, { width: 475 - indent * 20 });
          if (token.tokens) {
            renderInline(token.tokens);
          } else {
            doc.text(token.text);
          }
          doc.moveDown(0.4);
          break;
        }
        case "list": {
          for (let i = 0; i < token.items.length; i++) {
            const item = token.items[i];
            const bullet = token.ordered ? `${i + 1}. ` : "\u2022 ";
            doc
              .font(FONT_REGULAR)
              .fontSize(12)
              .fillColor(COLOR_TEXT)
              .text(bullet, leftMargin, undefined, {
                continued: true,
                width: 475 - indent * 20,
              });
            if (item.tokens) {
              // Render first text inline after bullet
              const first = item.tokens[0];
              if (
                first &&
                (first.type === "text" || first.type === "paragraph")
              ) {
                if ("tokens" in first && first.tokens) {
                  renderInline(first.tokens);
                } else if ("text" in first) {
                  doc.text(first.text);
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
              doc.text(item.text);
            }
            doc.moveDown(0.15);
          }
          doc.moveDown(0.3);
          break;
        }
        case "code": {
          doc.moveDown(0.2);
          doc
            .font(FONT_MONO)
            .fontSize(10)
            .fillColor(COLOR_MUTED)
            .text(token.text, leftMargin + 10, undefined, {
              width: 455 - indent * 20,
            });
          doc.font(FONT_REGULAR).fontSize(12).fillColor(COLOR_TEXT);
          doc.moveDown(0.4);
          break;
        }
        case "blockquote": {
          doc.moveDown(0.2);
          // Save x and draw a line on the left
          const bqX = leftMargin + 4;
          const bqY = doc.y;
          doc
            .font(FONT_ITALIC)
            .fontSize(12)
            .fillColor(COLOR_MUTED)
            .text(
              token.tokens
                ?.map((t) => ("text" in t ? t.text : t.raw))
                .join("")
                .trim() ?? token.raw,
              leftMargin + 14,
              undefined,
              { width: 461 - indent * 20 }
            );
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
          const colWidth = (475 - indent * 20) / colCount;

          // Header
          doc.font(FONT_BOLD).fontSize(11);
          for (let c = 0; c < colCount; c++) {
            const cell = token.header[c];
            doc.text(
              cell.text,
              leftMargin + c * colWidth,
              undefined,
              { width: colWidth, continued: c < colCount - 1 }
            );
          }
          doc.moveDown(0.2);

          // Rows
          doc.font(FONT_REGULAR).fontSize(11);
          for (const row of token.rows) {
            for (let c = 0; c < colCount; c++) {
              const cell = row[c];
              doc.text(
                cell.text,
                leftMargin + c * colWidth,
                undefined,
                { width: colWidth, continued: c < colCount - 1 }
              );
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
            doc
              .font(FONT_REGULAR)
              .fontSize(12)
              .fillColor(COLOR_TEXT)
              .text(token.text, leftMargin, undefined, {
                width: 475 - indent * 20,
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
    doc
      .font(FONT_BOLD)
      .fontSize(12)
      .fillColor(COLOR_TEXT)
      .text(signature.legalName, 60, undefined, { width: 475 });
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

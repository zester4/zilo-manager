import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { createWriteStream, existsSync } from 'node:fs';
import { workspaceLayout } from '../workspace/paths.js';
import { marked } from 'marked';

export type PdfInput = {
  title: string;
  markdown: string;
  filename?: string;
};

const COLORS = {
  primary: '#0F172A',   // Slate 900
  secondary: '#334155', // Slate 700
  accent: '#4F46E5',    // Indigo 600
  muted: '#64748B',     // Slate 500
  background: '#FFFFFF',
  divider: '#E2E8F0',   // Slate 200
  codeBg: '#F8FAFC',    // Slate 50
  codeText: '#BE185D',  // Pink 700
};

const FONTS = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
  mono: 'Courier',
};

// Image utility functions
function resolveImagePath(href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return href;
  }
  if (path.isAbsolute(href)) {
    return href;
  }
  const wsRoot = workspaceLayout().root || process.cwd();
  const wsPath = path.resolve(wsRoot, href);
  const outputsPath = path.resolve(workspaceLayout().outputs, href);

  if (existsSync(wsPath)) {
    return wsPath;
  } else if (existsSync(outputsPath)) {
    return outputsPath;
  }
  return wsPath;
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error(`Failed to fetch image: ${url}`, err);
    return null;
  }
}

async function getLocalImageBuffer(filePath: string): Promise<Buffer | null> {
  try {
    if (existsSync(filePath)) {
      return await readFile(filePath);
    }
    return null;
  } catch (err) {
    console.error(`Failed to read image file: ${filePath}`, err);
    return null;
  }
}

export async function generatePdfDocument(input: PdfInput) {
  const outDir = path.join(workspaceLayout().outputs, 'pdf');
  await mkdir(outDir, { recursive: true });
  const filename = input.filename || `${input.title.replace(/[^\w.-]+/g, '-').slice(0, 60)}.pdf`;
  const filePath = path.join(outDir, filename.endsWith('.pdf') ? filename : `${filename}.pdf`);

  const tokens = marked.lexer(input.markdown);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 54,
      size: 'A4',
      bufferPages: true,
      info: {
        Title: input.title,
        Author: 'ZilMate Assistant',
      }
    });
    const stream = createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    doc.fontSize(24).font(FONTS.bold).fillColor(COLORS.primary).text(input.title, { align: 'left' });
    doc.moveDown(0.5);
    doc.moveTo(54, doc.y).lineTo(541, doc.y).strokeColor(COLORS.accent).lineWidth(2).stroke();
    doc.moveDown(1.5);

    function preserveSpacing(text: string): string {
      if (!text) return '';
      let clean = text;
      if (clean.startsWith(' ')) {
        clean = '\u00A0' + clean.slice(1);
      }
      if (clean.endsWith(' ')) {
        clean = clean.slice(0, -1) + '\u00A0';
      }
      return clean;
    }

    function renderInline(
      inlineTokens: any[],
      options: {
        continued?: boolean;
        startX?: number;
        startY?: number;
        width?: number;
      } = {}
    ) {
      if (!inlineTokens) return;

      inlineTokens.forEach((token, index) => {
        const isLast = index === inlineTokens.length - 1;
        const continued = options.continued || !isLast;

        const textOpts: any = { continued };
        if (index === 0 && options.width !== undefined) {
          textOpts.width = options.width;
        }

        const hasCoords = index === 0 && options.startX !== undefined && options.startY !== undefined;

        const drawText = (txt: string, font: string, color: string, extraOpts: any = {}) => {
          doc.font(font).fillColor(color);
          const mergedOpts = { ...textOpts, ...extraOpts };
          if (hasCoords) {
            doc.text(preserveSpacing(txt), options.startX!, options.startY!, mergedOpts);
          } else {
            doc.text(preserveSpacing(txt), mergedOpts);
          }
        };

        if (token.type === 'strong') {
          drawText(token.text, FONTS.bold, COLORS.primary);
        } else if (token.type === 'em') {
          drawText(token.text, FONTS.italic, COLORS.secondary);
        } else if (token.type === 'codespan') {
          drawText(token.text, FONTS.mono, COLORS.codeText);
          doc.font(FONTS.regular).fillColor(COLORS.secondary);
        } else if (token.type === 'link') {
          drawText(token.text, FONTS.regular, COLORS.accent, { link: token.href, underline: true });
          doc.fillColor(COLORS.secondary);
        } else if (token.type === 'br') {
          if (hasCoords) {
            doc.text('\n', options.startX!, options.startY!, textOpts);
          } else {
            doc.text('\n', textOpts);
          }
        } else if (token.tokens) {
          const nestedOptions = { ...options, continued };
          if (index > 0) {
            delete nestedOptions.startX;
            delete nestedOptions.startY;
            delete nestedOptions.width;
          }
          renderInline(token.tokens, nestedOptions);
        } else {
          drawText(token.text || token.raw || '', FONTS.regular, COLORS.secondary);
        }
      });
    }

    const drawFallbackBox = (imgToken: any) => {
      const height = 100;
      if (doc.y + height > 750) {
        doc.addPage();
      }
      const currentY = doc.y;
      doc.rect(54, currentY, 487, height)
         .fillAndStroke('#FEF2F2', '#FCA5A5');
      doc.fillColor('#991B1B')
         .font(FONTS.bold)
         .fontSize(11)
         .text(`Image: ${imgToken.text || 'Untitled'} (Not Found)`, 74, currentY + 30);
      doc.font(FONTS.regular)
         .fontSize(9)
         .fillColor('#B91C1C')
         .text(`Source: ${imgToken.href}`, 74, currentY + 55);
      
      doc.y = currentY + height;
      doc.moveDown(1);
    };

    const renderImageBlock = async (imgToken: any) => {
      if (doc.y + 250 > 750) {
        doc.addPage();
      }

      const imgHref = imgToken.href;
      const resolvedPath = resolveImagePath(imgHref);
      let buffer: Buffer | null = null;

      if (imgHref.startsWith('http://') || imgHref.startsWith('https://')) {
        buffer = await fetchImageBuffer(imgHref);
      } else {
        buffer = await getLocalImageBuffer(resolvedPath);
      }

      if (buffer) {
        try {
          doc.image(buffer, {
            fit: [487, 250],
            align: 'center'
          });
          if (imgToken.text) {
            doc.moveDown(0.4);
            doc.fontSize(9)
               .font(FONTS.italic)
               .fillColor(COLORS.muted)
               .text(imgToken.text, { align: 'center' });
          }
          doc.moveDown(1);
        } catch (err) {
          console.error('Error drawing image in PDFKit:', err);
          drawFallbackBox(imgToken);
        }
      } else {
        drawFallbackBox(imgToken);
      }
    };

    async function renderBlocks(tokens: any[]) {
      for (const token of tokens) {
        if (doc.y > 720) doc.addPage();

        switch (token.type) {
          case 'heading': {
            const hSizes = [20, 18, 16, 14, 12, 11];
            const size = hSizes[token.depth - 1] || 11;
            doc.moveDown(0.5)
               .fontSize(size)
               .font(FONTS.bold)
               .fillColor(COLORS.primary)
               .text(token.text);
            doc.moveDown(0.2);
            break;
          }

          case 'paragraph': {
            // Check if there is an image in this paragraph
            const imgToken = token.tokens?.find((t: any) => t.type === 'image');
            if (imgToken) {
              if (token.tokens.length === 1) {
                await renderImageBlock(imgToken);
                break;
              }
              const nonImgTokens = token.tokens.filter((t: any) => t.type !== 'image');
              doc.fontSize(11).font(FONTS.regular).fillColor(COLORS.secondary);
              renderInline(nonImgTokens);
              doc.moveDown(0.8);
              await renderImageBlock(imgToken);
              break;
            }

            doc.fontSize(11)
               .font(FONTS.regular)
               .fillColor(COLORS.secondary);
            renderInline(token.tokens || []);
            doc.moveDown(0.8);
            break;
          }

          case 'list': {
            token.items.forEach((item: any, idx: number) => {
              if (doc.y > 720) doc.addPage();
              doc.fontSize(11).font(FONTS.regular).fillColor(COLORS.secondary);
              
              const startY = doc.y;
              const prefix = token.ordered ? `${idx + 1}. ` : '• ';
              
              // Draw the prefix (bullet/number) in its own left column
              doc.font(FONTS.bold).fillColor(COLORS.accent);
              doc.text(prefix, 60, startY, { width: 20 });
              
              const contentX = 74;
              const contentWidth = 467;
              
              if (item.tokens) {
                let currentItemY = startY;
                let renderedAny = false;
                
                item.tokens.forEach((subToken: any, subIdx: number) => {
                  if (subToken.type === 'text' || subToken.type === 'paragraph') {
                    if (renderedAny) {
                      doc.y = currentItemY;
                      doc.moveDown(0.3);
                      currentItemY = doc.y;
                    }
                    
                    renderInline(subToken.tokens || [], {
                      startX: contentX,
                      startY: currentItemY,
                      width: contentWidth
                    });
                    
                    currentItemY = doc.y;
                    renderedAny = true;
                  } else if (subToken.type === 'list') {
                    doc.y = currentItemY;
                    doc.moveDown(0.2);
                    currentItemY = doc.y;
                  }
                });
                
                doc.y = currentItemY;
              } else {
                doc.font(FONTS.regular).fillColor(COLORS.secondary);
                doc.text(item.text || '', contentX, startY, { width: contentWidth });
              }
              doc.moveDown(0.4);
            });
            doc.moveDown(0.4);
            doc.x = 54; // Reset horizontal coordinate to left margin
            break;
          }

          case 'blockquote': {
            const startY = doc.y;
            doc.fontSize(11).font(FONTS.italic).fillColor(COLORS.muted);
            doc.text(token.text, { indent: 20 });
            const endY = doc.y;
            doc.moveTo(64, startY).lineTo(64, endY).strokeColor(COLORS.accent).lineWidth(2).stroke();
            doc.moveDown(0.8);
            break;
          }

          case 'code': {
            doc.fontSize(10).font(FONTS.mono).fillColor(COLORS.secondary);
            const codeText = token.text;
            const height = doc.heightOfString(codeText) + 10;

            if (doc.y + height > 750) {
              doc.addPage();
            }

            const currentY = doc.y;
            doc.rect(54, currentY, 487, height)
               .fill(COLORS.codeBg);
            doc.fillColor(COLORS.secondary).text(codeText, 59, currentY + 5);
            doc.y = currentY + height;
            doc.moveDown(1);
            doc.x = 54; // Reset horizontal coordinate to left margin
            break;
          }

          case 'hr': {
            doc.moveDown(0.5);
            doc.moveTo(100, doc.y).lineTo(495, doc.y).strokeColor(COLORS.divider).lineWidth(1).stroke();
            doc.moveDown(1);
            break;
          }

          case 'table': {
            const numCols = token.header.length;
            const colWidth = 487 / numCols;

            const drawRow = (cells: any[], isHeader: boolean, yPos: number, rowH: number, isEvenRow?: boolean) => {
              let currentX = 54;
              cells.forEach((cell: any, colIdx: number) => {
                if (isHeader) {
                  doc.rect(currentX, yPos, colWidth, rowH).fill(COLORS.primary);
                  doc.fillColor('#FFFFFF').font(FONTS.bold).fontSize(9);
                } else {
                  const bg = isEvenRow ? COLORS.codeBg : '#FFFFFF';
                  doc.rect(currentX, yPos, colWidth, rowH).fill(bg);
                  doc.rect(currentX, yPos, colWidth, rowH).strokeColor(COLORS.divider).lineWidth(0.5).stroke();
                  doc.fillColor(COLORS.secondary).font(FONTS.regular).fontSize(9);
                }

                doc.text(cell.text, currentX + 5, yPos + 5, {
                  width: colWidth - 10,
                  align: (token.align && token.align[colIdx]) || 'left'
                });

                currentX += colWidth;
              });
            };

            let headerHeight = 20;
            token.header.forEach((cell: any) => {
              const h = doc.heightOfString(cell.text, { width: colWidth - 10 }) + 10;
              if (h > headerHeight) headerHeight = h;
            });

            if (doc.y + headerHeight > 750) {
              doc.addPage();
            }

            let startY = doc.y;
            drawRow(token.header, true, startY, headerHeight);
            doc.y = startY + headerHeight;

            let rowIndex = 0;
            for (const row of token.rows) {
              let rowHeight = 18;
              row.forEach((cell: any) => {
                const h = doc.heightOfString(cell.text, { width: colWidth - 10 }) + 10;
                if (h > rowHeight) rowHeight = h;
              });

              if (doc.y + rowHeight > 750) {
                doc.addPage();
                startY = doc.y;
                drawRow(token.header, true, startY, headerHeight);
                doc.y = startY + headerHeight;
              }

              startY = doc.y;
              drawRow(row, false, startY, rowHeight, rowIndex % 2 === 0);
              doc.y = startY + rowHeight;
              rowIndex++;
            }
            doc.moveDown(1);
            doc.x = 54; // Reset horizontal coordinate to left margin
            break;
          }

          case 'space':
            break;
        }
      }
    }

    renderBlocks(tokens).then(() => {
      // Draw headers and footers on all buffered pages before rendering
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);

        // Header Line (only on page 2 onwards, or keep it on all pages but clean)
        if (i > range.start) {
          doc.fontSize(8)
             .font(FONTS.regular)
             .fillColor(COLORS.muted)
             .text(input.title, 54, 30, { align: 'left' });
          doc.moveTo(54, 42).lineTo(541, 42).strokeColor(COLORS.divider).lineWidth(0.5).stroke();
        }

        // Footer: line + document title + page X of Y
        doc.moveTo(54, 780).lineTo(541, 780).strokeColor(COLORS.divider).lineWidth(0.5).stroke();
        
        doc.fontSize(8)
           .font(FONTS.italic)
           .fillColor(COLORS.muted)
           .text(`Document: ${input.title}`, 54, 788, { width: 300 });

        doc.fontSize(8)
           .font(FONTS.regular)
           .fillColor(COLORS.muted)
           .text(`Page ${i + 1} of ${range.count}`, 54, 788, { align: 'right', width: 487 });
      }

      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    }).catch(reject);
  });

  return { path: filePath, format: 'pdf' as const, pageEstimate: Math.max(1, Math.ceil(input.markdown.length / 2500)) };
}

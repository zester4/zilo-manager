import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pptxgenModule from 'pptxgenjs';
import { workspaceLayout } from '../workspace/paths.js';
import { existsSync } from 'node:fs';

const PptxGenJS = (pptxgenModule as unknown as { default: typeof pptxgenModule }).default ?? pptxgenModule;

export type SlideInput = {
  title: string;
  markdown: string;
  theme?: 'dark' | 'light' | 'zilmate';
  filename?: string;
};

type SlideLike = {
  background: { color: string };
  addText: (text: string, opts: Record<string, unknown>) => void;
  addShape: (shape: string, opts: Record<string, unknown>) => void;
  addImage?: (opts: Record<string, unknown>) => void;
};

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

function parseSlides(markdown: string) {
  const chunks = markdown.split(/\n---+\n/).map((chunk) => chunk.trim()).filter(Boolean);
  return chunks.map((chunk) => {
    const lines = chunk.split('\n');
    let title = '';
    const body: string[] = [];
    let image: { alt: string; src: string } | null = null;

    for (const line of lines) {
      const heading = /^#{1,2}\s+(.+)/.exec(line);
      if (heading && heading[1] && !title) {
        title = heading[1].trim();
        continue;
      }

      const imgMatch = /!\[([^\]]*)\]\(([^)]+)\)/.exec(line);
      if (imgMatch && imgMatch[1] !== undefined && imgMatch[2] !== undefined && !image) {
        image = {
          alt: imgMatch[1].trim(),
          src: imgMatch[2].trim(),
        };
        continue;
      }

      body.push(line.replace(/^[-*]\s+/, '• '));
    }
    return { title: title || 'Slide', body: body.join('\n').trim(), image };
  });
}

const themes = {
  dark: { bg: '1E1E2E', title: '89B4FA', text: 'CDD6F4', accent: 'F5C2E7' },
  light: { bg: 'FFFFFF', title: '1E66F5', text: '1E1E2E', accent: '8839EF' },
  zilmate: { bg: '0F172A', title: '22D3EE', text: 'E2E8F0', accent: 'A78BFA' },
};

export async function generateSlideDeck(input: SlideInput) {
  const slides = parseSlides(input.markdown);
  if (slides.length === 0) {
    slides.push({ title: input.title, body: input.markdown.trim(), image: null });
  }

  const theme = themes[input.theme ?? 'zilmate'];
  const PptxCtor = PptxGenJS as unknown as { new(): { author: string; title: string; layout: string; addSlide: () => SlideLike; writeFile: (opts: { fileName: string }) => Promise<void> } };
  const pptx = new PptxCtor();
  pptx.author = 'ZilMate';
  pptx.title = input.title;
  pptx.layout = 'LAYOUT_16x9';

  for (let idx = 0; idx < slides.length; idx++) {
    const slideData = slides[idx];
    if (!slideData) continue;

    const slide = pptx.addSlide();
    slide.background = { color: theme.bg };

    const isCover = idx === 0;

    if (isCover) {
      // --- COVER SLIDE ---
      slide.addText(slideData.title, {
        x: 0.5,
        y: 1.8,
        w: 12.33,
        h: 1.5,
        fontSize: 44,
        bold: true,
        color: theme.title,
        fontFace: 'Trebuchet MS',
        align: 'center',
      });

      if (slideData.body) {
        slide.addText(slideData.body, {
          x: 1.0,
          y: 3.5,
          w: 11.33,
          h: 2.0,
          fontSize: 18,
          color: theme.text,
          fontFace: 'Calibri',
          align: 'center',
        });
      }

      // Elegant accent block at the bottom
      slide.addShape('rect', {
        x: 0.0,
        y: 7.2,
        w: 13.33,
        h: 0.3,
        fill: { color: theme.accent },
        line: { color: theme.accent },
      });
    } else {
      // --- INNER SLIDE ---
      // Slide Title
      slide.addText(slideData.title, {
        x: 0.6,
        y: 0.4,
        w: 12.13,
        h: 0.8,
        fontSize: 28,
        bold: true,
        color: theme.title,
        fontFace: 'Trebuchet MS',
      });

      // Accent border divider below title
      slide.addShape('rect', {
        x: 0.6,
        y: 1.1,
        w: 12.13,
        h: 0.04,
        fill: { color: theme.accent },
        line: { color: theme.accent },
      });

      if (slideData.image) {
        // Dual column layout: Text on Left, Image on Right
        if (slideData.body) {
          slide.addText(slideData.body, {
            x: 0.6,
            y: 1.4,
            w: 5.8,
            h: 4.8,
            fontSize: 16,
            color: theme.text,
            fontFace: 'Calibri',
            valign: 'top',
          });
        }

        const resolvedImgPath = resolveImagePath(slideData.image.src);
        if (slide.addImage) {
          try {
            slide.addImage({
              path: resolvedImgPath,
              x: 6.8,
              y: 1.4,
              w: 5.8,
              h: 4.5,
              sizing: { type: 'contain' }
            });
          } catch (err) {
            console.error('Failed to add image to slide:', err);
          }
        }
      } else {
        // Full width text layout
        if (slideData.body) {
          slide.addText(slideData.body, {
            x: 0.6,
            y: 1.4,
            w: 12.13,
            h: 4.8,
            fontSize: 18,
            color: theme.text,
            fontFace: 'Calibri',
            valign: 'top',
          });
        }
      }

      // Footer brand metadata
      slide.addText(input.title, {
        x: 0.6,
        y: 6.9,
        w: 6.0,
        h: 0.3,
        fontSize: 10,
        color: theme.text,
        fontFace: 'Calibri',
        italic: true,
        opacity: 0.5,
      });

      // Footer slide index tracker
      slide.addText(`Slide ${idx + 1} of ${slides.length}`, {
        x: 6.8,
        y: 6.9,
        w: 5.9,
        h: 0.3,
        fontSize: 10,
        color: theme.text,
        fontFace: 'Calibri',
        align: 'right',
        opacity: 0.5,
      });
    }
  }

  const outDir = path.join(workspaceLayout().outputs, 'slides');
  await mkdir(outDir, { recursive: true });
  const filename = input.filename || `${input.title.replace(/[^\w.-]+/g, '-').slice(0, 60)}.pptx`;
  const filePath = path.join(outDir, filename.endsWith('.pptx') ? filename : `${filename}.pptx`);
  await pptx.writeFile({ fileName: filePath });

  const mdPath = filePath.replace(/\.pptx$/i, '.md');
  await writeFile(mdPath, input.markdown, 'utf8');

  return { path: filePath, markdownPath: mdPath, slideCount: slides.length, format: 'pptx' as const };
}

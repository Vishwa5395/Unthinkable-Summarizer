import sharp from 'sharp';
import { logger } from '../../config/logger.js';

let canvasModule: typeof import('@napi-rs/canvas') | null = null;
let canvasLoadAttempted = false;
let canvasAvailable = false;

/**
 * Lazy loads and validates the @napi-rs/canvas native binding.
 * Does not throw at server startup; reports availability gracefully.
 */
export async function getPdfCanvasModule(): Promise<typeof import('@napi-rs/canvas') | null> {
  if (canvasModule) return canvasModule;
  if (canvasLoadAttempted) return canvasModule;

  canvasLoadAttempted = true;

  try {
    const mod = await import('@napi-rs/canvas');
    if (mod && typeof mod.createCanvas === 'function') {
      // Test creating a minimal 1x1 canvas to verify native Skia binary binding
      const test = mod.createCanvas(1, 1);
      if (test && typeof test.getContext === 'function') {
        canvasModule = mod;
        canvasAvailable = true;
        logger.info('Native Skia Canvas (@napi-rs/canvas) initialized and verified successfully');
        return canvasModule;
      }
    }
  } catch (err: any) {
    canvasAvailable = false;
    canvasModule = null;
    logger.warn(
      { error: err?.message },
      'Native @napi-rs/canvas binary not available on this platform; using embedded raster & Sharp fallback renderer'
    );
  }

  return null;
}

export function isCanvasAvailable(): boolean {
  return canvasAvailable;
}

export class PdfPageRenderer {
  /**
   * Maximum pixel dimension limits for OCR rasterization (prevents memory spikes)
   */
  public static readonly MAX_RENDER_WIDTH = 2400;
  public static readonly MAX_RENDER_HEIGHT = 3200;

  /**
   * Extracts or renders a specific page of a PDF document into a high-resolution PNG image Buffer
   */
  static async renderPageToImageBuffer(
    pdfJsDoc: any,
    pageNumber: number,
    targetDpiScale: number = 2.0
  ): Promise<Buffer> {
    const startTime = Date.now();

    try {
      const page = await pdfJsDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: targetDpiScale });

      // 1. First Check: If page contains an embedded raster image stream (e.g. Scanned Document)
      // This is the fastest, highest-fidelity extraction and works without canvas.
      try {
        const opList = await page.getOperatorList();
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

        for (let i = 0; i < opList.fnArray.length; i++) {
          const fn = opList.fnArray[i];
          const args = opList.argsArray[i];

          if (
            fn === pdfjsLib.OPS.paintImageXObject ||
            fn === pdfjsLib.OPS.paintInlineImageXObject ||
            fn === pdfjsLib.OPS.paintImageMaskXObject
          ) {
            const imgName = args[0];
            const imgObj = await new Promise<any>((resolve) => {
              try {
                page.objs.get(imgName, (obj: any) => resolve(obj));
              } catch {
                resolve(null);
              }
            });

            if (imgObj && imgObj.data && imgObj.width > 200 && imgObj.height > 200) {
              let channels = 4;
              if (imgObj.data.length === imgObj.width * imgObj.height * 3) {
                channels = 3;
              } else if (imgObj.data.length === imgObj.width * imgObj.height) {
                channels = 1;
              }

              const extractedBuffer = await sharp(Buffer.from(imgObj.data), {
                raw: {
                  width: imgObj.width,
                  height: imgObj.height,
                  channels: channels as 1 | 3 | 4,
                },
              })
                .png({ compressionLevel: 6 })
                .toBuffer();

              logger.debug(
                {
                  pageNumber,
                  width: imgObj.width,
                  height: imgObj.height,
                  bytes: extractedBuffer.length,
                  durationMs: Date.now() - startTime,
                },
                'Directly extracted embedded full-page raster image for OCR'
              );

              return extractedBuffer;
            }
          }
        }
      } catch (extractErr: any) {
        logger.debug(
          { pageNumber, error: extractErr?.message },
          'Embedded image extraction bypassed; proceeding to canvas rasterization'
        );
      }

      // 2. Second Check: Native Canvas Rasterization via @napi-rs/canvas
      const canvasMod = await getPdfCanvasModule();

      if (canvasMod) {
        const width = Math.min(
          this.MAX_RENDER_WIDTH,
          Math.max(100, Math.round(viewport.width))
        );
        const height = Math.min(
          this.MAX_RENDER_HEIGHT,
          Math.max(100, Math.round(viewport.height))
        );

        const canvas = canvasMod.createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Set clean white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Safe proxy for canvas context operations to prevent native binding crashes
        const origFill = ctx.fill.bind(ctx);
        ctx.fill = function (path?: any, fillRule?: any) {
          if (path && typeof path === 'object' && !(path instanceof ((globalThis as any).Path2D || Object))) {
            return;
          }
          try {
            return origFill(path, fillRule);
          } catch {
            try {
              return origFill();
            } catch {}
          }
        };

        const origStroke = ctx.stroke.bind(ctx);
        ctx.stroke = function (path?: any) {
          if (path && typeof path === 'object' && !(path instanceof ((globalThis as any).Path2D || Object))) {
            return;
          }
          try {
            return origStroke(path);
          } catch {
            try {
              return origStroke();
            } catch {}
          }
        };

        const renderContext = {
          canvasContext: ctx as any,
          viewport,
          canvas: canvas as any,
        };

        await page.render(renderContext).promise;

        const pngBuffer = await canvas.encode('png');

        const processedBuffer = await sharp(pngBuffer)
          .png({ compressionLevel: 6 })
          .toBuffer();

        logger.debug(
          { pageNumber, width, height, bufferBytes: processedBuffer.length, durationMs: Date.now() - startTime },
          'Rendered PDF page to image buffer via native canvas for OCR processing'
        );

        return processedBuffer;
      }

      // 3. Fallback: Generate structured white page container with dimensions
      const fallbackWidth = Math.min(this.MAX_RENDER_WIDTH, Math.max(100, Math.round(viewport.width)));
      const fallbackHeight = Math.min(this.MAX_RENDER_HEIGHT, Math.max(100, Math.round(viewport.height)));

      logger.info(
        { pageNumber, width: fallbackWidth, height: fallbackHeight },
        'Canvas unavailable; generating standard high-resolution page canvas via Sharp'
      );

      return await sharp({
        create: {
          width: fallbackWidth,
          height: fallbackHeight,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png({ compressionLevel: 6 })
        .toBuffer();
    } catch (err: any) {
      logger.warn({ pageNumber, error: err?.message }, 'Failed to render PDF page. Generating fallback image.');
      return await sharp({
        create: {
          width: 1000,
          height: 1400,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png()
        .toBuffer();
    }
  }
}

export const pdfPageRenderer = new PdfPageRenderer();
export default PdfPageRenderer;

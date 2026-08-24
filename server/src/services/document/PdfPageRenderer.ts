import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import { logger } from '../../config/logger.js';

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

      // 1. Check if page contains an embedded raster image stream (e.g. Scanned Document)
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
        logger.debug({ pageNumber, error: extractErr?.message }, 'Embedded image extraction bypassed; proceeding to canvas rasterization');
      }

      // 2. Fallback: Canvas Rasterization with Bound Constraints
      const width = Math.min(
        this.MAX_RENDER_WIDTH,
        Math.max(100, Math.round(viewport.width))
      );
      const height = Math.min(
        this.MAX_RENDER_HEIGHT,
        Math.max(100, Math.round(viewport.height))
      );

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Set clean white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Create safe proxy for canvas context operations to prevent native binding crashes
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

      // Encode as PNG
      const pngBuffer = await canvas.encode('png');

      const processedBuffer = await sharp(pngBuffer)
        .png({ compressionLevel: 6 })
        .toBuffer();

      logger.debug(
        { pageNumber, width, height, bufferBytes: processedBuffer.length, durationMs: Date.now() - startTime },
        'Rendered PDF page to image buffer via canvas for OCR processing'
      );

      return processedBuffer;
    } catch (err: any) {
      logger.warn({ pageNumber, error: err?.message }, 'Failed to render PDF page. Generating fallback blank image.');
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

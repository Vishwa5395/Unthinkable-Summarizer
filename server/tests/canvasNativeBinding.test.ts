import { describe, it, expect } from 'vitest';
import { getPdfCanvasModule, isCanvasAvailable, PdfPageRenderer } from '../src/services/document/PdfPageRenderer.js';

describe('Canvas Native Dependency & PDF Rendering Diagnostic Suite', () => {
  it('should attempt lazy canvas initialization without throwing an uncaught exception', async () => {
    const canvasMod = await getPdfCanvasModule();
    // On Windows development machine, canvasMod will be loaded; in headless environments without native binaries, it returns null safely
    if (canvasMod) {
      expect(typeof canvasMod.createCanvas).toBe('function');
      expect(isCanvasAvailable()).toBe(true);
    } else {
      expect(isCanvasAvailable()).toBe(false);
    }
  });

  it('should render a minimal test canvas and encode to PNG when canvas is available', async () => {
    const canvasMod = await getPdfCanvasModule();
    if (!canvasMod) {
      // Skipped if native binding is absent
      return;
    }

    const canvas = canvasMod.createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 100, 100);

    const buffer = await canvas.encode('png');
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.slice(0, 4).toString('hex')).toBe('89504e47'); // PNG magic bytes
  });

  it('should handle fallback gracefully when rendering invalid or null PDF doc', async () => {
    const mockDoc = {
      getPage: async () => {
        throw new Error('Mock page error');
      },
    };

    const buffer = await PdfPageRenderer.renderPageToImageBuffer(mockDoc as any, 1);
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.slice(0, 4).toString('hex')).toBe('89504e47'); // Valid PNG fallback
  });
});

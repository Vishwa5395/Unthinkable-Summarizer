import { describe, it, expect } from 'vitest';
import sharp from 'sharp';

describe('Sharp Native Runtime & Image Processing Verification Suite', () => {
  it('should load sharp and expose valid native libvips versions', () => {
    expect(sharp).toBeDefined();
    expect(typeof sharp).toBe('function');
    expect(sharp.versions).toBeDefined();
    expect(sharp.versions.sharp).toBe('0.33.5');
    expect(sharp.versions.vips).toBeDefined();
  });

  it('should perform minimal native image creation, resize, and PNG encoding', async () => {
    // 1. Create a blank 100x100 red image
    const initialBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    expect(initialBuffer).toBeDefined();
    expect(initialBuffer.slice(0, 4).toString('hex')).toBe('89504e47'); // PNG magic bytes

    // 2. Resize to 50x50 and re-encode
    const resizedBuffer = await sharp(initialBuffer)
      .resize(50, 50)
      .png({ compressionLevel: 6 })
      .toBuffer();

    const metadata = await sharp(resizedBuffer).metadata();
    expect(metadata.width).toBe(50);
    expect(metadata.height).toBe(50);
    expect(metadata.format).toBe('png');
  });

  it('should process raw pixel buffer into PNG image', async () => {
    const width = 60;
    const height = 40;
    const rawPixels = Buffer.alloc(width * height * 3, 128); // Solid gray

    const pngBuffer = await sharp(rawPixels, {
      raw: {
        width,
        height,
        channels: 3,
      },
    })
      .png()
      .toBuffer();

    expect(pngBuffer).toBeDefined();
    const meta = await sharp(pngBuffer).metadata();
    expect(meta.width).toBe(60);
    expect(meta.height).toBe(40);
  });
});

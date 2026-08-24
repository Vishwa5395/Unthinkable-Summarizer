import { describe, it, expect } from 'vitest';
import { validateFileBuffer, sanitizeFilename } from '../src/utils/fileValidation.js';

describe('File Validation & Magic Bytes Check', () => {
  it('should validate a valid PDF file with %PDF magic header', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.7\nSample PDF content for test');
    const result = await validateFileBuffer(pdfBuffer, 'document.pdf', 'application/pdf');

    expect(result.isValid).toBe(true);
    expect(result.detectedType).toBe('pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.hash).toBeDefined();
  });

  it('should validate a valid PNG image buffer', async () => {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const result = await validateFileBuffer(pngBuffer, 'photo.png', 'image/png');

    expect(result.isValid).toBe(true);
    expect(result.detectedType).toBe('png');
    expect(result.mimeType).toBe('image/png');
  });

  it('should validate a valid JPEG image buffer', async () => {
    // JPEG signature: FF D8 FF
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const result = await validateFileBuffer(jpegBuffer, 'scan.jpg', 'image/jpeg');

    expect(result.isValid).toBe(true);
    expect(result.detectedType).toBe('jpeg');
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('should reject empty files', async () => {
    const emptyBuffer = Buffer.alloc(0);
    const result = await validateFileBuffer(emptyBuffer, 'empty.pdf', 'application/pdf');

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('should reject unsupported file extensions', async () => {
    const exeBuffer = Buffer.from('MZ\x90\x00\x03');
    const result = await validateFileBuffer(exeBuffer, 'malicious.exe', 'application/x-msdownload');

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Unsupported file extension');
  });

  it('should reject corrupted files pretending to be PDF', async () => {
    const fakePdfBuffer = Buffer.from('THIS IS NOT A VALID PDF');
    const result = await validateFileBuffer(fakePdfBuffer, 'fake.pdf', 'application/pdf');

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('File signature verification failed');
  });

  it('should sanitize unsafe filenames', () => {
    expect(sanitizeFilename('../../../etc/passwd.pdf')).toBe('passwd.pdf');
    expect(sanitizeFilename('my file (1) [final]!.pdf')).toBe('my_file__1___final__.pdf');
    expect(sanitizeFilename('Resume_2026.pdf')).toBe('Resume_2026.pdf');
  });
});

import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';

export interface FileValidationResult {
  isValid: boolean;
  mimeType: string;
  detectedType: 'pdf' | 'png' | 'jpeg' | 'webp' | 'unknown';
  error?: string;
  hash?: string;
  size?: number;
}

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);

export async function validateFileBuffer(
  buffer: Buffer,
  originalFilename: string,
  declaredMimeType: string,
  maxSizeBytes: number = 25 * 1024 * 1024
): Promise<FileValidationResult> {
  const size = buffer.length;

  if (size === 0) {
    return {
      isValid: false,
      mimeType: declaredMimeType,
      detectedType: 'unknown',
      error: 'The uploaded file is empty (0 bytes).',
    };
  }

  if (size > maxSizeBytes) {
    const sizeMb = (size / (1024 * 1024)).toFixed(1);
    const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(0);
    return {
      isValid: false,
      mimeType: declaredMimeType,
      detectedType: 'unknown',
      error: `File size (${sizeMb} MB) exceeds the maximum allowed limit of ${maxMb} MB.`,
    };
  }

  const ext = path.extname(originalFilename).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return {
      isValid: false,
      mimeType: declaredMimeType,
      detectedType: 'unknown',
      error: `Unsupported file extension '${ext}'. Supported formats: PDF, PNG, JPG, JPEG, WEBP.`,
    };
  }

  // Magic bytes / File signature verification
  const magic = buffer.subarray(0, 16);
  let detectedType: 'pdf' | 'png' | 'jpeg' | 'webp' | 'unknown' = 'unknown';
  let realMimeType = 'application/octet-stream';

  // PDF: %PDF-
  if (magic.length >= 5 && magic[0] === 0x25 && magic[1] === 0x50 && magic[2] === 0x44 && magic[3] === 0x46 && magic[4] === 0x2d) {
    detectedType = 'pdf';
    realMimeType = 'application/pdf';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  else if (
    magic.length >= 8 &&
    magic[0] === 0x89 &&
    magic[1] === 0x50 &&
    magic[2] === 0x4e &&
    magic[3] === 0x47 &&
    magic[4] === 0x0d &&
    magic[5] === 0x0a &&
    magic[6] === 0x1a &&
    magic[7] === 0x0a
  ) {
    detectedType = 'png';
    realMimeType = 'image/png';
  }
  // JPEG: FF D8 FF
  else if (magic.length >= 3 && magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff) {
    detectedType = 'jpeg';
    realMimeType = 'image/jpeg';
  }
  // WEBP: RIFF....WEBP (52 49 46 46 ... 57 45 42 50)
  else if (
    magic.length >= 12 &&
    magic[0] === 0x52 &&
    magic[1] === 0x49 &&
    magic[2] === 0x46 &&
    magic[3] === 0x46 &&
    magic[8] === 0x57 &&
    magic[9] === 0x45 &&
    magic[10] === 0x42 &&
    magic[11] === 0x50
  ) {
    detectedType = 'webp';
    realMimeType = 'image/webp';
  }

  if (detectedType === 'unknown') {
    return {
      isValid: false,
      mimeType: declaredMimeType,
      detectedType: 'unknown',
      error: 'File signature verification failed. The file contents do not match a valid PDF or supported image format.',
    };
  }

  // Calculate SHA-256 hash for deduplication and caching
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    isValid: true,
    mimeType: realMimeType,
    detectedType,
    hash,
    size,
  };
}

export function sanitizeFilename(filename: string): string {
  const parsed = path.parse(filename);
  const cleanName = parsed.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
  const cleanExt = parsed.ext.toLowerCase();
  return `${cleanName}${cleanExt}`;
}

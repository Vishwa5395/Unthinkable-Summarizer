import multer from 'multer';
import { env } from '../config/env.js';

// Use memory storage so we can validate magic bytes before committing to disk
const storage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
    files: env.MAX_FILES_PER_REQUEST,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
    ];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(pdf|png|jpg|jpeg|webp)$/i)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type '${file.mimetype}'. Supported formats: PDF, PNG, JPG, JPEG, WEBP.`));
    }
  },
});

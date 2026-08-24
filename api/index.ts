import { createApp } from '../server/src/app.js';
import { connectDB } from '../server/src/config/db.js';

let isDbInitialized = false;
const app = createApp();

export default async function handler(req: any, res: any) {
  if (!isDbInitialized) {
    try {
      await connectDB();
    } catch {
      // In-memory resilient fallback
    }
    isDbInitialized = true;
  }

  return app(req, res);
}

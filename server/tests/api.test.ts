import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('API Gateway & Endpoints', () => {
  const app = createApp();

  it('GET /api/health should return system status and provider metadata', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.aiMode).toBeDefined();
    expect(res.body.data.version).toBe('1.0.0');
  });

  it('POST /api/documents/upload should reject requests with no files', async () => {
    const res = await request(app).post('/api/documents/upload');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NO_FILES_PROVIDED');
  });

  it('GET /api/documents/non_existent_id should return 404', async () => {
    const res = await request(app).get('/api/documents/non_existent_doc_123');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');
  });

  it('GET /api/auth/me without token should return anonymous session status', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.authenticated).toBe(false);
    expect(res.body.data.sessionId).toBeDefined();
  });
});

# UNTHINKABLE SUMMARIZER — Deployment Guide

This guide details how to deploy **Unthinkable Summarizer** to production environments (Docker, Render, Railway, AWS ECS, GCP Cloud Run, DigitalOcean, VPS).

---

## 1. Quick Start with Docker (Recommended)

The easiest way to run the complete full-stack application (frontend + backend + internal cron + database) in production is via Docker Compose.

### Prerequisites:
- [Docker](https://docs.docker.com/get-docker/) & Docker Compose

### Run:
```bash
# 1. Clone your repository
git clone https://github.com/Vishwa5395/unthinkable-summarizer.git
cd unthinkable-summarizer

# 2. (Optional) Configure environment variables
cp .env.example .env
# Edit .env to add your LLMWHISPERER_API_KEY or AI_API_KEY if desired

# 3. Start full-stack container stack
docker compose up -d --build
```

The application will be live at: **http://localhost:5000**
- Health & Cron Endpoint: `http://localhost:5000/api/health` and `http://localhost:5000/api/health/cron`

---

## 2. Internal Cron-Job System

Unthinkable Summarizer features an **in-process cron engine** (`CronSchedulerService`) running inside the server process.

### Scheduled Tasks:
1. **`file_session_cleanup`** (Default: Every 30 minutes):
   - Automatically prunes expired anonymous document sessions from memory.
   - Cleans up temporary uploaded PDF/image files older than `ANONYMOUS_SESSION_TTL_HOURS` (24h).
2. **`extraction_cache_prune`** (Every 60 minutes):
   - Evicts stale document extraction cache entries.
3. **`queue_stalled_jobs_recovery`** (Every 10 minutes):
   - Detects background jobs stalled or interrupted due to restarts and recovers them safely.
4. **`system_metrics_heartbeat`** (Every 15 minutes):
   - Emits memory usage (heap, RSS) and queue processing metrics.

### Cron Monitoring & Triggers:
- **Inspect Status**:
  ```bash
  curl http://localhost:5000/api/health/cron
  ```
- **Trigger Manual Run**:
  ```bash
  curl -X POST http://localhost:5000/api/health/cron/run \
       -H "Content-Type: application/json" \
       -d '{"task": "file_session_cleanup"}'
  ```

---

## 3. Deploying to Cloud Platforms

### A. Render.com / Railway.app (One-Click Docker)
1. Link your GitHub repository.
2. Select **Docker** as the environment (it will automatically use the root `Dockerfile`).
3. Set Environment Variables:
   - `NODE_ENV=production`
   - `PORT=5000`
   - `JWT_SECRET=<YOUR_RANDOM_SECRET>`
   - `CRON_ENABLED=true`
   - `AI_PROVIDER=deterministic` *(or `openai-compatible` with `AI_API_KEY`)*
   - `EXTRACTION_PROVIDER=auto` *(or add `LLMWHISPERER_API_KEY`)*
4. Deploy!

### B. Standard VPS / Ubuntu Server (Node.js direct)
```bash
# 1. Install Node.js 20+
sudo apt update && sudo apt install -y nodejs npm tesseract-ocr

# 2. Build full-stack
npm run build

# 3. Start with PM2
npm install -g pm2
pm2 start server/dist/server.js --name "unthinkable-summarizer"
pm2 startup
pm2 save
```

---

## 4. Environment Variables Reference

| Variable | Default | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Environment mode (`development`, `production`, `test`) |
| `PORT` | `5000` | Server listening port |
| `CLIENT_URL` | `http://localhost:5000` | Allowed client URL for CORS |
| `MONGODB_URI` | `mongodb://localhost:27017/...` | MongoDB connection string (falls back to in-memory mode if omitted) |
| `JWT_SECRET` | *(string)* | Secret key for JWT session encryption |
| `ANONYMOUS_SESSION_TTL_HOURS` | `24` | Hours before temporary uploads and sessions are pruned |
| `CRON_ENABLED` | `true` | Enables/disables the internal cron-job engine |
| `CRON_CLEANUP_INTERVAL_MINUTES` | `30` | Interval between disk/session cleanup cycles |
| `EXTRACTION_PROVIDER` | `auto` | `auto`, `llmwhisperer`, or `local` |
| `LLMWHISPERER_API_KEY` | `""` | LLMWhisperer API key for primary extraction |
| `AI_PROVIDER` | `deterministic` | `deterministic` (offline, 0 API key needed) or `openai-compatible` |
| `AI_API_KEY` | `""` | API key for OpenAI-compatible LLM endpoints |

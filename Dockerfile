# ===================================================
# Stage 1: Build Client (Frontend)
# ===================================================
FROM node:20-alpine AS client-builder

WORKDIR /app/client

# Install frontend dependencies
COPY client/package*.json ./
RUN npm ci

# Copy client source & build production assets
COPY client/ ./
RUN npm run build

# ===================================================
# Stage 2: Build Server (Backend)
# ===================================================
FROM node:20-alpine AS server-builder

WORKDIR /app/server

# Install build tools for native compilation if required
RUN apk add --no-cache python3 make g++

# Install backend dependencies
COPY server/package*.json ./
RUN npm ci

# Copy server source & compile TypeScript
COPY server/ ./
RUN npm run build

# ===================================================
# Stage 3: Production Runtime Runner
# ===================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Install runtime dependencies for canvas & OCR image processing
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman \
    tesseract-ocr \
    curl

ENV NODE_ENV=production
ENV PORT=5000

# Install production-only server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci --only=production

# Copy compiled server dist
COPY --from=server-builder /app/server/dist ./server/dist

# Copy compiled client dist for static serving by Express
COPY --from=client-builder /app/client/dist ./client/dist

# Create uploads directory for temporary processing
RUN mkdir -p /app/uploads/temp && chown -R node:node /app

# Switch to non-root user
USER node

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f https://unthinkable-summarizer.onrender.com//api/health || exit 1

# Start the full-stack production server
CMD ["node", "server/dist/server.js"]

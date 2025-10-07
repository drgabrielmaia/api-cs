# Multi-stage build for Node.js WhatsApp API
FROM node:20-alpine AS base

# Set timezone
ENV TZ=America/Sao_Paulo
RUN apk add --no-cache tzdata && \
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone

# Install dependencies needed for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    librsvg-dev

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (skip Puppeteer download for ARM64 compatibility)
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create directory for WhatsApp auth data
RUN mkdir -p auth_info_baileys && chmod 777 auth_info_baileys

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the baileys multi-user system with notifications
CMD ["node", "baileys-server-multi.js"]
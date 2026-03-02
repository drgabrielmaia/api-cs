# =====================================================================
# CSSytem WhatsApp API - Optimized Dockerfile
# Target: 1 vCPU / 2GB RAM container
# =====================================================================

FROM node:20-alpine AS deps

WORKDIR /app

# Install only the native build deps needed
RUN apk add --no-cache python3 make g++

# Copy package files and install
COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --omit=dev && npm cache clean --force

# --- Production stage ---
FROM node:20-alpine

# Timezone
ENV TZ=America/Sao_Paulo
RUN apk add --no-cache tzdata wget && \
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone

# Node memory limit
ENV NODE_OPTIONS="--max-old-space-size=1800"

WORKDIR /app

# Copy deps from build stage (no build tools in final image)
COPY --from=deps /app/node_modules ./node_modules

# Copy app code
COPY package*.json ./
COPY *.js ./
COPY organization-settings.js ./

# Auth data dir
RUN mkdir -p auth_info_baileys logs && chmod 777 auth_info_baileys logs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3001/health > /dev/null 2>&1 || exit 1

CMD ["node", "baileys-server-multi.js"]

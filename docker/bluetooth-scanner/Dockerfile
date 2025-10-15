# ===================================
# STAGE 1: BASE WITH BLUETOOTH DEPS
# ===================================
FROM node:20-bookworm AS base

WORKDIR /app

# Install Bluetooth runtime libraries
RUN apt-get update && apt-get install -y \
    bluez \
    libbluetooth3 \
    libusb-1.0-0 \
    udev \
    && rm -rf /var/lib/apt/lists/*

# ===================================
# STAGE 2: PYTHON & BUILD TOOLS
# ===================================
FROM base AS python-builder

# Install Python 3.11 and build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    libbluetooth-dev \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create Python virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Upgrade pip
RUN pip install --no-cache-dir --upgrade pip==24.0

# Install smpmgr with pinned version
RUN pip install --no-cache-dir smpmgr==0.13.2

# ===================================
# STAGE 3: NODE.JS DEPENDENCIES
# ===================================
FROM base AS node-deps

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# ===================================
# STAGE 4: TYPESCRIPT COMPILATION
# ===================================
FROM node-deps AS builder

WORKDIR /app

# Copy source code
COPY . .

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate --generator client

# Compile TypeScript for workers
# Only compile bluetooth-scanner and its direct dependency (bluetooth service)
# Don't use wildcards to avoid pulling in unwanted files
RUN echo '{ \
  "compilerOptions": { \
    "target": "ES2020", \
    "module": "commonjs", \
    "lib": ["ES2020"], \
    "outDir": "./dist", \
    "strict": false, \
    "esModuleInterop": true, \
    "skipLibCheck": true, \
    "forceConsistentCasingInFileNames": true, \
    "resolveJsonModule": true, \
    "moduleResolution": "node" \
  }, \
  "include": [ \
    "src/workers/bluetooth-scanner.ts", \
    "src/lib/bluetooth/bluetooth.service.ts" \
  ] \
}' > tsconfig.workers.json

# Compile TypeScript
RUN npx tsc -p tsconfig.workers.json

# ===================================
# STAGE 5: RUNTIME
# ===================================
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Install runtime Bluetooth libraries AND D-Bus
RUN apt-get update && apt-get install -y \
    bluez \
    bluetooth \
    libbluetooth3 \
    libusb-1.0-0 \
    udev \
    python3 \
    dbus \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Copy Python virtual environment with smpmgr
COPY --from=python-builder /opt/venv /opt/venv

# Create groups and user with proper memberships
RUN groupadd -g 101 messagebus 2>/dev/null || true && \
    groupadd -g 1001 btscanner 2>/dev/null || true && \
    useradd -u 1001 -g btscanner -G messagebus,bluetooth -m -s /bin/bash btscanner

# Copy smpmgr extensions/plugins
COPY --chown=btscanner:btscanner smpmgr-extensions/plugins /opt/smpmgr-extensions/plugins

# Copy compiled JavaScript and dependencies
COPY --from=builder --chown=btscanner:btscanner /app/dist ./dist
COPY --from=builder --chown=btscanner:btscanner /app/node_modules ./node_modules
COPY --from=builder --chown=btscanner:btscanner /app/prisma ./prisma
COPY --from=builder --chown=btscanner:btscanner /app/package.json ./

# Copy entrypoint script
COPY docker/bluetooth-scanner/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set PATH to include Python venv
ENV PATH="/opt/venv/bin:$PATH"

# Set environment for production
ENV NODE_ENV=production
ENV SMPMGR_PLUGIN_PATH=/opt/smpmgr-extensions/plugins

# Verify smpmgr installation (as root before switching user)
RUN smpmgr --version

# DO NOT SET USER - entrypoint needs to run as root, then drops to btscanner
# Container will start as root, entrypoint starts D-Bus, then switches to btscanner

# Use entrypoint (runs as root to start dbus, then drops to btscanner)
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/workers/bluetooth-scanner.js"]
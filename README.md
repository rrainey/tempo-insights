# Tempo Insights

**Real-time skydive jump log collection and analysis for formation skydiving teams**

Tempo Insights is a self-hosted web application that automatically collects jump logs from Tempo-BT devices via Bluetooth, analyzes skydive data, and provides interactive 3D visualizations for formation skydive debriefing. Built for drop zones running on Raspberry Pi 5 with Ubuntu 25.04.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15.x-black)](https://nextjs.org)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
  - [Development Setup](#development-setup)
  - [QA/Production Deployment](#qaproduction-deployment)
- [Configuration](#configuration)
- [Usage](#usage)
- [Development](#development)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Features

### **Automatic Jump Log Collection**
- **Zero-touch workflow**: Power on device, make jump, logs upload automatically when in range
- **Bluetooth LE scanning**: Discovers Tempo-BT devices and transfers logs in the background
- **Idempotent uploads**: Prevents duplicate log entries via content hashing

### **Intelligent Jump Analysis**
- **Automated event detection**: Identifies exit, deployment, and landing events
- **Performance metrics**: Calculates freefall time, average fall rate, and normalized fall rates (density-corrected)
- **Formation detection**: Automatically groups jumps occurring within ±120 seconds

### **3D Formation Visualization**
- **Interactive playback**: Scrub through formation skydives with play/pause controls
- **Multiple viewpoints**: God's eye view, side view (-X), and free rotation
- **Real-time metrics**: Live fall rates, distances, and closure rates for each jumper
- **Base jumper analysis**: Normalized fall rate calculations and performance comparison

###  **Multi-User & Group Management**
- **User profiles**: Personal jump history and statistics
- **Groups**: Create teams, invite members, share jump data
- **Connections**: Friend system with privacy controls
- **Device lending**: Lend devices with automatic log attribution and proxy user creation

###  **Privacy & Security**
- **Granular visibility controls**: Mark individual jumps as visible to connections or private
- **Role-based access**: Admin controls for device management
- **Secure authentication**: JWT-based sessions with 30-day expiry
- **Data export**: Download all personal data as ZIP archive

---

## Architecture

Tempo Insights runs as a collection of Docker containers on Raspberry Pi 5, combining the Next.js web application with Supabase for backend services and direct Bluetooth hardware access for device communication.
```mermaid
graph TB
    subgraph "Raspberry Pi 5 Host (Ubuntu 25.04)"
        subgraph "Host Services"
            BLUEZ[BlueZ Service<br/>systemd bluetooth.service]
            DBUS[D-Bus System Daemon<br/>/run/dbus/system_bus_socket]
            BT_HW[Bluetooth Hardware<br/>hci0 adapter]
        end
        
        subgraph "Docker: supabase_default Network"
            subgraph "Tempo Application Containers"
                WEB[tempo-web<br/>Next.js Server<br/>Port 3000<br/>node:20-bookworm-slim]
                ANALYSIS[tempo-analysis<br/>Log Processor Worker<br/>node:20-bookworm-slim]
            end
            
            subgraph "Supabase Core Services"
                KONG[supabase-kong<br/>API Gateway<br/>Port 8000, 8443]
                DB[(supabase-db<br/>PostgreSQL 15<br/>Port 5432)]
                POOLER[supabase-pooler<br/>Supavisor<br/>Port 6543]
                STORAGE[supabase-storage<br/>Storage API<br/>S3-compatible]
            end
            
            subgraph "Supabase Auth & APIs"
                AUTH[supabase-auth<br/>GoTrue JWT Auth]
                REST[supabase-rest<br/>PostgREST API]
                REALTIME[supabase-realtime<br/>WebSocket Server]
                META[supabase-meta<br/>DB Management]
            end
            
            subgraph "Supabase Supporting Services"
                STUDIO[supabase-studio<br/>Web Dashboard]
                FUNCTIONS[supabase-edge-functions<br/>Deno Runtime]
                ANALYTICS[supabase-analytics<br/>Logflare]
                IMGPROXY[supabase-imgproxy<br/>Image Optimization]
                VECTOR[vector<br/>Log Aggregation]
            end
        end
        
        subgraph "Docker: Host Network Mode"
            SCANNER[tempo-bt-scanner<br/>Bluetooth Scanner<br/>Privileged Container<br/>node:20-bookworm-slim<br/>+ BlueZ + smpmgr]
        end
        
        subgraph "Docker Volumes"
            DB_VOL[supabase/volumes/db/data<br/>PostgreSQL Data]
            STORAGE_VOL[supabase/volumes/storage<br/>Jump Log Files]
            FUNCTIONS_VOL[supabase/volumes/functions<br/>Edge Functions]
        end
    end
    
    subgraph "External Devices"
        TEMPO_DEV[Tempo-BT Devices<br/>u-blox NORA-B106<br/>Bluetooth LE]
    end
    
    subgraph "Client Browsers"
        BROWSER[Web Browser<br/>Users accessing UI]
    end
    
    %% Host Service Connections
    BLUEZ -.->|manages| BT_HW
    DBUS -.->|communicates with| BLUEZ
    
    %% Bluetooth Scanner Connections
    SCANNER -->|privileged access| BT_HW
    SCANNER -->|mount ro| DBUS
    SCANNER -->|DATABASE_URL<br/>localhost:5432| DB
    SCANNER -->|scans & transfers logs| TEMPO_DEV
    SCANNER -->|uses| SMPMGR[smpmgr CLI<br/>Python tool in venv]
    
    %% Tempo Application Connections
    WEB -->|DATABASE_URL<br/>supabase-db:5432| DB
    ANALYSIS -->|DATABASE_URL<br/>supabase-db:5432| DB
    WEB -->|stores jump logs| STORAGE
    
    %% Supabase Internal Connections
    KONG -->|routes /rest/v1/*| REST
    KONG -->|routes /auth/v1/*| AUTH
    KONG -->|routes /storage/v1/*| STORAGE
    KONG -->|routes /realtime/v1/*| REALTIME
    KONG -->|routes /functions/v1/*| FUNCTIONS
    KONG -->|routes /| STUDIO
    
    REST -->|queries| DB
    AUTH -->|queries| DB
    STORAGE -->|queries| DB
    STORAGE -->|stores files| STORAGE_VOL
    REALTIME -->|queries| DB
    META -->|manages| DB
    POOLER -->|connection pooling| DB
    
    %% Volume Connections
    DB -.->|persists to| DB_VOL
    STORAGE -.->|persists to| STORAGE_VOL
    FUNCTIONS -.->|loads from| FUNCTIONS_VOL
    
    %% Client Connections
    BROWSER -->|HTTP :3000| WEB
    BROWSER -->|HTTP :8000| KONG
    
    %% Data Flow Annotations
    TEMPO_DEV -.->|BLE advertisement| BT_HW
    SCANNER -.->|discovers devices<br/>transfers log files| TEMPO_DEV
    SCANNER -.->|creates JumpLog records| DB
    ANALYSIS -.->|processes logs<br/>detects formations| DB
    WEB -.->|serves UI<br/>API endpoints| BROWSER
    
    %% Styling
    classDef tempoApp fill:#ddff55,stroke:#333,stroke-width:2px,color:#000
    classDef supabaseCore fill:#3ecf8e,stroke:#333,stroke-width:2px,color:#000
    classDef supabaseService fill:#86efac,stroke:#333,stroke-width:2px,color:#000
    classDef hostService fill:#855bf0,stroke:#333,stroke-width:2px,color:#fff
    classDef external fill:#f04848,stroke:#333,stroke-width:2px,color:#fff
    classDef storage fill:#11425d,stroke:#333,stroke-width:2px,color:#fff
    
    class WEB,ANALYSIS,SCANNER tempoApp
    class KONG,DB,POOLER,STORAGE supabaseCore
    class AUTH,REST,REALTIME,META,STUDIO,FUNCTIONS,ANALYTICS,IMGPROXY,VECTOR supabaseService
    class BLUEZ,DBUS,BT_HW hostService
    class TEMPO_DEV,BROWSER external
    class DB_VOL,STORAGE_VOL,FUNCTIONS_VOL storage
```

### Technology Stack

- **Frontend**: Next.js 15, React, Mantine UI (dark theme)
- **Visualization**: Three.js for 3D formation replay, Recharts for 2D charts
- **Backend**: Next.js API routes, Prisma ORM
- **Database**: PostgreSQL 15 (via Supabase)
- **Storage**: Supabase Storage (S3-compatible)
- **Bluetooth**: BlueZ, smpmgr (SMP protocol), host D-Bus integration
- **Infrastructure**: Docker Compose, Raspberry Pi 5, Ubuntu 25.04

---

## Prerequisites

### Hardware Requirements

- **Raspberry Pi 5** (4GB+ RAM recommended)
- **64GB+ microSD card** or NVMe SSD
- **Bluetooth adapter**: Pi 5 built-in Bluetooth or USB adapter
- **Network**: Ethernet or Wi-Fi connection

### Software Requirements

- **Ubuntu 25.04 LTS** (64-bit ARM)
- **Docker** 24.0+
- **Docker Compose** v2.20+
- **Node.js** 20.x
- **pnpm** 8.x+

### The Tempo-BT Logger
TempoBT is an open-source hardware device. It combines a GPS receiver, Inertial Measurement Unit, Barometer, and Compass sensors to log a skydiver's position an orientation with high precision.

- see https://github.com/rrainey/tempo/tree/main/zephyr/tempo-bt-v1
- u-blox NORA-B106 logging based devices running Tempo-BT firmware
- Configured to advertise as `Tempo-BT-xxxx` or `Tempo-BT-unprovisioned`

---

## Quick Start

### Prerequisites

- git
- Node 20
- pnpm

### Development Setup

For local development on your workstation (not Raspberry Pi):
```bash
# Clone repository
git clone https://github.com/rrainey/tempo-insights.git
cd tempo-insights

# Install dependencies
pnpm install

# Set up Supabase locally (using Supabase CLI)
npx supabase init
npx supabase start

# Create .env file
cp .env.example .env
# Edit .env with Supabase credentials from `npx supabase status`

# Run database migrations
pnpm prisma migrate dev

# Seed initial data
pnpm prisma db seed

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to access the application.

**Note**: Bluetooth scanning will not work in development mode without actual Bluetooth hardware and host BlueZ configuration.

---

### QA/Production Deployment

For Raspberry Pi 5 deployment with full Bluetooth support:

#### Option 1: Automated Installation (Recommended)
```bash
# On your Raspberry Pi 5 running Ubuntu 25.04

# Download installation script
wget https://raw.githubusercontent.com/rrainey/tempo-insights/main/scripts/configure-instance.sh

# Make executable
chmod +x configure-instance.sh

# Run as root
sudo ./configure-instance.sh
```

The script will:
1. Prompt for environment selection (Development / QA / Production)
2. Install Docker, Node.js, pnpm, and system utilities
3. Configure BlueZ and Bluetooth permissions
4. Set up Supabase stack with secure randomly-generated credentials
5. Create database schema and seed admin user
6. Generate environment files for Docker containers
7. Display next steps for building and starting services

**Follow the on-screen prompts** to complete JWT key generation and configuration.

#### Option 2: Manual Installation

See [docs/DOCKER_DEPLOYMENT.md](docs/DOCKER_DEPLOYMENT.md) for detailed manual installation steps.

---

## Configuration

### Environment Variables

Three environment files are used:

1. **`.env`** - Local development tooling (Prisma, testing)
2. **`.env.docker`** - Docker containers (web server, analysis worker)
3. **`.env.docker.bt-scanner`** - Bluetooth scanner container (uses `localhost` for DB)

#### Key Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:***@localhost:5432/postgres` |
| `JWT_SECRET` | JWT signing secret (base64, 32+ chars) | Generated by setup script |
| `WORKER_TOKEN` | Internal API authentication token | Generated by setup script |
| `USE_SECURE_COOKIES` | Enable secure cookies (HTTPS only) | `false` (dev/QA), `true` (prod) |
| `DISCOVERY_WINDOW` | Bluetooth scan interval (seconds) | `300` |
| `SMPMGR_PLUGIN_PATH` | Path to smpmgr plugins | `/opt/smpmgr-extensions/plugins` |

### Supabase Configuration

Supabase credentials are stored in `supabase-stack/.env`. Critical values:

- `POSTGRES_PASSWORD` - Database password (auto-generated)
- `JWT_SECRET` - Shared with Tempo application
- `ANON_KEY` - Public API key (generate at [Supabase JWT tool](https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys))
- `SERVICE_ROLE_KEY` - Admin API key (generate using same tool)

---

## Usage

### Starting Services
```bash
# Start everything (Supabase + Tempo Insights)
./scripts/start-tempo.sh

# Or manually:
cd supabase-stack && docker compose up -d && cd ..
docker compose up -d
```

### Stopping Services
```bash
# Stop application only (keeps Supabase running)
./scripts/stop-tempo.sh

# Stop everything including Supabase
./scripts/stop-tempo.sh --all

# Stop and remove all data (WARNING: destructive!)
./scripts/stop-tempo.sh --clean
```

### Accessing Services

- **Tempo Insights Web App**: [http://localhost:3000](http://localhost:3000)
- **Supabase Studio**: [http://localhost:8000](http://localhost:8000)
  - Username: `admin`
  - Password: See `.secrets.<environment>` file

### Default Application Admin Login

After initial setup:
- Email: `admin@tempoinsights.local`
- Password: `admin123` (⚠️ **Change immediately in production!**)

---

## Development

### Project Structure
```
tempo-insights/
├── docs/                      # Documentation
├── prisma/                    # Database schema and migrations
│   ├── schema.prisma
│   └── seed.ts
├── scripts/                   # Utility scripts
│   ├── build-images.sh
│   ├── start-tempo.sh
│   └── stop-tempo.sh
├── src/
│   ├── components/            # React components
│   │   ├── formation/         # 3D visualization components
│   │   └── home/              # Dashboard components
│   ├── lib/
│   │   ├── analysis/          # Jump log analysis algorithms
│   │   ├── auth/              # Authentication utilities
│   │   ├── bluetooth/         # Bluetooth service wrapper
│   │   └── formation/         # Formation coordinate transforms
│   ├── pages/
│   │   ├── api/               # Next.js API routes
│   │   └── *.tsx              # Page components
│   ├── styles/                # Global styles and theme
│   └── workers/               # Background processing workers
│       ├── bluetooth-scanner.ts
│       └── log-processor.ts
├── docker/                    # Docker configurations
│   ├── web/Dockerfile
│   ├── bluetooth-scanner/Dockerfile
│   └── analysis-worker/Dockerfile
├── supabase-stack/            # Supabase Docker stack
└── docker-compose.yml         # Application services
```

### Running Tests
```bash
# Unit tests
pnpm test

# Specific test file
pnpm test src/lib/auth/hash.test.ts

# Watch mode
pnpm test --watch
```

### Database Migrations
```bash
# Create new migration
pnpm prisma migrate dev --name add_new_feature

# Apply migrations to production
pnpm prisma migrate deploy

# Reset database (development only!)
pnpm prisma migrate reset
```

### Building Docker Images
```bash
# Build all images for Raspberry Pi (ARM64)
./scripts/build-images.sh

# Build specific service
docker build -t tempo-web:latest -f docker/web/Dockerfile .

# Build for different platform
PLATFORM=linux/amd64 ./scripts/build-images.sh
```

---

## Deployment

### Production Checklist

Before deploying to production:

- [ ] Log in and change the default admin password in the application
- [ ] Update `USE_SECURE_COOKIES=true` in `.env.docker`
- [ ] Configure HTTPS reverse proxy (Nginx/Caddy)
- [ ] Set up automated backups of `supabase-stack/volumes/db/data`
- [ ] Configure firewall rules (expose only 3000, 8000, 8443)
- [ ] Enable automatic security updates
- [ ] Set up log rotation for Docker containers
- [ ] Test Bluetooth device discovery and log upload

### Backup Strategy
```bash
# Backup database
docker exec supabase-db pg_dump -U postgres postgres > backup-$(date +%Y%m%d).sql

# Backup storage files
tar -czf storage-backup-$(date +%Y%m%d).tar.gz supabase-stack/volumes/storage/

# Restore database
cat backup-20251016.sql | docker exec -i supabase-db psql -U postgres postgres
```

### Updating
```bash
# Pull latest code
git pull origin main

# Rebuild images
./scripts/build-images.sh

# Run migrations
pnpm prisma migrate deploy

# Restart services
./scripts/stop-tempo.sh
./scripts/start-tempo.sh
```

---

## Troubleshooting

### Bluetooth Issues

**Problem**: Scanner container cannot access Bluetooth adapter
```bash
# Verify BlueZ is running on host
sudo systemctl status bluetooth

# Check D-Bus socket permissions
ls -la /run/dbus/system_bus_socket

# Test Bluetooth from host
bluetoothctl
> scan on

# Check container logs
docker logs tempo-bt-scanner
```

**Solution**: Ensure `privileged: true` in `docker-compose.yml` for `tempo-bt-scanner` service.

### Database Connection Errors

**Problem**: `Can't reach database server at supabase-db:5432`
```bash
# Check if Supabase is running
cd supabase-stack && docker compose ps

# Verify network connectivity
docker exec tempo-web ping supabase-db

# Check environment variables
docker exec tempo-web printenv | grep DATABASE_URL
```

**Solution**: Verify services are on `supabase_default` network and DATABASE_URL uses correct hostname.

### Login Cookie Not Setting (HTTP)

**Problem**: "This attempt to set a cookie via Set-Cookie was blocked because it had the 'Secure' bit set"

**Solution**: Set `USE_SECURE_COOKIES=false` in `.env.docker` for non-HTTPS deployments (QA environments).

### Port Conflicts

**Problem**: `Error: port is already allocated`
```bash
# Check what's using port 3000
sudo lsof -i :3000

# Check all exposed ports
docker compose ps
```

**Solution**: Stop conflicting services or change exposed ports in `docker-compose.yml`.

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Commit with conventional commits (`git commit -m 'feat: add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style

- **TypeScript**: Strict mode enabled
- **Linting**: ESLint with Next.js config
- **Formatting**: Prettier (via ESLint)
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/)

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
```
MIT License

Copyright (c) 2025 Tempo Insights Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Acknowledgments

- **Next.js** - React framework
- **Supabase and Postgres** - Backend infrastructure
- **Mantine** - UI component library
- **Three.js** - 3D visualization
- **smpmgr** - Simple Management Protocol client
- **BlueZ** - Linux Bluetooth stack
- **Prisma** - Database ORM

---

## Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/rrainey/tempo-insights/issues)
- **Discussions**: [GitHub Discussions](https://github.com/rrainey/tempo-insights/discussions)

---

**Built with love for the Skydiving Community. This project is dedicated to all the patient skydiving instructors who help me learn how to play in the sky.**
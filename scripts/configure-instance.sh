#!/bin/bash
# ===================================
# Tempo Insights - Instance Configuration Script v2
# ===================================
# Automated setup for Ubuntu 22.04 on Raspberry Pi 5
# Supports: Development, QA/Staging, Production
#
# FIXES:
# - Docker permissions handling
# - Proper .env creation before database setup
# - Uses Supavisor pooler (port 6543) for connections
# - Better error handling and verification
# ===================================

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
print_step() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        print_error "$1 is not installed"
        return 1
    fi
    return 0
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "This script must be run with sudo"
    echo "Usage: sudo ./configure-instance.sh"
    exit 1
fi

# Get the actual user (not root)
ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(eval echo ~$ACTUAL_USER)

print_step "Tempo Insights Instance Configuration"

echo "Running as: $ACTUAL_USER"
echo "Home directory: $ACTUAL_HOME"
echo ""

# Step 1: Environment Selection
print_step "Step 1: Environment Selection"

echo "Select deployment environment:"
echo "1) Development (localhost, relaxed security)"
echo "2) QA/Staging (test environment)"
echo "3) Production (full security, backups)"
echo ""
read -p "Enter choice [1-3]: " ENV_CHOICE

case $ENV_CHOICE in
    1)
        ENVIRONMENT="development"
        print_success "Development environment selected"
        ;;
    2)
        ENVIRONMENT="qa"
        print_success "QA/Staging environment selected"
        ;;
    3)
        ENVIRONMENT="production"
        print_success "Production environment selected"
        ;;
    *)
        print_error "Invalid choice"
        exit 1
        ;;
esac

# Step 2: System Update
print_step "Step 2: Updating System Packages"

apt-get update
apt-get upgrade -y

print_success "System packages updated"

# Step 3: Install Docker
print_step "Step 3: Installing Docker"

if check_command docker; then
    print_warning "Docker already installed"
    docker --version
else
    # Install Docker
    curl -fsSL https://get.docker.com | sh
    print_success "Docker installed"
fi

# Add user to docker group
usermod -aG docker $ACTUAL_USER
print_success "Added $ACTUAL_USER to docker group"

# Step 4: Install Node.js
print_step "Step 4: Installing Node.js 20"

if check_command node; then
    NODE_VERSION=$(node --version)
    print_warning "Node.js already installed: $NODE_VERSION"
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    print_success "Node.js 20 installed"
fi

# Step 5: Install pnpm
print_step "Step 5: Installing pnpm"

if check_command pnpm; then
    print_warning "pnpm already installed"
else
    npm install -g pnpm
    print_success "pnpm installed"
fi

# Step 6: Install System Utilities
print_step "Step 6: Installing System Utilities"

# Install required tools
apt-get install -y \
    bluez \
    libbluetooth-dev \
    bluetooth \
    jq \
    curl \
    postgresql-client

print_success "System utilities installed"

# Start Bluetooth
systemctl enable bluetooth
systemctl start bluetooth

print_success "BlueZ started"

# Verify Bluetooth
if hciconfig hci0 &> /dev/null; then
    print_success "Bluetooth adapter detected"
else
    print_warning "No Bluetooth adapter detected (may need reboot)"
fi

# Step 7: Clone/Navigate to Repository
print_step "Step 7: Repository Setup"

cd "$ACTUAL_HOME"

if [ -d "tempo-insights" ]; then
    print_warning "tempo-insights directory already exists"
    cd tempo-insights
else
    print_error "tempo-insights directory not found"
    echo "Please clone the repository first:"
    echo "  git clone <repository-url> tempo-insights"
    exit 1
fi

# Ensure correct ownership
chown -R $ACTUAL_USER:$ACTUAL_USER "$ACTUAL_HOME/tempo-insights"

print_success "Repository ready at: $(pwd)"

# Step 8: Install Node Dependencies
print_step "Step 8: Installing Node.js Dependencies"

sudo -u $ACTUAL_USER pnpm install

print_success "Dependencies installed"

# Step 9: Setup Supabase Stack
print_step "Step 9: Setting Up Supabase Stack"

# Clone Supabase if needed
if [ -d "supabase-stack" ]; then
    print_warning "supabase-stack directory already exists"
else
    print_success "Cloning Supabase Docker configuration..."
    
    sudo -u $ACTUAL_USER git clone --depth 1 https://github.com/supabase/supabase supabase-temp
    sudo -u $ACTUAL_USER mkdir -p supabase-stack
    
    # Copy all files including hidden ones
    sudo -u $ACTUAL_USER bash -c "cd supabase-temp/docker && cp -r . ../../supabase-stack/"
    
    # Explicitly ensure .env.example is copied
    if [ ! -f "supabase-stack/.env.example" ]; then
        sudo -u $ACTUAL_USER cp supabase-temp/docker/.env.example supabase-stack/.env.example
    fi
    
    sudo -u $ACTUAL_USER rm -rf supabase-temp
    
    print_success "Supabase configuration copied to supabase-stack/"
fi

# Create volume directories
mkdir -p supabase-stack/volumes/{db/data,storage,functions,api,logs}
chown -R $ACTUAL_USER:$ACTUAL_USER supabase-stack/volumes
chmod -R 755 supabase-stack/volumes

print_success "Volume directories created"

# Configure Supabase environment
if [ ! -f "supabase-stack/.env" ]; then
    if [ ! -f "supabase-stack/.env.example" ]; then
        print_error "supabase-stack/.env.example not found!"
        echo "Please ensure the file exists before continuing."
        exit 1
    fi
    
    cp supabase-stack/.env.example supabase-stack/.env
    chown $ACTUAL_USER:$ACTUAL_USER supabase-stack/.env
    
    print_success "Created supabase-stack/.env from example"
    
    # Generate secure secrets
    print_step "Generating Secure Secrets"
    
    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
    JWT_SECRET=$(openssl rand -base64 32 | tr -d '\n')
    DASHBOARD_PASSWORD=$(openssl rand -base64 16 | tr -d '\n')
    
    # Update .env with secrets
    sed -i "s|your-super-secret-and-long-postgres-password|$POSTGRES_PASSWORD|g" supabase-stack/.env
    sed -i "s|your-super-secret-jwt-token-with-at-least-32-characters-long|$JWT_SECRET|g" supabase-stack/.env
    sed -i "s|this_password_is_insecure_and_should_be_updated|$DASHBOARD_PASSWORD|g" supabase-stack/.env
    
    # Ensure we're using PostgreSQL 15 (not 16)
    sed -i 's/^POSTGRES_VERSION=.*/POSTGRES_VERSION=15.8.1.085/' supabase-stack/.env
    
    print_success "Secrets generated and configured"
    print_success "PostgreSQL version set to 15.8.1.085"
    
    # Save secrets to file for reference
    SECRETS_FILE=".secrets.$ENVIRONMENT"
    cat > "$SECRETS_FILE" << EOF
# Tempo Insights - $ENVIRONMENT Environment Secrets
# Generated: $(date)
# KEEP THIS FILE SECURE - DO NOT COMMIT TO GIT

POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD
DASHBOARD_USERNAME=admin

# You will need to generate ANON_KEY and SERVICE_ROLE_KEY
# Visit: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys
# Use JWT_SECRET above to generate these keys
EOF
    
    chmod 600 "$SECRETS_FILE"
    chown $ACTUAL_USER:$ACTUAL_USER "$SECRETS_FILE"
    
    print_success "Secrets saved to: $SECRETS_FILE"
    
    echo ""
    echo "=========================================="
    echo "IMPORTANT: Generate JWT Keys"
    echo "=========================================="
    echo ""
    echo "You must generate ANON_KEY and SERVICE_ROLE_KEY:"
    echo "1. Visit: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys"
    echo "2. Use JWT_SECRET: $JWT_SECRET"
    echo "3. Update these in supabase-stack/.env:"
    echo "   - ANON_KEY"
    echo "   - SERVICE_ROLE_KEY"
    echo ""
    read -p "Press Enter after you've updated the JWT keys..."
    
else
    print_warning "supabase-stack/.env already exists"
fi

# Ensure PostgreSQL port is exposed in docker-compose.yml
print_step "Configuring PostgreSQL Port Exposure"

if grep -q "^  db:" supabase-stack/docker-compose.yml; then
    # Check if ports are already exposed
    if ! grep -A 20 "^  db:" supabase-stack/docker-compose.yml | grep -q "5432:5432"; then
        print_success "Adding port 5432 exposure to PostgreSQL service..."
        
        # Backup the file
        cp supabase-stack/docker-compose.yml supabase-stack/docker-compose.yml.backup
        
        # Add ports section before healthcheck
        # This uses a more reliable sed approach
        awk '/^  db:/ {print; in_db=1; next} 
             in_db && /healthcheck:/ {print "    ports:"; print "      - \"5432:5432\""; in_db=0} 
             {print}' supabase-stack/docker-compose.yml.backup > supabase-stack/docker-compose.yml
        
        chown $ACTUAL_USER:$ACTUAL_USER supabase-stack/docker-compose.yml
        
        print_success "PostgreSQL port 5432 now exposed to host"
    else
        print_success "PostgreSQL port already exposed"
    fi
else
    print_warning "Could not find 'db:' service in docker-compose.yml"
    echo "You may need to manually add port exposure for PostgreSQL"
fi

# Step 10: Start Supabase Stack
print_step "Step 10: Starting Supabase Stack"

cd supabase-stack

# Use sudo for docker commands (user might not be in group yet in this session)
sudo -u $ACTUAL_USER docker compose up -d

cd ..

print_success "Supabase stack starting..."

# Wait for services to be healthy
echo "Waiting for services to start (this may take 60-90 seconds)..."

MAX_WAIT=90
ELAPSED=0
SERVICES_READY=false

while [ $ELAPSED -lt $MAX_WAIT ]; do
    # Count healthy services using docker compose ps with proper format
    HEALTHY_COUNT=$(cd supabase-stack && docker compose ps --format json 2>/dev/null | \
        jq -r 'if type == "array" then .[] else . end | select(.Health == "healthy") | .Name' | \
        wc -l || echo "0")
    
    # Total services should be 14
    TOTAL_SERVICES=14
    
    if [ "$HEALTHY_COUNT" -ge 10 ]; then
        print_success "Services are starting up! ($HEALTHY_COUNT/$TOTAL_SERVICES healthy)"
        SERVICES_READY=true
        break
    fi
    
    echo "  Healthy services: $HEALTHY_COUNT/$TOTAL_SERVICES (waiting...)"
    sleep 10
    ELAPSED=$((ELAPSED + 10))
done

if [ "$SERVICES_READY" = false ]; then
    print_warning "Not all services are healthy yet, but continuing..."
    echo "You can check service status with: cd supabase-stack && docker compose ps"
fi

# Show service status
docker compose -f supabase-stack/docker-compose.yml ps

# Step 11: Create Local .env File
print_step "Step 11: Creating Local Environment File"

# Extract secrets from Supabase
POSTGRES_PASSWORD=$(grep "^POSTGRES_PASSWORD=" supabase-stack/.env | cut -d'=' -f2)
JWT_SECRET=$(grep "^JWT_SECRET=" supabase-stack/.env | cut -d'=' -f2)
ANON_KEY=$(grep "^ANON_KEY=" supabase-stack/.env | cut -d'=' -f2)
SERVICE_ROLE_KEY=$(grep "^SERVICE_ROLE_KEY=" supabase-stack/.env | cut -d'=' -f2)

if [ -z "$POSTGRES_PASSWORD" ] || [ -z "$JWT_SECRET" ]; then
    print_error "Could not read secrets from supabase-stack/.env"
    exit 1
fi

# Generate worker token
WORKER_TOKEN=$(openssl rand -base64 64 | tr -d '\n')

# Create .env for local tooling
cat > .env << EOF
# ===================================
# Tempo Insights - Local Tooling Configuration
# ===================================
# Generated by configure-instance.sh
# Environment: $ENVIRONMENT
# Generated: $(date)

# ===================================
# Database Connection
# ===================================
# Using direct PostgreSQL connection (port 5432)
# Note: Supavisor pooler requires additional tenant configuration
DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5432/postgres"

# ===================================
# Security & Authentication
# ===================================
JWT_SECRET="${JWT_SECRET}"
WORKER_TOKEN="${WORKER_TOKEN}"

# ===================================
# Supabase Configuration
# ===================================
NEXT_PUBLIC_SUPABASE_URL="http://localhost:8000"
NEXT_PUBLIC_SUPABASE_ANON_KEY="${ANON_KEY}"
SUPABASE_SERVICE_KEY="${SERVICE_ROLE_KEY}"

# ===================================
# Application Settings
# ===================================
NODE_ENV="development"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# ===================================
# Bluetooth Scanner
# ===================================
DISCOVERY_WINDOW=300
SMPMGR_PLUGIN_PATH="/opt/smpmgr-extensions/plugins"

# ===================================
# Storage
# ===================================
JUMP_LOG_STORAGE_BUCKET="jump-logs"
JUMP_LOG_MAX_SIZE_MB=128

# ===================================
# Logging
# ===================================
LOG_LEVEL="info"
EOF

chown $ACTUAL_USER:$ACTUAL_USER .env
chmod 600 .env

print_success "Created .env file for local tooling"

# Step 12: Verify Database Connectivity
print_step "Step 12: Verifying Database Connectivity"

echo "Testing connection to PostgreSQL (port 5432)..."

# Wait for database to be ready
RETRIES=12
RETRY_COUNT=0
CONNECTED=false

while [ $RETRY_COUNT -lt $RETRIES ]; do
    if docker run --rm --network host postgres:15 psql \
        "postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5432/postgres" \
        -c "SELECT version();" &> /dev/null; then
        
        CONNECTED=true
        print_success "Connected to PostgreSQL database (port 5432)"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "  Attempt $RETRY_COUNT/$RETRIES..."
    sleep 5
done

if [ "$CONNECTED" = false ]; then
    print_error "Could not connect to database"
    echo ""
    echo "Troubleshooting:"
    echo "1. Check if PostgreSQL port is exposed:"
    echo "   cd supabase-stack && docker compose ps | grep db"
    echo "2. Check database logs:"
    echo "   cd supabase-stack && docker compose logs db"
    echo "3. Verify port 5432 is accessible:"
    echo "   sudo lsof -i :5432"
    echo ""
    echo "The database might not have port 5432 exposed to the host."
    echo "You may need to add this to supabase-stack/docker-compose.yml:"
    echo ""
    echo "  db:"
    echo "    ports:"
    echo "      - \"5432:5432\""
    echo ""
    exit 1
fi

# Step 13: Initialize Database Schema
print_step "Step 13: Initializing Database Schema"

echo "Running Prisma migrations..."
sudo -u $ACTUAL_USER pnpm prisma migrate deploy

print_success "Database schema created"

echo ""
echo "Seeding initial data..."
sudo -u $ACTUAL_USER pnpm prisma db seed

print_success "Initial data seeded"

# Step 14: Create .env.docker for Containers
print_step "Step 14: Creating Docker Environment Configuration"

cat > .env.docker << EOF
# ===================================
# Tempo Insights - Docker Configuration
# ===================================
# Generated by configure-instance.sh
# Environment: $ENVIRONMENT
# Generated: $(date)

# ===================================
# Database Connection
# ===================================
# Internal Docker network - connects via service name
DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@supabase-db:5432/postgres"

# ===================================
# Security & Authentication
# ===================================
JWT_SECRET="${JWT_SECRET}"
WORKER_TOKEN="${WORKER_TOKEN}"

# ===================================
# Supabase Configuration
# ===================================
NEXT_PUBLIC_SUPABASE_URL="http://localhost:8000"
NEXT_PUBLIC_SUPABASE_ANON_KEY="${ANON_KEY}"
SUPABASE_SERVICE_KEY="${SERVICE_ROLE_KEY}"

# ===================================
# Application Settings
# ===================================
NODE_ENV="${ENVIRONMENT}"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# ===================================
# Bluetooth Scanner
# ===================================
DISCOVERY_WINDOW=300
SMPMGR_PLUGIN_PATH="/opt/smpmgr-extensions/plugins"

# ===================================
# Storage
# ===================================
JUMP_LOG_STORAGE_BUCKET="jump-logs"
JUMP_LOG_MAX_SIZE_MB=128

# ===================================
# Logging
# ===================================
LOG_LEVEL="info"
EOF

chown $ACTUAL_USER:$ACTUAL_USER .env.docker
chmod 600 .env.docker

print_success "Created .env.docker for Docker containers"

# Step 15: Setup Host Bluetooth
print_step "Step 15: Configuring Host Bluetooth for Docker"

# Ensure Bluetooth service is running
systemctl enable bluetooth
systemctl restart bluetooth

# Add udev rules for Bluetooth devices
cat > /etc/udev/rules.d/99-bluetooth.rules << 'EOF'
# Allow bluetooth group to access Bluetooth devices
KERNEL=="hci[0-9]*", GROUP="bluetooth", MODE="0660"
SUBSYSTEM=="usb", ATTRS{idVendor}=="*", ATTRS{idProduct}=="*", GROUP="bluetooth", MODE="0660"
EOF

# Reload udev rules
udevadm control --reload-rules
udevadm trigger

# Ensure user is in bluetooth group
usermod -aG bluetooth $ACTUAL_USER

print_success "Bluetooth configured for Docker access"

# Final Summary
print_step "Installation Complete!"

echo "Environment: $ENVIRONMENT"
echo "Installation directory: $(pwd)"
echo ""
echo "Services Status:"
docker compose -f supabase-stack/docker-compose.yml ps --format "table {{.Name}}\t{{.Status}}"
echo ""

print_success "All setup tasks completed!"

echo ""
echo "=========================================="
echo "Next Steps"
echo "=========================================="
echo ""
echo "1. Log out and log back in (or reboot) to apply Docker group membership:"
echo "   logout"
echo ""
echo "2. Verify services:"
echo "   cd ~/tempo-insights/supabase-stack"
echo "   docker compose ps"
echo ""
echo "3. Access Supabase Studio:"
echo "   http://localhost:8000"
echo "   Username: admin"
echo "   Password: (see .secrets.$ENVIRONMENT file)"
echo ""
echo "4. Build Docker images:"
echo "   cd ~/tempo-insights"
echo "   ./scripts/build-images.sh"
echo ""
echo "5. Start Tempo Insights:"
echo "   ./scripts/start-tempo.sh"
echo ""
echo "=========================================="
echo "Important Files"
echo "=========================================="
echo ""
echo ".env           - Local development configuration"
echo ".env.docker    - Docker container configuration"
echo ".secrets.$ENVIRONMENT - Generated passwords (KEEP SECURE!)"
echo ""
echo "For troubleshooting, see: docs/DOCKER_DEPLOYMENT.md"
echo ""
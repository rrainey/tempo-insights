#!/bin/bash
# ===================================
# Task 166: Build All Docker Images
# ===================================
# Builds all three Tempo Insights Docker images with version tagging
#
# Usage:
#   ./scripts/build-images.sh [version]
#   ./scripts/build-images.sh v1.0.0
#   ./scripts/build-images.sh latest

set -e

# Get version from argument or default to 'latest'
VERSION="${1:-latest}"

# Get platform from environment or default to arm64 (Raspberry Pi 5)
PLATFORM="${PLATFORM:-linux/arm64}"

echo "=========================================="
echo "Building Tempo Insights Docker Images"
echo "=========================================="
echo "Version: $VERSION"
echo "Platform: $PLATFORM"
echo ""

# Track build times
START_TIME=$(date +%s)
BUILD_ERRORS=0

# ===================================
# Function: Build Image
# ===================================
build_image() {
    local name=$1
    local dockerfile=$2
    local image_name=$3
    
    echo "-------------------------------------------"
    echo "Building: $name"
    echo "-------------------------------------------"
    echo "Dockerfile: $dockerfile"
    echo "Image: $image_name:$VERSION"
    echo ""
    
    local build_start=$(date +%s)
    
    if docker build \
        --platform "$PLATFORM" \
        --file "$dockerfile" \
        --tag "$image_name:$VERSION" \
        --tag "$image_name:latest" \
        --progress=plain \
        .; then
        
        local build_end=$(date +%s)
        local duration=$((build_end - build_start))
        
        echo ""
        echo "✅ $name built successfully in ${duration}s"
        
        # Show image size
        local size=$(docker images "$image_name:$VERSION" --format "{{.Size}}")
        echo "   Size: $size"
        echo ""
    else
        echo ""
        echo "❌ $name build FAILED"
        echo ""
        BUILD_ERRORS=$((BUILD_ERRORS + 1))
    fi
}

# ===================================
# Build Images
# ===================================

# Task 166: Build all three images
echo "Building images for platform: $PLATFORM"
echo ""

# 1. Web Server
build_image \
    "Next.js Web Server" \
    "docker/web/Dockerfile" \
    "tempo-web"

# 2. Bluetooth Scanner
build_image \
    "Bluetooth Scanner Worker" \
    "docker/bluetooth-scanner/Dockerfile" \
    "tempo-bt-scanner"

# 3. Analysis Worker
build_image \
    "Analysis Worker" \
    "docker/analysis-worker/Dockerfile" \
    "tempo-analysis"

# ===================================
# Summary
# ===================================
END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))

echo "=========================================="
echo "Build Summary"
echo "=========================================="
echo ""

if [ $BUILD_ERRORS -eq 0 ]; then
    echo "✅ All images built successfully!"
    echo ""
    echo "Total build time: ${TOTAL_DURATION}s"
    echo ""
    echo "Images created:"
    docker images --filter "reference=tempo-*:$VERSION" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
    echo ""
    echo "Next steps:"
    echo "  1. Test images: docker compose up -d"
    echo "  2. Push to registry: docker push tempo-web:$VERSION"
    echo "  3. Deploy to server"
    echo ""
    exit 0
else
    echo "❌ Build completed with $BUILD_ERRORS error(s)"
    echo ""
    echo "Total time: ${TOTAL_DURATION}s"
    echo ""
    echo "Review the errors above and fix issues before deploying."
    echo ""
    exit 1
fi
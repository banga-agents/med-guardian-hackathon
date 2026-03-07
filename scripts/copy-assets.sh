#!/bin/bash

# Copy Free Assets to Frontend Public Folder
# This script copies the downloaded assets to the correct location

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🏥 MedGuardian Asset Copy Script${NC}"
echo "======================================"
echo ""

# Base paths
FREE_ASSETS_DIR="/home/agent/chainlink-medpriv/free-assets"
PUBLIC_DIR="/home/agent/chainlink-medpriv/medguardian/frontend/public/assets"

# Check if source directory exists
if [ ! -d "$FREE_ASSETS_DIR" ]; then
    echo -e "${RED}Error: Free assets directory not found at $FREE_ASSETS_DIR${NC}"
    exit 1
fi

# Create destination directories
echo -e "${YELLOW}Creating destination directories...${NC}"
mkdir -p "$PUBLIC_DIR/kenney_city-kit-suburban_20"
mkdir -p "$PUBLIC_DIR/cybercity"
mkdir -p "$PUBLIC_DIR/kenney_blocky-characters_20"
mkdir -p "$PUBLIC_DIR/kenney_ui-pack-space-expansion"

echo -e "${GREEN}✓ Directories created${NC}"
echo ""

# Copy City Kit Suburban (Patient Homes)
echo -e "${YELLOW}Copying City Kit Suburban (Patient Homes)...${NC}"
if [ -d "$FREE_ASSETS_DIR/kenney_city-kit-suburban_20/Models/GLB format" ]; then
    cp "$FREE_ASSETS_DIR/kenney_city-kit-suburban_20/Models/GLB format/"*.glb "$PUBLIC_DIR/kenney_city-kit-suburban_20/"
    cp -r "$FREE_ASSETS_DIR/kenney_city-kit-suburban_20/Models/GLB format/Textures" "$PUBLIC_DIR/kenney_city-kit-suburban_20/" 2>/dev/null || true
    echo -e "${GREEN}✓ City Kit Suburban copied${NC}"
else
    echo -e "${RED}✗ City Kit Suburban not found${NC}"
fi
echo ""

# Copy CyberCity (Medical Centers)
echo -e "${YELLOW}Copying CyberCity (Medical Centers)...${NC}"
if [ -d "$FREE_ASSETS_DIR/cybercity/FBX" ]; then
    cp -r "$FREE_ASSETS_DIR/cybercity/FBX/"* "$PUBLIC_DIR/cybercity/"
    cp -r "$FREE_ASSETS_DIR/cybercity/Textures" "$PUBLIC_DIR/cybercity/" 2>/dev/null || true
    echo -e "${GREEN}✓ CyberCity copied${NC}"
else
    echo -e "${RED}✗ CyberCity not found${NC}"
fi
echo ""

# Copy Blocky Characters (Patients & Doctors)
echo -e "${YELLOW}Copying Blocky Characters...${NC}"
if [ -d "$FREE_ASSETS_DIR/kenney_blocky-characters_20/Models" ]; then
    cp -r "$FREE_ASSETS_DIR/kenney_blocky-characters_20/Models/"* "$PUBLIC_DIR/kenney_blocky-characters_20/"
    echo -e "${GREEN}✓ Blocky Characters copied${NC}"
else
    echo -e "${RED}✗ Blocky Characters not found${NC}"
fi
echo ""

# Copy UI Pack (Dashboard UI)
echo -e "${YELLOW}Copying UI Pack...${NC}"
if [ -d "$FREE_ASSETS_DIR/kenney_ui-pack-space-expansion/PNG" ]; then
    cp -r "$FREE_ASSETS_DIR/kenney_ui-pack-space-expansion/PNG" "$PUBLIC_DIR/kenney_ui-pack-space-expansion/"
    cp -r "$FREE_ASSETS_DIR/kenney_ui-pack-space-expansion/Font" "$PUBLIC_DIR/kenney_ui-pack-space-expansion/" 2>/dev/null || true
    echo -e "${GREEN}✓ UI Pack copied${NC}"
else
    echo -e "${RED}✗ UI Pack not found${NC}"
fi
echo ""

# Count copied files
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Asset Copy Complete!${NC}"
echo ""
echo "Copied files:"
echo "  • City Kit Suburban: $(find "$PUBLIC_DIR/kenney_city-kit-suburban_20" -name '*.glb' 2>/dev/null | wc -l) models"
echo "  • CyberCity: $(find "$PUBLIC_DIR/cybercity" -name '*.fbx' 2>/dev/null | wc -l) models"
echo "  • Blocky Characters: $(find "$PUBLIC_DIR/kenney_blocky-characters_20" -name '*.glb' 2>/dev/null | wc -l) models"
echo "  • UI Pack: $(find "$PUBLIC_DIR/kenney_ui-pack-space-expansion" -name '*.png' 2>/dev/null | wc -l) images"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Run 'npm run dev' in the frontend directory"
echo "  2. Open http://localhost:3000"
echo "  3. Start the simulation!"

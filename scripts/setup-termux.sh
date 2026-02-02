#!/bin/bash

# Android Swarm Setup Script for Termux
# Run this script to set up the environment

set -e

echo "Android Swarm - Termux Setup"
echo "=============================="
echo ""

# Check if running in Termux
if [ ! -d "/data/data/com.termux" ]; then
    echo "Warning: This script is designed for Termux environment"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    echo "Install Node.js 22+ using: pkg install nodejs"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    echo "Error: Node.js version 22 or higher is required"
    echo "Current version: $(node -v)"
    exit 1
fi

echo "✓ Node.js $(node -v) detected"

# Check for API key
if [ -z "$KIMI_API_KEY" ]; then
    echo ""
    echo "Warning: KIMI_API_KEY environment variable is not set"
    echo "Please set it before running the agent:"
    echo "  export KIMI_API_KEY=\"sk-...\""
    echo ""
else
    echo "✓ KIMI_API_KEY is set"
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

echo "✓ Dependencies installed"

# Build project
echo ""
echo "Building project..."
npm run build

echo "✓ Build complete"

# Create directories
echo ""
echo "Creating directories..."
mkdir -p ~/.openclaw/workspace/android-swarm
mkdir -p ~/.openclaw/logs

echo "✓ Directories created"

# Check disk space
FREE_SPACE=$(df -m ~ | tail -1 | awk '{print $4}')
echo ""
echo "Free disk space: ${FREE_SPACE}MB"

if [ "$FREE_SPACE" -lt 100 ]; then
    echo "Warning: Less than 100MB free space available"
    echo "Please free up some space before running tasks"
fi

# Setup complete
echo ""
echo "=============================="
echo "Setup Complete!"
echo ""
echo "Next steps:"
echo "1. Set KIMI_API_KEY if not already set:"
echo "     export KIMI_API_KEY=\"sk-...\""
echo ""
echo "2. Run a task:"
echo "     node dist/index.js agent --message 'build app: {...}'"
echo ""
echo "3. See examples/:"
echo "     cat examples/simple-todo.json"
echo ""
echo "For help:"
echo "     node dist/index.js help"
echo ""

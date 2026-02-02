#!/bin/bash

# Environment Check Script
# Verifies all requirements are met

echo "Android Swarm - Environment Check"
echo "=================================="
echo ""

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    
    if [ "$NODE_MAJOR" -ge 22 ]; then
        echo "✓ Node.js $NODE_VERSION (OK)"
    else
        echo "✗ Node.js $NODE_VERSION (requires v22+)"
    fi
else
    echo "✗ Node.js not installed"
fi

# Check npm
if command -v npm &> /dev/null; then
    echo "✓ npm $(npm -v) (OK)"
else
    echo "✗ npm not installed"
fi

# Check API key
if [ -z "$KIMI_API_KEY" ]; then
    echo "✗ KIMI_API_KEY not set"
else
    echo "✓ KIMI_API_KEY is set"
fi

# Check directories
if [ -d "~/.openclaw" ]; then
    echo "✓ ~/.openclaw directory exists"
else
    echo "✗ ~/.openclaw directory missing"
fi

# Check disk space
FREE_SPACE=$(df -m ~ | tail -1 | awk '{print $4}')
echo "✓ Free disk space: ${FREE_SPACE}MB"

if [ "$FREE_SPACE" -lt 100 ]; then
    echo "  Warning: Less than 100MB free"
fi

# Check memory
if [ -f "/proc/meminfo" ]; then
    TOTAL_MEM=$(grep MemTotal /proc/meminfo | awk '{print int($2/1024)}')MB
    FREE_MEM=$(grep MemAvailable /proc/meminfo | awk '{print int($2/1024)}')MB
    echo "✓ Memory: $TOTAL_MEM total, $FREE_MEM available"
fi

# Check CPU
if [ -f "/proc/cpuinfo" ]; then
    CPU_ARCH=$(grep -m1 "model name" /proc/cpuinfo | cut -d':' -f2 | xargs)
    if [ -z "$CPU_ARCH" ]; then
        CPU_ARCH=$(uname -m)
    fi
    echo "✓ CPU: $CPU_ARCH"
fi

# Check build
if [ -d "dist" ]; then
    echo "✓ Project built (dist/ exists)"
else
    echo "✗ Project not built (run: npm run build)"
fi

# Check dependencies
if [ -d "node_modules" ]; then
    echo "✓ Dependencies installed"
else
    echo "✗ Dependencies not installed (run: npm install)"
fi

echo ""
echo "=================================="

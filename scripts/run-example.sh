#!/bin/bash

# Run Example Task Script
# Usage: ./scripts/run-example.sh <example-name>

set -e

if [ -z "$1" ]; then
    echo "Usage: ./scripts/run-example.sh <example-name>"
    echo ""
    echo "Available examples:"
    echo "  simple-todo"
    echo "  ecommerce-app"
    echo "  weather-app"
    exit 1
fi

EXAMPLE_FILE="examples/$1.json"

if [ ! -f "$EXAMPLE_FILE" ]; then
    echo "Error: Example file not found: $EXAMPLE_FILE"
    exit 1
fi

if [ -z "$KIMI_API_KEY" ]; then
    echo "Error: KIMI_API_KEY environment variable is not set"
    echo "Set it with: export KIMI_API_KEY=\"sk-...\""
    exit 1
fi

echo "Running example: $1"
echo ""

SPEC=$(cat "$EXAMPLE_FILE")

node dist/index.js agent --message "build app: $SPEC"

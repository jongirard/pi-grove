#!/usr/bin/env bash
set -euo pipefail

echo "Building Grove..."

echo "  Building extension..."
tsc -p extension/tsconfig.json

echo "  Building dashboard..."
cd dashboard && bun run build && cd ..

echo "Build complete."

#!/bin/bash

echo "Starting League Arena Tracker..."
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Navigate to arena-tracker directory
cd "$SCRIPT_DIR/arena-tracker"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "Error: Failed to install dependencies"
        exit 1
    fi
fi

# Start the development server
echo "Starting development server..."
npm run dev

# Check if the command failed
if [ $? -ne 0 ]; then
    echo
    echo "Error: Failed to start the application"
    exit 1
fi
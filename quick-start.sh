#!/bin/bash

echo "🚀 Affinity Pipeline Visualization - Quick Start"
echo "================================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "Please install Node.js first:"
    echo "  - macOS: brew install node"
    echo "  - Windows: Download from https://nodejs.org/"
    echo "  - Linux: sudo apt install nodejs npm"
    echo ""
    echo "See SETUP.md for detailed instructions."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    echo "Please install npm or reinstall Node.js."
    exit 1
fi

echo "✅ Node.js and npm are installed"
echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp env.example .env
    echo "⚠️  Please edit .env file and add your Affinity API key"
    echo "   Get your API key from: https://support.affinity.co/hc/en-us/articles/360032633992-How-to-obtain-your-API-Key"
    echo ""
    read -p "Press Enter after you've added your API key to .env file..."
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Start the application
echo ""
echo "🌐 Starting the application..."
echo "The application will be available at: http://localhost:3000"
echo "Press Ctrl+C to stop the server"
echo ""

npm start 
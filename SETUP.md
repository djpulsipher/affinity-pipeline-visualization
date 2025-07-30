# Setup Guide for Affinity Pipeline Visualization

## Prerequisites Installation

### Installing Node.js

#### Option 1: Using Homebrew (Recommended for macOS)
```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node
```

#### Option 2: Direct Download
1. Visit [nodejs.org](https://nodejs.org/)
2. Download the LTS version for your operating system
3. Run the installer and follow the instructions

#### Option 3: Using Node Version Manager (nvm)
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart your terminal or run:
source ~/.bashrc  # or source ~/.zshrc

# Install Node.js
nvm install --lts
nvm use --lts
```

### Verify Installation
```bash
node --version
npm --version
```

Both commands should return version numbers if installation was successful.

## Application Setup

Once Node.js is installed, follow these steps:

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp env.example .env
   ```
   
   Edit the `.env` file and add your Affinity API key:
   ```
   AFFINITY_API_KEY=your_actual_api_key_here
   PORT=3000
   ```

3. **Start the Application**
   ```bash
   npm start
   ```

4. **Access the Application**
   Open your browser and navigate to `http://localhost:3000`

## Getting Your Affinity API Key

1. Log into your Affinity account
2. Go to Settings (gear icon in the left sidebar)
3. Navigate to the API section
4. Generate a new API key
5. Copy the key and add it to your `.env` file

For detailed instructions, visit: [How to obtain your API Key](https://support.affinity.co/hc/en-us/articles/360032633992-How-to-obtain-your-API-Key)

## Troubleshooting

### "Command not found: npm"
- Make sure Node.js is properly installed
- Try restarting your terminal
- On macOS, you might need to add npm to your PATH

### "Permission denied" errors
- On macOS/Linux, you might need to use `sudo` for global installations
- Consider using nvm to avoid permission issues

### Port already in use
- Change the PORT in your `.env` file to another number (e.g., 3001)
- Or kill the process using the current port

## Alternative: Using Docker

If you prefer using Docker:

1. **Install Docker Desktop** from [docker.com](https://www.docker.com/products/docker-desktop)

2. **Create a Dockerfile** (if not already present):
   ```dockerfile
   FROM node:16-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm install
   COPY . .
   EXPOSE 3000
   CMD ["npm", "start"]
   ```

3. **Build and run**:
   ```bash
   docker build -t affinity-pipeline .
   docker run -p 3000:3000 --env-file .env affinity-pipeline
   ```

## Development Mode

For development with auto-restart:
```bash
npm run dev
```

This requires nodemon to be installed globally:
```bash
npm install -g nodemon
``` 
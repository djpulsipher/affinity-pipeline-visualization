# Deployment Guide

This guide covers multiple options for hosting your Affinity Pipeline Visualization.

## 🌐 Vercel (Serverless)

1. Install the Vercel CLI: `npm install -g vercel`
2. Run `vercel` from the project root and follow the prompts
3. In the Vercel dashboard, add the `AFFINITY_API_KEY` environment variable
4. Redeploy to apply the variable

## 🚀 Quick Start - Railway (Recommended)

### Step 1: Prepare Your Repository
```bash
# Make sure your code is in a Git repository
git init
git add .
git commit -m "Initial commit"
```

### Step 2: Deploy to Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize and deploy
railway init
railway up
```

### Step 3: Configure Environment Variables
1. Go to your Railway dashboard
2. Add environment variable: `AFFINITY_API_KEY=your_api_key_here`
3. Your app will be available at the provided URL

## ☁️ Alternative: Render

### Step 1: Create render.yaml
```yaml
services:
  - type: web
    name: affinity-pipeline
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: AFFINITY_API_KEY
        sync: false
```

### Step 2: Deploy
1. Connect your GitHub repository to Render
2. Render will automatically detect and deploy your app
3. Add your `AFFINITY_API_KEY` in the environment variables

## 🏠 Local Network Hosting

### For Quick Team Access
```bash
# Start the server
npm start

# Find your IP address
ifconfig | grep "inet " | grep -v 127.0.0.1

# Share the URL with your team
# Example: http://192.168.1.100:3000
```

### Make it Accessible from Internet (Advanced)
```bash
# Install ngrok
npm install -g ngrok

# Start your app
npm start

# In another terminal, create tunnel
ngrok http 3000

# Share the ngrok URL with your team
# Example: https://abc123.ngrok.io
```

## 🐳 Docker Deployment

### Build and Run Locally
```bash
# Build the Docker image
docker build -t affinity-pipeline .

# Run the container
docker run -p 3000:3000 -e AFFINITY_API_KEY=your_key affinity-pipeline
```

### Deploy to Cloud Platform
```bash
# Tag for your registry
docker tag affinity-pipeline your-registry/affinity-pipeline

# Push to registry
docker push your-registry/affinity-pipeline

# Deploy to your cloud platform
```

## 🖥️ VPS Deployment

### Step 1: Set Up Your Server
```bash
# SSH into your server
ssh user@your-server.com

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
npm install -g pm2
```

### Step 2: Deploy Your App
```bash
# Clone your repository
git clone https://github.com/your-username/your-repo.git
cd your-repo

# Install dependencies
npm install

# Set environment variables
export AFFINITY_API_KEY=your_api_key_here

# Start with PM2
pm2 start server.js --name "affinity-pipeline"
pm2 startup
pm2 save
```

### Step 3: Set Up Nginx (Optional)
```bash
# Install Nginx
sudo apt-get install nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/affinity-pipeline
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/affinity-pipeline /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 🔐 Security Considerations

### Environment Variables
- Never commit API keys to your repository
- Use environment variables for sensitive data
- Consider using a secrets management service

### HTTPS
- Most cloud platforms provide HTTPS automatically
- For self-hosted solutions, use Let's Encrypt for free SSL certificates

### Access Control
- Consider adding basic authentication for sensitive data
- Use VPN or IP whitelisting for additional security

## 📊 Performance Optimization

### For Production
```bash
# Use PM2 for process management
npm install -g pm2
pm2 start server.js --name "affinity-pipeline"

# Enable clustering
pm2 start server.js -i max --name "affinity-pipeline"

# Monitor your app
pm2 monit
```

### Environment Variables for Production
```bash
# Set production environment
export NODE_ENV=production
export PORT=3000
export AFFINITY_API_KEY=your_api_key_here
```

## 🔄 Continuous Deployment

### GitHub Actions (Railway/Render)
```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Railway
        uses: railway/deploy@v1
        with:
          service: your-service-name
```

## 📞 Support

### Common Issues
1. **Port already in use**: Change the port in `server.js` or kill the existing process
2. **API key not working**: Check environment variables are set correctly
3. **CORS issues**: The app includes CORS middleware, but check your browser console

### Monitoring
- Use your platform's built-in monitoring
- Set up alerts for downtime
- Monitor API rate limits

## 🎯 Recommended Approach for Teams

1. **Start with Railway/Render** for quick deployment
2. **Use environment variables** for API keys
3. **Set up monitoring** to track usage
4. **Consider VPS** if you need more control or have high usage

This setup will give your team easy browser access to the pipeline visualization! 
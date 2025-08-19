# Vercel Deployment Guide

## ✅ What's Been Done

1. **Created `vercel-deployment` branch** - Safe deployment without affecting main
2. **Moved static files to root** - `index.html`, `app.js`, `styles.css` are now at project root (Vercel requirement)
3. **Created API endpoints** - Serverless functions for Vercel:
   - `/api/lists.js` - Fetches Affinity lists
   - `/api/lists/[id]/fields.js` - Fetches fields for a specific list
   - `/api/pipeline-data.js` - Fetches pipeline data with field values
4. **Removed client-side API key handling** - API key will be stored securely on Vercel
5. **Added `vercel.json`** - Configuration for proper routing
6. **Pushed to GitHub** - Ready for Vercel deployment

## 🚀 Next Steps to Deploy

### 1. Create Vercel Project
1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New..." → "Project"
3. Import your GitHub repository: `djpulsipher/affinity-pipeline-visualization`
4. Select the `vercel-deployment` branch
5. **Build settings**: Leave empty (no build command needed)
6. Click "Deploy" (it will fail initially until you add the API key)

### 2. Add Environment Variable
1. In your Vercel project dashboard, go to "Settings" → "Environment Variables"
2. Add new variable:
   - **Name**: `AFFINITY_API_KEY`
   - **Value**: Your Affinity API key
   - **Environment**: Production (and Preview if you want)
3. Click "Save"
4. Go back to "Deployments" and click "Redeploy"

### 3. Test Your Deployment
1. Visit your Vercel URL (something like `https://pipeline-yourname.vercel.app`)
2. Test the API directly: `https://your-url.vercel.app/api/lists`
3. Your app should load and be able to fetch data from Affinity

## 🔧 Troubleshooting

- **404 for API endpoints**: Make sure you're on the `vercel-deployment` branch
- **"Missing AFFINITY_API_KEY"**: Add the environment variable and redeploy
- **CORS issues**: Won't happen since frontend and API are on same domain
- **Static files not loading**: Files are now at root level, should work

## 📁 Current File Structure
```
/
├── index.html          ← Main HTML file
├── app.js              ← Main JavaScript
├── styles.css          ← Styles
├── vercel.json         ← Vercel configuration
├── api/
│   ├── lists.js        ← Lists endpoint
│   ├── pipeline-data.js ← Pipeline data endpoint
│   └── lists/
│       └── [id]/
│           └── fields.js ← Fields endpoint
└── ... (other files)
```

## 🔄 After Successful Deployment

1. **Test everything works** on the Vercel URL
2. **Merge to main**: If everything works, merge `vercel-deployment` into `main`
3. **Delete branch**: Clean up the deployment branch
4. **Optional**: Add custom domain in Vercel settings

## 🎯 What You'll Have

- **Live URL**: `https://pipeline-yourname.vercel.app`
- **Secure API key**: Stored on Vercel, never exposed to browser
- **Fast static hosting**: Global CDN for your HTML/CSS/JS
- **Serverless API**: Your `/api/*` endpoints handle Affinity calls
- **No server management**: Vercel handles everything

Your app will be live and accessible to your team! 🎉

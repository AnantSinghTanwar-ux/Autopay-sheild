# 🌐 Deployment Guide

## Deployment Options

### Option 1: Heroku (Simplest for Hackathon)

#### Backend Deployment

1. **Install Heroku CLI**
```bash
# Windows
choco install heroku-cli

# Mac
brew tap heroku/brew && brew install heroku

# Linux
snap install --classic heroku
```

2. **Login to Heroku**
```bash
heroku login
```

3. **Create Procfile** (`backend/Procfile`)
```
web: node server.js
```

4. **Create Heroku App**
```bash
cd backend
heroku create autopay-shield-backend
```

5. **Set Environment Variables**
```bash
heroku config:set JWT_SECRET=your_super_secret_key_here
heroku config:set MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/autopay-shield
```

6. **Deploy**
```bash
git push heroku main
```

7. **View Logs**
```bash
heroku logs --tail
```

#### Frontend Deployment (Vercel)

1. **Install Vercel CLI**
```bash
npm install -g vercel
```

2. **Deploy**
```bash
cd frontend
vercel
```

3. **Update API URL** in `frontend/vite.config.js`:
```javascript
server: {
  proxy: {
    '/api': {
      target: 'https://your-backend-url.herokuapp.com',
      changeOrigin: true,
    }
  }
}
```

4. **Rebuild and deploy**
```bash
vercel --prod
```

---

### Option 2: Railway (Better than Heroku)

#### Backend on Railway

1. **Connect Repository**
   - Go to [railway.app](https://railway.app)
   - Click "New Project"
   - Connect GitHub
   - Select repository

2. **Add Variables**
```
MONGODB_URI
JWT_SECRET
WEATHER_API_KEY
NODE_ENV=production
```

3. **Railway auto-deploys** on every push to main

4. **Get Public URL** from Railway dashboard

#### Frontend on Railway

Similar process, Railway auto-detects Vite and builds

---

### Option 3: AWS (For Production Scale)

**Services needed:**
- EC2: Backend server
- S3: Frontend hosting
- RDS: MongoDB (or DocumentDB)
- CloudFront: CDN

This is overkill for hackathon, but [see AWS docs](https://aws.amazon.com/getting-started/hands-on/deploy-webapp/)

---

## Docker Deployment

### Dockerfile for Backend

Create `backend/Dockerfile`:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
```

### Dockerfile for Frontend

Create `frontend/Dockerfile`:
```dockerfile
FROM node:18-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Docker Compose

Create `docker-compose.yml` in root:
```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_DATABASE: autopay-shield
    volumes:
      - mongodb_data:/data/db

  backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      MONGODB_URI: mongodb://mongodb:27017/autopay-shield
      JWT_SECRET: your_secret_key
      NODE_ENV: production
    depends_on:
      - mongodb

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  mongodb_data:
```

**Run:**
```bash
docker-compose up -d
```

---

## Vercel Deployment (Frontend Only)

### Using Git Integration

1. **Push to GitHub**
```bash
git push origin main
```

2. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import GitHub repo
   - Select `frontend` directory
   - Add environment variables:
     ```
     VITE_API_URL=https://your-backend-api.herokuapp.com
     ```

3. **Auto-deploys** on every push!

### Using Vercel CLI

```bash
cd frontend
vercel --prod
```

---

## MongoDB Atlas Setup

1. **Create Account**
   - Go to [mongodb.com/cloud](https://www.mongodb.com/cloud)
   - Sign up free

2. **Create Cluster**
   - Click "Build a Cluster"
   - Choose free tier
   - Select region (closest to your users)
   - Wait for creation (3-5 min)

3. **Add IP Whitelist**
   - Click "Network Access"
   - Click "Add IP Address"
   - Add `0.0.0.0/0` for anywhere (or your IP only for security)

4. **Get Connection String**
   - Click "Clusters"
   - Click "Connect"
   - Choose "Drivers"
   - Copy the connection string
   - Replace username and password

5. **Update .env**
```
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/autopay-shield?retryWrites=true&w=majority
```

---

## Environment Variables Checklist

### Production Backend (.env)
```
# Database
MONGODB_URI=mongodb+srv://...

# Auth
JWT_SECRET=long_random_string_at_least_32_chars

# APIs (if using real ones)
WEATHER_API_KEY=your_openweather_key
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret

# Misc
PORT=5000
NODE_ENV=production
```

### Frontend Environment
```
# In vite.config.js or .env.production
VITE_API_URL=https://your-backend-domain.com
```

---

## Pre-Deployment Checklist

### Backend
- [ ] All dependencies in package.json
- [ ] .env.example file provided with all keys
- [ ] Database models tested with real data
- [ ] API routes documented
- [ ] Error handling implemented
- [ ] Logging added (console.log key events)
- [ ] Rate limiting added
- [ ] CORS configured for production URLs

### Frontend
- [ ] All dependencies in package.json
- [ ] API endpoints updated for production
- [ ] Build tested (`npm run build`)
- [ ] No hardcoded URLs (use env vars)
- [ ] Error boundaries added
- [ ] Loading states handled
- [ ] Mobile responsive tested

---

## Post-Deployment

### Monitor Backend
```bash
# Heroku
heroku logs --tail

# Railway
railway logs

# Docker
docker logs container_name
```

### Monitor Frontend
- Vercel dashboard shows deployment status
- Check browser console for errors

### Database Monitoring
- MongoDB Atlas dashboard
- Check connection stats
- Monitor storage usage

---

## Troubleshooting Deployments

### Backend Won't Start
```bash
# Check logs
heroku logs --tail

# Likely issues:
# 1. Missing environment variables
# 2. MongoDB connection string wrong
# 3. Port listening wrong
```

### Frontend Won't Build
```bash
# Check build logs
vercel logs

# Likely issues:
# 1. Missing dependencies
# 2. TypeScript errors (if using TS)
# 3. Component import issues
```

### API Connection Failed
- Verify backend URL in frontend config
- Check CORS settings in backend
- Ensure backend is running
- Check network tab in DevTools

---

## Performance Optimization for Production

### Backend

1. **Enable Compression**
```javascript
const compression = require('compression');
app.use(compression());
```

2. **Database Connection Pooling**
```javascript
mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  minPoolSize: 5
});
```

3. **Caching**
```javascript
const redis = require('redis');
const cache = redis.createClient();
```

### Frontend

1. **Build Analysis**
```bash
npm install --save-dev vite-plugin-visualizer
```

2. **Code Splitting**
```javascript
import { lazy } from 'react';
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
```

3. **Image Optimization**
- Use WebP format
- Lazy load images
- Use responsive images

---

## SSL/HTTPS Setup

### For Free SSL

1. **Heroku**: Auto SSL for `*.herokuapp.com`
2. **Vercel**: Auto SSL for custom domains
3. **Railway**: Auto SSL
4. **Custom Domain**: Use Cloudflare (free)

```
Step 1: Buy domain (namecheap, godaddy, etc.)
Step 2: Add nameservers to Cloudflare
Step 3: Add CNAME record to Cloudflare pointing to your app
Step 4: Cloudflare auto-provisions SSL
```

---

## Final Checklist Before Hackathon Submission

✅ Backend deployed and running  
✅ Frontend deployed and accessible  
✅ Database connected and populated  
✅ All APIs functional  
✅ Registration and login working  
✅ Dashboard displaying data  
✅ Claims system operational  
✅ Admin dashboard accessible  
✅ No console errors in browser  
✅ Mobile responsive tested  
✅ README explaining how to run locally  
✅ .env.example provided (without secrets)  
✅ Built with production mindset  

---

## Quick Deploy Summary

**Fastest Deploy Path (Heroku + Vercel):**

```bash
# 1. Backend to Heroku
cd backend
heroku create your-app-name
heroku config:set JWT_SECRET=xxx MONGODB_URI=xxx
git push heroku main

# 2. Frontend to Vercel
cd frontend
vercel --prod

# 3. Update frontend API URL
# Edit vite.config.js to point to Heroku backend

# 4. Redeploy frontend
vercel --prod

# Done! 🎉
```

**Total Time: ~10-15 minutes**

---

**Your app is now live! 🚀**

# 🚀 Quick Start Guide

## 60-Second Setup

### 1️⃣ Prerequisites
```bash
Node.js 18+
MongoDB running locally OR MongoDB Atlas account
```

### 2️⃣ Clone & Navigate
```bash
cd autopay-shield
```

### 3️⃣ Backend (Terminal 1)
```bash
cd backend
npm install
cp .env.example .env
# Edit .env if needed (default MongoDB URI: localhost:27017)
npm run dev
```

✅ You should see:
```
✓ MongoDB connected
🚀 AutoPay Shield Backend running on http://localhost:5000
```

### 4️⃣ Frontend (Terminal 2)
```bash
cd frontend
npm install
npm run dev
```

✅ You should see:
```
➜  Local:   http://localhost:5173/
```

### 5️⃣ Open Browser
```
http://localhost:5173
```

### 6️⃣ Demo Login (pre-filled)
```
Email: worker@example.com
Password: password123
```

---

## What to Try First

### 🔵 Worker Flow:
1. Login with demo credentials
2. Click "Create Weekly Plan"
3. See insurance premium and risk breakdown
4. Go to "Claim History" (empty at first)
5. Go to "Income DNA" to see your earning patterns

### 🔵 Admin Flow:
1. Change URL to `http://localhost:5173/admin`
2. View claim statistics
3. See fraud alerts
4. Monitor system health

---

## Testing Claims (API Testing)

### Option A: Using Postman/Insomnia

1. **Register a User:**
   ```bash
   POST http://localhost:5000/api/auth/register
   
   Body (JSON):
   {
     "name": "Test Worker",
     "email": "test@example.com",
     "password": "test123",
     "city": "Mumbai",
     "workingZones": ["Zone A", "Zone B"],
     "workingHours": { "start": 9, "end": 22 }
   }
   ```

2. **Copy the token from response**

3. **Create a Policy:**
   ```bash
   POST http://localhost:5000/api/policy/create
   
   Headers:
   Authorization: Bearer <token>
   ```

4. **Trigger a Test Claim:**
   ```bash
   POST http://localhost:5000/api/claim/test-trigger
   
   Headers:
   Authorization: Bearer <token>
   
   Body (JSON):
   {
     "triggerType": "rain",
     "triggerValue": 8
   }
   ```

5. **View Claim History:**
   ```bash
   GET http://localhost:5000/api/claim/history
   
   Headers:
   Authorization: Bearer <token>
   ```

### Option B: Using cURL

```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Worker",
    "email": "test@example.com",
    "password": "test123",
    "city": "Mumbai",
    "workingZones": ["Zone A"],
    "workingHours": {"start": 9, "end": 22}
  }'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123"
  }'
```

---

## Troubleshooting

### ❌ MongoDB Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution:** 
- Ensure MongoDB is running locally: `mongod`
- OR update .env with MongoDB Atlas URI

### ❌ Port 5000 Already in Use
```
Error: listen EADDRINUSE :::5000
```
**Solution:**
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :5000
kill -9 <PID>
```

### ❌ Port 5173 Already in Use
**Solution:**
```bash
npm run dev -- --port 5174
```

### ❌ Frontend Can't Connect to Backend
```
CORS error or 404 errors
```
**Solution:**
- Check both servers are running
- Backend on http://localhost:5000
- Frontend on http://localhost:5173
- Make sure vite.config.js proxy is correctly set

---

## MongoDB Setup (if not installed)

### Option 1: Local MongoDB
```bash
# Windows
winget install MongoDB.Server

# Mac
brew install mongodb-community

# Linux
sudo apt-get install mongodb
```

Then start:
```bash
# Windows
"C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe"

# Mac
brew services start mongodb-community

# Linux
sudo systemctl start mongod
```

### Option 2: MongoDB Atlas (Cloud)
1. Go to [mongodb.com/cloud](https://www.mongodb.com/cloud)
2. Create free account
3. Create cluster
4. Get connection string
5. Update .env:
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/autopay-shield
   ```

---

## File Structure Explanation

### Backend Key Files:

| File | Purpose |
|------|---------|
| `server.js` | Express app entry point |
| `models/*.js` | MongoDB schemas |
| `controllers/*` | Request handlers |
| `services/*` | Business logic (claims, fraud) |
| `middleware/auth.js` | JWT verification |
| `routes/index.js` | All API routes |

### Frontend Key Files:

| File | Purpose |
|------|---------|
| `App.jsx` | Main app with routing |
| `pages/*.jsx` | Page components |
| `context/AuthContext.jsx` | Auth state management |
| `services/api.js` | API call wrappers |
| `components/Common.jsx` | Shared UI components |

---

## Environment Variables Explained

### Backend (.env)
```
MONGODB_URI          - MongoDB connection string
JWT_SECRET           - Secret key for JWT signing (make it strong!)
WEATHER_API_KEY      - OpenWeather API key (optional, we mock it)
PORT                 - Backend server port (default: 5000)
NODE_ENV             - environment (development/production)
```

### Frontend
Frontend reads API from vite proxy (see vite.config.js)
```
/api → http://localhost:5000
```

---

## Common Tasks

### Add a New API Endpoint

1. **Create Controller** (backend/src/controllers/newController.js)
2. **Add Route** (backend/src/routes/index.js)
3. **Create API Wrapper** (frontend/src/services/api.js)
4. **Use in Component** (frontend/src/pages/YourPage.jsx)

### Modify Database Schema

1. Update Model (backend/src/models/User.js)
2. Existing data is NOT auto-migrated (clean DB or update manually)
3. Restart backend

### Add New UI Component

1. Create in `frontend/src/components/NewComponent.jsx`
2. Import and use in pages
3. Style with Tailwind classes

---

## Performance Tips

- 🚀 Frontend auto-rebuilds on file change (hot reload)
- 🔄 Backend requires manual restart on code change
- 💾 MongoDB indexes are auto-created by Mongoose
- ⚡ API responses are cached in localStorage (auth context)

---

## Next Steps After Setup

✅ Register a worker account  
✅ Create a weekly insurance policy  
✅ Understand the risk breakdown  
✅ Test claim triggering via API  
✅ Check admin dashboard  
✅ Review the fraud detection flow  
✅ Explore the code structure  

---

**Ready to build? Let's go! 🚀**

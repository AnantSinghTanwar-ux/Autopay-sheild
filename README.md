# 🛡️ AutoPay Shield - AI-Powered Parametric Insurance for Gig Workers

## Project Overview

AutoPay Shield is a **zero-manual-claims parametric insurance platform** designed to protect delivery workers (Zomato/Swiggy) from **income loss** caused by external disruptions like weather, pollution, demand drops, and curfews.

### Key Innovation Points:
✅ **Fully Automated Claims** - No user action required  
✅ **Income DNA** - Learns worker earning patterns for accurate loss calculation  
✅ **Parametric Triggers** - Auto-detects disruptions via APIs  
✅ **Fraud Detection Engine** - 4-layer validation system  
✅ **Pre-Loss Predictions** - Suggests actions before disruptions occur  
✅ **Weekly Subscription Model** - ₹20-₹80 per week  

---

## Tech Stack

```
Frontend:  React 18 + Vite + Tailwind CSS
Backend:   Node.js + Express + MongoDB
AI/ML:     Simple risk scoring models
APIs:      Weather, Orders (mocked), Payment (mocked)
```

---

## Features Implemented

### 1. ✅ User Onboarding
- Registration with city, working zones, working hours
- Login/authentication with JWT
- Profile management

### 2. ✅ Income DNA System
- Tracks earnings history (date, amount, hours, location)
- Calculates average earnings per hour
- Identifies peak working hours
- Used for accurate loss estimation

### 3. ✅ Weekly Pricing Engine
- Risk scoring based on 4 factors: weather, pollution, demand, location
- Dynamic premium calculation (₹20-₹80)
- Visual breakdown of why premium is calculated

### 4. ✅ Parametric Triggers
- **Rain Trigger**: Rainfall > 5mm
- **Heat Trigger**: Temperature > 40°C
- **Pollution Trigger**: AQI > 300
- **Order Drop Trigger**: Orders drop > 40%
- **Zone Restriction**: Mock curfew detection

### 5. ✅ Invisible Claim System
- Auto-trigger on disruption detection
- Automatic fraud validation
- Auto-payout if approved
- Zero user interaction

### 6. ✅ Fraud Detection Engine ("Truth Engine")
Four validation layers:
- GPS Validation: User was in affected zone
- Activity Validation: User was working during disruption
- Duplicate Check: Prevent duplicate claims
- Weather Mismatch: Verify trigger data

### 7. ✅ Pre-Loss Protection
- Predict upcoming disruptions (2-hour forecast)
- Suggest zone changes or actions
- Help workers avoid disruptions

### 8. ✅ Payout System
- Mock instant payout simulation
- Transaction ID generation
- Payment status tracking

### 9. ✅ Dashboards
**Worker Dashboard:**
- Active weekly plan
- Risk level display
- Earnings protected amount
- Claim history
- Income DNA insights

**Admin Dashboard:**
- Total claims stats
- Fraud alerts
- Approval/rejection rates
- System health monitoring

---

## Project Structure

```
autopay-shield/
├── backend/
│   ├── src/
│   │   ├── models/          # MongoDB schemas
│   │   │   ├── User.js      # User profile + Income DNA
│   │   │   ├── Policy.js    # Weekly insurance policies
│   │   │   └── Claim.js     # Claims with fraud status
│   │   ├── controllers/     # Route handlers
│   │   │   ├── authController.js
│   │   │   ├── policyController.js
│   │   │   └── claimController.js
│   │   ├── services/        # Business logic
│   │   │   ├── claimService.js         # Auto-claim & payout
│   │   │   ├── fraudDetectionEngine.js # 4-layer fraud check
│   │   │   └── weatherService.js       # Trigger detection & mocking
│   │   ├── middleware/      # Auth & error handling
│   │   │   └── auth.js
│   │   ├── routes/          # API endpoints
│   │   │   └── index.js
│   │   └── utils/           # Helpers
│   │       └── helpers.js
│   ├── server.js            # Express app entry point
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── pages/           # Route pages
│   │   │   ├── LoginPage.jsx
│   │   │   ├── RegisterPage.jsx
│   │   │   ├── WorkerDashboard.jsx
│   │   │   └── AdminDashboard.jsx
│   │   ├── components/      # Reusable components
│   │   │   └── Common.jsx   # SharedUI components
│   │   ├── services/        # API calls
│   │   │   └── api.js       # Axios config + endpoints
│   │   ├── context/         # State management
│   │   │   └── AuthContext.jsx
│   │   ├── App.jsx          # Main app with routing
│   │   ├── main.jsx         # React entry point
│   │   └── index.css        # Tailwind styles
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
│
└── README.md
```

---

## Getting Started - Quick Setup

### Prerequisites:
- Node.js 18+
- MongoDB (local or Atlas)
- npm or yarn

### Step 1: Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your MongoDB URI and JWT secret
```

**Backend .env:**
```
MONGODB_URI=mongodb://localhost:27017/autopay-shield
JWT_SECRET=your_super_secret_key_here
WEATHER_API_KEY=your_openweather_key
PORT=5000
NODE_ENV=development
```

**Start Backend:**
```bash
npm run dev
```

Expected output:
```
✓ MongoDB connected
🚀 AutoPay Shield Backend running on http://localhost:5000
```

### Step 2: Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Expected output:
```
VITE v4.3.9 ready in 123 ms
➜  Local:   http://localhost:5173/
```

---

## API Endpoints

### Authentication
```
POST   /api/auth/register          - Register new user
POST   /api/auth/login             - Login user
```

### User Management
```
GET    /api/user/profile           - Get user profile
PUT    /api/user/profile           - Update profile
POST   /api/user/log-earnings      - Log earnings for Income DNA
```

### Policies
```
POST   /api/policy/create          - Create weekly policy
GET    /api/policy/active          - Get active policy
GET    /api/policy/breakdown       - Get premium calculation breakdown
POST   /api/policy/renew           - Renew policy for next week
```

### Claims
```
POST   /api/claim/test-trigger     - Manual trigger test
GET    /api/claim/history          - Get claim history
GET    /api/claim/:claimId         - Get claim details
GET    /api/claim/check/triggers   - Check current triggers
GET    /api/claim/predict/disruptions - Get predictions
```

### Admin
```
GET    /api/admin/claims/stats     - Get overall stats
GET    /api/admin/claims/fraud-alerts - Get fraud alerts
```

---

## How to Use the Platform

### For Workers:

1. **Register** → Select city, working zones, working hours
2. **Create Weekly Plan** → Get ₹20-₹80 premium based on risk
3. **Log Earnings** → System learns your Income DNA (optional but recommended)
4. **Automatic Protection** → System monitors disruptions 24/7
5. **Auto-Claims** → When disruption occurs, claim is automatically triggered and validated
6. **Instant Payout** → If fraud checks pass, payout is processed

### For Admins:

1. Monitor claim stats (approved, rejected, pending)
2. Review fraud alerts
3. Check system health
4. Analyze approval rates

---

## Key Business Logic

### 1. Risk Scoring Algorithm
```
Risk Factors:
- Weather Risk (30% weight): rainfall, temperature
- Pollution Risk (20% weight): AQI levels
- Demand Risk (30% weight): order volume drops
- Location Risk (20% weight): zone characteristics

Premium = 20 + ((total_risk_score / 100) * 60)
Range: ₹20 - ₹80 per week
```

### 2. Income Loss Calculation
```
Expected Income = (avg_earnings_per_hour) × (disruption_duration_hours)
Actual Income = (actual_earnings_during_disruption)
Income Loss = Expected Income - Actual Income
Payout = Income Loss × 90% (leave 10% for operational costs)
```

### 3. Fraud Detection Flow
```
Claim Triggered
    ↓
Check 1: GPS Validation (was user in affected zone?)
Check 2: Activity Validation (was user working that time?)
Check 3: Duplicate Check (same trigger last 7 days?)
Check 4: Weather Mismatch (does trigger match real weather?)
    ↓
All Pass? → AUTO-PAYOUT ✓
Any Fail? → REJECT ✗
```

### 4. Parametric Trigger Logic
```
Each trigger listens to external data:

Rain Trigger:
- Monitors: Weather API
- Threshold: > 5mm rainfall
- Impact: High (60% earnings drop)

Heat Trigger:
- Monitors: Temperature data
- Threshold: > 40°C
- Impact: Medium (40% earnings drop)

Pollution Trigger:
- Monitors: AQI data
- Threshold: > 300
- Impact: Medium (35% earnings drop)

Order Drop Trigger:
- Monitors: Delivery app orders
- Threshold: > 40% drop vs baseline
- Impact: High (50% earnings drop)
```

---

## Testing the System

### Test Scenario: Trigger a Claim

1. **Register & Create Policy:**
   ```
   Visit http://localhost:5173/register
   Fill form and create account
   Create weekly policy
   ```

2. **Log Earnings (to establish Income DNA):**
   ```
   Use API directly:
   POST /api/user/log-earnings
   {
     "earnings": 1500,
     "ordersCompleted": 20,
     "hoursWorked": 5,
     "location": "Zone A"
   }
   ```

3. **Trigger a Claim:**
   ```
   Use Frontend or API:
   POST /api/claim/test-trigger
   {
     "triggerType": "rain",
     "triggerValue": 8
   }
   ```

4. **Check Results:**
   ```
   GET /api/claim/history
   Look for: claimStatus, fraudStatus, payoutAmount
   ```

---

## Code Quality & Patterns

✅ **Modular Architecture** - Separation of concerns (models, controllers, services)  
✅ **Error Handling** - Centralized middleware for errors  
✅ **JWT Authentication** - Secure token-based auth  
✅ **Async/Await** - Modern async patterns  
✅ **Comments** - Important logic explained with comments  
✅ **Reusable Components** - DRY principle in React  

---

## Deployment Readiness

To deploy to production:

1. **Backend**: Deploy to Heroku/Railway/Render
2. **Frontend**: Build and deploy to Vercel/Netlify
3. **Database**: Use MongoDB Atlas
4. **Environment**: Update .env with production URLs

```bash
# Frontend build
cd frontend
npm run build

# Output in frontend/dist/
```

---

## Future Enhancements

- 🔄 Real-time trigger monitoring with WebSockets
- 📊 Advanced ML models for risk scoring
- 🌍 Real OpenWeather API integration
- 💳 Real Razorpay payment integration
- 📱 Mobile app
- 🗺️ Live heatmap of disruptions
- 📈 Analytics and reporting
- 🔐 Advanced fraud ML models

---

## Support & Documentation

For issues or questions, check:
- Backend logs in console
- Frontend console (F12 DevTools)
- MongoDB Atlas dashboard
- API response messages

---

## License

This is a hackathon project. Feel free to use and modify!

---

**Built with ❤️ for India's Gig Workers**  
*Protecting Income. Enabling Dreams.*

---

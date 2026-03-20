# 📋 Implementation Guide & Architecture Deep Dive

## Core Architecture Principles

### 1. Event-Driven Claims
```
Disruption Detected (API/Trigger)
    ↓
Auto-Create Claim with Initial Data
    ↓
Run Fraud Detection (4-layer)
    ↓
Update Claim Status (approved/rejected)
    ↓
Auto-Payout if Approved
    ↓
User Sees Payout in History (Instant!)
```

### 2. Income DNA Engine
```
User logs earnings → System stores history
                  → Calculates avg earnings/hour
                  → Identifies peak hours
                  → Learns location productivity
                  → Used for loss estimation
```

### 3. Risk Scoring Model
```
Inputs: Location, Weather Patterns, Working Hours
        ↓
Weight Calculation: Each factor gets a % weight
                  ↓
Final Score: 0-100 (maps to ₹20-₹80 premium)
           ↓
Premium communicated with breakdown to user
```

---

## Code Structure Deep Dive

### Backend: Models (Database Schema)

#### User Model (`src/models/User.js`)
```javascript
{
  // Basic info
  name, email, password (hashed),
  phone, city,
  
  // Working profile
  workingZones: ["Zone A", "Zone B"],
  workingHours: { start: 9, end: 22 },
  
  // Income DNA (key feature!)
  earningsHistory: [
    {
      date, earnings, ordersCompleted,
      hoursWorked, location
    }
  ],
  averageEarningsPerHour: 300,
  peakHours: [12, 13, 18, 19, 20],
  
  // Risk management
  riskScore: 50,
  activePolicy: ObjectId,
  isActive: true,
  
  // Location tracking
  gpsLocation: { latitude, longitude, lastUpdated }
}
```

**Key Feature**: Income DNA stores 30-day history, automatically calculates patterns

#### Policy Model (`src/models/Policy.js`)
```javascript
{
  userId, // Reference to user
  weeklyPremium: 45,
  coverageAmount: 5000,
  
  // Risk breakdown (why premium is this much)
  riskBreakdown: {
    weatherRisk: 40,
    pollutionRisk: 50,
    demandRisk: 45,
    locationRisk: 50
  },
  
  coverageHours: { start: 9, end: 22 },
  status: 'active', // or 'expired', 'cancelled'
  
  startDate, endDate, // 7 days apart
  paymentStatus: 'paid' // or 'pending', 'failed'
}
```

**Key Feature**: New policy created every week, old ones marked 'expired'

#### Claim Model (`src/models/Claim.js`)
```javascript
{
  userId, policyId,
  
  // Trigger information
  triggerType: 'rain', // or heat, pollution, order_drop, zone_restriction
  triggerValue: 8, // actual value (mm, °C, AQI %, etc)
  
  // Time window of disruption
  timeWindow: { start: Date, end: Date },
  
  // Income calculation
  expectedIncome: 2000,
  actualIncome: 500,
  calculatedLoss: 1500,
  payoutAmount: 1350, // 90% of loss
  
  // Fraud checks
  fraudChecks: {
    gpsValidation: { status, userWasInZone },
    activityValidation: { status, userWasActive },
    duplicateCheck: { status, isDuplicate },
    weatherMismatch: { status, isValid }
  },
  
  // Status tracking
  fraudStatus: 'approved', // or 'rejected', 'under_review'
  claimStatus: 'paid', // triggered → validated → paid/rejected
  payoutId: 'PAY-1234567890',
  
  metadata: { weatherData, orderData, gpsTrail }
}
```

**Key Feature**: Complete audit trail for every claim decision

---

### Backend: Services (Business Logic)

#### Claim Service (`src/services/claimService.js`)

**Main Flow:**
```javascript
autoTriggerClaim(userId, triggerData)
  1. Get user and their active policy
  2. Check if within coverage hours
  3. Calculate income loss using Income DNA
  4. Create claim in DB
  5. Run fraud detection
  6. Auto-payout if approved
  7. Return result
```

**Key Methods:**
- `autoTriggerClaim()` - Entry point for auto-claims
- `validateClaim()` - Runs fraud detection
- `processPayout()` - Simulates payment
- `getClaimHistory()` - For dashboards
- `getClaimStats()` - For admin analytics

#### Fraud Detection Engine (`src/services/fraudDetectionEngine.js`)

**4-Layer Fraud Check:**

```
Layer 1: GPS Validation
├─ Question: Was user in affected zone?
├─ Method: Compare user.workingZones with metadata.affectedZones
└─ Result: PASS if match, FAIL if not

Layer 2: Activity Validation
├─ Question: Was user working during disruption?
├─ Method: Check earningsHistory.date falls within timeWindow
└─ Result: PASS if >0 orders, FAIL if none

Layer 3: Duplicate Check
├─ Question: Did user already claim same trigger this week?
├─ Method: Query last 7 days for same triggerType + userId + time overlap
└─ Result: PASS if unique, FAIL if duplicate

Layer 4: Weather Mismatch
├─ Question: Does reported trigger match real weather data?
├─ Method: Compare claim.triggerValue with actualWeatherValue (10% tolerance)
└─ Result: PASS if within tolerance, FAIL if mismatch
```

**Decision Logic:**
```javascript
if (all 4 layers PASS)
  → fraudStatus = 'approved'
  → AutoPayout ✓
  
else if (any 1 layer FAILS)
  → fraudStatus = 'rejected'
  → No payout
  
else if (any incomplete data)
  → fraudStatus = 'under_review'
  → Manual review needed
```

#### Weather Service (`src/services/weatherService.js`)

**Mock Data** (replace with real API):
```javascript
cityWeatherData = {
  'Mumbai': { temperature: 38, rainfall: 0, aqi: 180 },
  'Delhi': { temperature: 42, rainfall: 0, aqi: 320 },
  ...
}
```

**Trigger Detection:**
```javascript
checkTriggers(city, user)
  1. Get weather for city
  2. Check each trigger:
     - rainfall > 5mm? → rain trigger
     - temp > 40°C? → heat trigger
     - AQI > 300? → pollution trigger
     - orders dropped > 40%? → order_drop trigger
  3. Return triggered list
```

**Pre-Loss Predictions:**
```javascript
predictUpcomingDisruptions(city)
  1. Analyze weather forecast
  2. Predict next 2-4 hours
  3. Suggest zone changes or actions
  4. Estimate impact probability
  5. Return recommendations
```

---

### Frontend: State Management & Context

#### AuthContext (`src/context/AuthContext.jsx`)

```javascript
{
  user: { id, name, email, city },
  token: 'jwt_token_here',
  loading: boolean,
  
  login(token, user) - Store in localStorage + context
  logout() - Clear both
}
```

**Flow:**
```
User logs in
  → API returns token + user info
  → login() called
  → Stored in localStorage (persist across page refresh)
  → Routes check token to protect pages
```

---

### Frontend: API Layer (`src/services/api.js`)

```javascript
// Axios instance with auto-auth
const api = axios.create({
  baseURL: '/api'
})

// Interceptor: Add token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Organized by domain:
authAPI.register() / .login()
userAPI.getProfile() / .updateProfile() / .logEarnings()
policyAPI.createPolicy() / .getActivePolicy() / .getPolicyBreakdown()
claimAPI.testTrigger() / .getHistory() / .checkTriggers()
adminAPI.getClaimStats() / .getFraudAlerts()
```

---

### Frontend: Component Architecture

#### Common Components (`src/components/Common.jsx`)

```javascript
<ProtectedRoute>
  - Wraps sensitive routes
  - Redirects to login if no token

<LoadingSpinner>
  - Shows while data fetching

<StatusBadge status="approved">
  - Color-coded status display

<RiskIndicator score={50}>
  - Visual risk level with color
```

#### Page Structure

```javascript
WorkerDashboard
├─ Stats Overview (4 cards)
│  ├─ Active Plan
│  ├─ Risk Level
│  ├─ Earnings Protected
│  └─ Total Claims
├─ Tab Navigation (overview / claims / earnings)
└─ Tab Content (dynamic)

AdminDashboard
├─ Analytics Cards (5 stats)
├─ Quick Stats Card
├─ System Health Card
└─ Fraud Alerts List
```

---

## How to Extend the System

### Add a New Trigger Type

1. **Update `WeatherService`** (`backend/src/services/weatherService.js`):
```javascript
checkTriggers(city, user) {
  // Add new trigger:
  if (weather.windSpeed > 50) {
    triggers.push({
      type: 'high_wind',
      value: weather.windSpeed,
      triggered: true
    })
  }
}
```

2. **Update `Claim Model`** (`backend/src/models/Claim.js`):
```javascript
triggerType: {
  enum: ['rain', 'heat', 'pollution', 'order_drop', 'zone_restriction', 'high_wind'], // Add here
  required: true
}
```

3. **Test via API**:
```bash
POST /api/claim/test-trigger
{
  "triggerType": "high_wind",
  "triggerValue": 55
}
```

### Connect Real Weather API

1. **Install OpenWeather package**:
```bash
npm install openweathermap
```

2. **Update `weatherService.js`**:
```javascript
import axios from 'axios';

const getCurrentWeather = async (city) => {
  const response = await axios.get(
    `https://api.openweathermap.org/data/2.5/weather`,
    {
      q: city,
      appid: process.env.WEATHER_API_KEY
    }
  );
  
  return {
    temperature: response.data.main.temp,
    rainfall: response.data.rain?.['1h'] || 0,
    aqi: response.data.air_quality?.aqi || 0
  };
};
```

3. **Update .env**:
```
WEATHER_API_KEY=your_actual_key_from_openweathermap.org
```

### Connect Real Payment API (Razorpay)

1. **Install Razorpay**:
```bash
npm install razorpay
```

2. **Update `claimService.js`**:
```javascript
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

async processPayout(claim) {
  const payout = await razorpay.payouts.create({
    account_number: claim.user.accountNumber,
    amount: claim.payoutAmount * 100, // paise
    currency: 'INR',
    mode: 'NEFT',
    reference_id: claim._id.toString(),
    description: `AutoPay Shield claim payout for ${claim.triggerType}`
  });
  
  claim.payoutId = payout.id;
  await claim.save();
}
```

### Add Premium Analytics

1. **Create new controller** (`backend/src/controllers/analyticsController.js`):
```javascript
exports.getAnalytics = async (req, res) => {
  const userId = req.userId;
  const claims = await Claim.find({ userId });
  
  const totalClaimsAmount = claims
    .filter(c => c.claimStatus === 'paid')
    .reduce((sum, c) => sum + c.payoutAmount, 0);
  
  res.json({
    totalClaimsPaid: totalClaimsAmount,
    avgClaimAmount: totalClaimsAmount / claims.length,
    topTrigger: // calculate which trigger occurred most
  });
};
```

2. **Add route**:
```javascript
router.get('/user/analytics', authenticate, analyticsController.getAnalytics);
```

3. **Display in Frontend**:
```javascript
const [analytics, setAnalytics] = useState(null);

useEffect(() => {
  userAPI.getAnalytics().then(res => setAnalytics(res.data));
}, []);
```

---

## Testing Strategies

### Unit Testing (add Jest)
```bash
npm install --save-dev jest
```

### Integration Testing
Test full flow: Register → Create Policy → Trigger Claim → Check Fraud

### Load Testing
```bash
npm install --save-dev artillery
```

---

## Security Best Practices

✅ **JWT Secret**: Use strong secret (12+ random chars)  
✅ **Password Hashing**: Using bcryptjs (done)  
✅ **CORS**: Configured for localhost (update for production)  
✅ **Input Validation**: Add joi/yup validators  
✅ **Rate Limiting**: Add express-rate-limit  
✅ **API Keys**: Store in .env, never in code  

Example rate limiting:
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

app.use('/api/', limiter);
```

---

## Performance Optimization

### Database Indexes
```javascript
// In User.js
userSchema.index({ email: 1 });
userSchema.index({ city: 1 });

// In Claim.js
claimSchema.index({ userId: 1, createdAt: -1 });
```

### API Response Caching
```javascript
// Cache active policy (15 min)
const cache = require('memory-cache');

exports.getActivePolicy = async (req, res) => {
  const cacheKey = `policy-${req.userId}`;
  const cached = cache.get(cacheKey);
  
  if (cached) return res.json(cached);
  
  // ... fetch data ...
  
  cache.put(cacheKey, data, 15 * 60 * 1000);
  res.json(data);
};
```

### Frontend Lazy Loading
```javascript
import { lazy, Suspense } from 'react';

const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

// In App.jsx
<Suspense fallback={<LoadingSpinner />}>
  <Route path="/admin" element={<AdminDashboard />} />
</Suspense>
```

---

## Monitoring & Debugging

### Backend Logging
```javascript
console.log('✓ MongoDB connected');
console.log(`✗ Error: ${error.message}`);
console.log(`💰 Payout processed: ${payoutId}`);
```

### Frontend Debugging
```javascript
// Check auth state
console.log('Auth:', useAuth());

// Check API calls
axios.interceptors.response.use(
  response => {
    console.log('API Response:', response.config.url, response.data);
    return response;
  }
);
```

---

**This system is built for scale and extensibility. Start simple, add features incrementally! 🚀**

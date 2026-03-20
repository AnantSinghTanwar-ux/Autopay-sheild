// Fraud Detection Engine - "Truth Engine"

class FraudDetectionEngine {
  static toRad(value) {
    return (value * Math.PI) / 180;
  }

  static calculateDistanceKm(pointA, pointB) {
    if (!pointA || !pointB) return null;

    const R = 6371;
    const dLat = this.toRad(pointB.latitude - pointA.latitude);
    const dLon = this.toRad(pointB.longitude - pointA.longitude);
    const lat1 = this.toRad(pointA.latitude);
    const lat2 = this.toRad(pointB.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

    return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
  }

  /**
   * GPS Validation: compare registered worker GPS with disruption GPS trail
   */
  static validateGPS(userGpsLocation, _affectedZones, gpsTrail) {
    if (!userGpsLocation || !gpsTrail) {
      return {
        status: 'pending',
        userWasInZone: false,
        reason: 'Missing GPS data'
      };
    }

    const distanceKm = this.calculateDistanceKm(
      { latitude: userGpsLocation.latitude, longitude: userGpsLocation.longitude },
      { latitude: gpsTrail.latitude, longitude: gpsTrail.longitude }
    );

    const maxDistanceKm = Number(process.env.CLAIM_GPS_MATCH_RADIUS_KM || 3);
    const userWasInZone = distanceKm !== null ? distanceKm <= maxDistanceKm : false;

    return {
      status: userWasInZone ? 'passed' : 'failed',
      userWasInZone,
      distanceKm,
      reason: userWasInZone ? 'User GPS is near disruption location' : 'User location mismatch'
    };
  }
  
  /**
   * Activity Validation: Check if user was actively working during disruption
   */
  static validateActivity(timeWindow, earningsHistory) {
    if (!timeWindow || !earningsHistory) {
      return {
        status: 'pending',
        userWasActive: false,
        reason: 'Missing data'
      };
    }
    
    const activeOrders = earningsHistory.filter(entry => {
      const entryTime = new Date(entry.date).getTime();
      return entryTime >= timeWindow.start && entryTime <= timeWindow.end;
    });
    
    const userWasActive = activeOrders.length > 0;
    
    return {
      status: userWasActive ? 'passed' : 'failed',
      userWasActive,
      ordersCount: activeOrders.length,
      reason: userWasActive ? `${activeOrders.length} orders during disruption` : 'No activity during disruption'
    };
  }
  
  /**
   * Duplicate Claim Prevention: Check if claim for same trigger already exists
   */
  static checkDuplicate(userId, triggerType, timeWindow, existingClaims) {
    if (!userId || !triggerType || !existingClaims) {
      return {
        status: 'passed',
        isDuplicate: false
      };
    }
    
    const isDuplicate = existingClaims.some(claim => {
      const sameUser = claim.userId.toString() === userId.toString();
      const sameTrigger = claim.triggerType === triggerType;
      const overlappingTime = 
        claim.timeWindow.start <= timeWindow.end &&
        claim.timeWindow.end >= timeWindow.start;
      
      return sameUser && sameTrigger && overlappingTime;
    });
    
    return {
      status: isDuplicate ? 'failed' : 'passed',
      isDuplicate,
      reason: isDuplicate ? 'Duplicate claim detected' : 'No duplicate found'
    };
  }
  
  /**
   * Weather Mismatch Detection: Verify trigger data matches actual weather
   */
  static validateWeatherMismatch(claimTriggerValue, actualWeatherValue, triggerType) {
    if (!claimTriggerValue || !actualWeatherValue) {
      return {
        status: 'pending',
        isValid: true
      };
    }
    
    // Allow 10% tolerance
    const tolerance = actualWeatherValue * 0.1;
    const isValid = Math.abs(claimTriggerValue - actualWeatherValue) <= tolerance;
    
    return {
      status: isValid ? 'passed' : 'failed',
      isValid,
      claimValue: claimTriggerValue,
      actualValue: actualWeatherValue,
      reason: isValid ? 'Weather data matches' : `Weather mismatch detected for ${triggerType}`
    };
  }

  static getActualTriggerValue(claim, weatherData) {
    const mapper = {
      rain: weatherData?.rainfall,
      heat: weatherData?.temperature,
      pollution: weatherData?.aqi,
      order_drop: weatherData?.orderDropPercentage,
      zone_restriction: weatherData?.distanceKm
    };
    return mapper[claim.triggerType] || 0;
  }

  /**
   * Past history signal: repeated suspicious outcomes and bursty claim frequency
   */
  static analyzeClaimHistory(existingClaims = []) {
    if (!Array.isArray(existingClaims) || existingClaims.length === 0) {
      return {
        status: 'passed',
        reason: 'No prior claim history',
        historyMetrics: {
          totalClaims90d: 0,
          rejected90d: 0,
          underReviewOpen: 0,
          recent24h: 0
        }
      };
    }

    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;

    const totalClaims90d = existingClaims.length;
    const rejected90d = existingClaims.filter((c) => c.fraudStatus === 'rejected').length;
    const underReviewOpen = existingClaims.filter((c) => c.fraudStatus === 'under_review').length;
    const recent24h = existingClaims.filter((c) => new Date(c.createdAt).getTime() >= last24h).length;

    let status = 'passed';
    let reason = 'History pattern is stable';

    if (rejected90d >= 3 || recent24h >= 4) {
      status = 'failed';
      reason = 'High-risk historical pattern detected';
    } else if (rejected90d >= 1 || underReviewOpen >= 2 || recent24h >= 2) {
      status = 'pending';
      reason = 'Moderate historical risk, needs closer review';
    }

    return {
      status,
      reason,
      historyMetrics: {
        totalClaims90d,
        rejected90d,
        underReviewOpen,
        recent24h
      }
    };
  }
  
  /**
   * Comprehensive Fraud Assessment
   */
  static assessFraud(claim, user, existingClaims, weatherData) {
    const fraudResults = {
      gpsValidation: this.validateGPS(
        user.gpsLocation,
        claim.metadata?.affectedZones || [],
        claim.metadata?.gpsTrail
      ),
      activityValidation: this.validateActivity(
        claim.timeWindow,
        user.earningsHistory
      ),
      duplicateCheck: this.checkDuplicate(
        user._id,
        claim.triggerType,
        claim.timeWindow,
        existingClaims
      ),
      weatherMismatch: this.validateWeatherMismatch(
        claim.triggerValue,
        this.getActualTriggerValue(claim, weatherData),
        claim.triggerType
      ),
      claimHistoryPattern: this.analyzeClaimHistory(existingClaims)
    };
    
    // Overall fraud status
    const allChecksPassed = Object.values(fraudResults).every(
      check => check.status !== 'failed'
    );
    
    return {
      fraudChecks: fraudResults,
      fraudStatus: allChecksPassed ? 'approved' : 'rejected',
      riskLevel: this.calculateRiskLevel(fraudResults)
    };
  }
  
  /**
   * Calculate risk level based on fraud checks
   */
  static calculateRiskLevel(fraudResults) {
    const failedChecks = Object.values(fraudResults).filter(
      check => check.status === 'failed'
    ).length;
    
    if (failedChecks === 0) return 'low';
    if (failedChecks === 1) return 'medium';
    return 'high';
  }
}

module.exports = FraudDetectionEngine;

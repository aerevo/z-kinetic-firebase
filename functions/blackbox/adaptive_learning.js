/**
 * Z-KINETIC ADAPTIVE LEARNING ENGINE
 * User baseline management and learning
 * Migrated from: lib/cryptex_lock/src/adaptive_threshold_engine.dart
 * PART 1: Baseline CRUD Operations
 */

const _ = require('lodash');

class AdaptiveLearning {
  constructor(db) {
    this.db = db;
  }

  /**
   * Get user baseline from Firestore
   */
  async getBaseline(deviceId) {
    try {
      const doc = await this.db
        .collection('user_baselines')
        .doc(deviceId)
        .get();
      
      if (!doc.exists) {
        return this._createInitialBaseline(deviceId);
      }
      
      const data = doc.data();
      
      // Check if baseline is established (>= 10 samples)
      data.isEstablished = data.sampleCount >= 10 && data.confidenceLevel > 0.7;
      
      return data;
      
    } catch (error) {
      console.error('Get baseline error:', error);
      return this._createInitialBaseline(deviceId);
    }
  }

  /**
   * Update user baseline with new session data
   */
  async updateBaseline(deviceId, biometric) {
    try {
      const currentBaseline = await this.getBaseline(deviceId);
      
      // Extract features from current session
      const features = this._extractFeaturesForLearning(biometric);
      
      // Calculate new baseline using incremental learning
      const updatedBaseline = this._incrementalUpdate(currentBaseline, features);
      
      // Save to Firestore
      await this.db
        .collection('user_baselines')
        .doc(deviceId)
        .set(updatedBaseline, { merge: true });
      
      console.log(`Baseline updated for ${deviceId}: ${updatedBaseline.sampleCount} samples`);
      
      return updatedBaseline;
      
    } catch (error) {
      console.error('Update baseline error:', error);
      throw error;
    }
  }

  /**
   * Create initial baseline for new user
   */
  _createInitialBaseline(deviceId) {
    return {
      deviceId,
      createdAt: new Date(),
      lastUpdated: new Date(),
      
      // Statistical baselines
      avgTremorFrequency: 0,
      avgPressureVariance: 0,
      avgInteractionTime: 0,
      avgRhythmConsistency: 0,
      
      // Standard deviations
      tremorStdDev: 0,
      pressureStdDev: 0,
      timeStdDev: 0,
      rhythmStdDev: 0,
      
      // Learning metrics
      sampleCount: 0,
      confidenceLevel: 0,
      isEstablished: false
    };
  }

  /**
   * Extract features for learning
   */
  _extractFeaturesForLearning(biometric) {
    const { motion_events = [], touch_events = [], duration_ms = 0 } = biometric;
    
    return {
      tremorFrequency: this._calculateTremorFrequency(motion_events),
      pressureVariance: this._calculatePressureVariance(touch_events),
      interactionTime: duration_ms,
      rhythmConsistency: this._calculateRhythmConsistency(motion_events)
    };
  }

  /**
   * Incremental baseline update (Welford's algorithm)
   */
  _incrementalUpdate(baseline, features) {
    const newCount = baseline.sampleCount + 1;
    
    // Update averages (running mean)
    const newAvgTremor = this._updateMean(
      baseline.avgTremorFrequency,
      features.tremorFrequency,
      baseline.sampleCount
    );
    
    const newAvgPressure = this._updateMean(
      baseline.avgPressureVariance,
      features.pressureVariance,
      baseline.sampleCount
    );
    
    const newAvgTime = this._updateMean(
      baseline.avgInteractionTime,
      features.interactionTime,
      baseline.sampleCount
    );
    
    const newAvgRhythm = this._updateMean(
      baseline.avgRhythmConsistency,
      features.rhythmConsistency,
      baseline.sampleCount
    );
    
    // Update standard deviations (Welford's algorithm)
    const newTremorStdDev = this._updateStdDev(
      baseline.tremorStdDev,
      baseline.avgTremorFrequency,
      newAvgTremor,
      features.tremorFrequency,
      baseline.sampleCount
    );
    
    const newPressureStdDev = this._updateStdDev(
      baseline.pressureStdDev,
      baseline.avgPressureVariance,
      newAvgPressure,
      features.pressureVariance,
      baseline.sampleCount
    );
    
    const newTimeStdDev = this._updateStdDev(
      baseline.timeStdDev,
      baseline.avgInteractionTime,
      newAvgTime,
      features.interactionTime,
      baseline.sampleCount
    );
    
    const newRhythmStdDev = this._updateStdDev(
      baseline.rhythmStdDev,
      baseline.avgRhythmConsistency,
      newAvgRhythm,
      features.rhythmConsistency,
      baseline.sampleCount
    );
    
    // Update confidence (increases with samples, caps at 1.0)
    const newConfidence = Math.min((newCount / (newCount + 20)), 1.0);
    
    return {
      ...baseline,
      lastUpdated: new Date(),
      avgTremorFrequency: newAvgTremor,
      avgPressureVariance: newAvgPressure,
      avgInteractionTime: newAvgTime,
      avgRhythmConsistency: newAvgRhythm,
      tremorStdDev: newTremorStdDev,
      pressureStdDev: newPressureStdDev,
      timeStdDev: newTimeStdDev,
      rhythmStdDev: newRhythmStdDev,
      sampleCount: newCount,
      confidenceLevel: newConfidence,
      isEstablished: newCount >= 10 && newConfidence > 0.7
    };
  }
  /**
 * Z-KINETIC ADAPTIVE LEARNING ENGINE
 * PART 2: Statistical Calculations
 */

  /**
   * Update running mean
   */
  _updateMean(oldMean, newValue, oldCount) {
    if (oldCount === 0) return newValue;
    return oldMean + (newValue - oldMean) / (oldCount + 1);
  }

  /**
   * Update running standard deviation (Welford's algorithm)
   */
  _updateStdDev(oldStdDev, oldMean, newMean, newValue, oldCount) {
    if (oldCount === 0) return 0;
    
    const oldVariance = oldStdDev * oldStdDev;
    const oldSum = oldVariance * oldCount;
    
    const newSum = oldSum + (newValue - oldMean) * (newValue - newMean);
    const newVariance = newSum / (oldCount + 1);
    
    return Math.sqrt(newVariance);
  }

  /**
   * Calculate tremor frequency
   */
  _calculateTremorFrequency(events) {
    if (events.length < 5) return 0;
    
    let oscillations = 0;
    let lastMagnitude = events[0].m;
    let wasIncreasing = false;
    
    for (let i = 1; i < events.length; i++) {
      const current = events[i].m;
      const isIncreasing = current > lastMagnitude;
      
      if (isIncreasing !== wasIncreasing) {
        oscillations++;
      }
      
      wasIncreasing = isIncreasing;
      lastMagnitude = current;
    }
    
    const durationSeconds = (events[events.length - 1].t - events[0].t) / 1000;
    return durationSeconds > 0 ? oscillations / durationSeconds : 0;
  }

  /**
   * Calculate pressure variance
   */
  _calculatePressureVariance(events) {
    if (events.length < 2) return 0;
    
    const pressures = events.map(e => e.p);
    const mean = _.mean(pressures);
    const squaredDiffs = pressures.map(p => Math.pow(p - mean, 2));
    const variance = _.mean(squaredDiffs);
    
    return Math.sqrt(variance);
  }

  /**
   * Calculate rhythm consistency
   */
  _calculateRhythmConsistency(events) {
    if (events.length < 3) return 0;
    
    const intervals = [];
    for (let i = 1; i < events.length; i++) {
      intervals.push(events[i].t - events[i - 1].t);
    }
    
    if (intervals.length === 0) return 0;
    
    const mean = _.mean(intervals);
    const stdDev = this._standardDeviation(intervals);
    
    return mean > 0 ? stdDev / mean : 0;
  }

  /**
   * Calculate standard deviation
   */
  _standardDeviation(values) {
    if (values.length === 0) return 0;
    
    const mean = _.mean(values);
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = _.mean(squaredDiffs);
    
    return Math.sqrt(variance);
  }

  /**
   * Get adaptive thresholds for user
   */
  async getAdaptiveThresholds(deviceId) {
    const baseline = await this.getBaseline(deviceId);
    
    if (!baseline.isEstablished) {
      // Return default thresholds
      return {
        minTremorFreq: 8.0,
        maxTremorFreq: 12.0,
        minPressureVar: 0.05,
        maxInteractionTime: 5000
      };
    }
    
    // Personalized thresholds (mean ± 2σ)
    return {
      minTremorFreq: Math.max(0, baseline.avgTremorFrequency - (2 * baseline.tremorStdDev)),
      maxTremorFreq: baseline.avgTremorFrequency + (2 * baseline.tremorStdDev),
      minPressureVar: Math.max(0, baseline.avgPressureVariance - (2 * baseline.pressureStdDev)),
      maxPressureVar: baseline.avgPressureVariance + (2 * baseline.pressureStdDev),
      minInteractionTime: Math.max(100, baseline.avgInteractionTime - (2 * baseline.timeStdDev)),
      maxInteractionTime: baseline.avgInteractionTime + (2 * baseline.timeStdDev)
    };
  }
}

module.exports = AdaptiveLearning;

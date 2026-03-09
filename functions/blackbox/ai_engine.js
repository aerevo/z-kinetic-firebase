/**
 * Z-KINETIC AI ENGINE (BLACK BOX)
 * Core biometric analysis - PROPRIETARY ALGORITHM
 * Migrated from: lib/cryptex_lock/src/behavioral_analyzer.dart
 * PART 1: Core Analysis
 */

const _ = require('lodash');

class AIEngine {
  constructor() {
    this.config = {
      minEntropy: 0.15,
      minConfidence: 0.30,
      botThreshold: 0.40,
      minTremorHz: 8.0,
      maxTremorHz: 12.0,
      anomalyThreshold: 3.0 // Z-score threshold (3σ)
    };
  }

  /**
   * 🧠 MAIN ANALYSIS FUNCTION (BLACK BOX MAGIC!)
   */
  async analyze({ biometric, baseline, deviceId, sessionId }) {
    
    // Extract biometric features
    const features = this._extractFeatures(biometric);
    
    // Bot detection
    const botScore = this._calculateBotProbability(features);
    if (botScore > this.config.botThreshold) {
      return {
        allowed: false,
        confidence: 0,
        verdict: 'BOT_DETECTED',
        threatLevel: 'HIGH',
        reason: 'Robotic behavior pattern detected'
      };
    }
    
    // Anomaly detection (if baseline exists)
    let anomalyResult = null;
    if (baseline && baseline.isEstablished) {
      anomalyResult = this._detectAnomaly(features, baseline);
      
      if (anomalyResult.isAnomalous) {
        return {
          allowed: false,
          confidence: anomalyResult.confidence,
          verdict: 'ANOMALY_DETECTED',
          threatLevel: anomalyResult.threatLevel,
          reason: `Behavioral anomaly: ${anomalyResult.deviations.join(', ')}`
        };
      }
    }
    
    // Calculate overall confidence
    const confidence = this._calculateConfidence(features, baseline);
    
    if (confidence < this.config.minConfidence) {
      return {
        allowed: false,
        confidence,
        verdict: 'LOW_CONFIDENCE',
        threatLevel: 'SUSPICIOUS',
        reason: 'Insufficient biometric confidence'
      };
    }
    
    // Success!
    return {
      allowed: true,
      confidence,
      verdict: 'VERIFIED',
      threatLevel: 'SAFE',
      reason: null
    };
  }

  /**
   * Extract features from biometric data
   */
  _extractFeatures(biometric) {
    const { motion_events = [], touch_events = [], duration_ms = 0 } = biometric;
    
    return {
      // Motion features
      tremorFrequency: this._calculateTremorFrequency(motion_events),
      microMovementRatio: this._calculateMicroMovementRatio(motion_events),
      rhythmConsistency: this._calculateRhythmConsistency(motion_events),
      accelerationProfile: this._calculateAccelerationProfile(motion_events),
      
      // Touch features
      pressureVariance: this._calculatePressureVariance(touch_events),
      velocityProfile: this._calculateVelocityProfile(touch_events),
      hesitationCount: this._calculateHesitationCount(touch_events),
      
      // Temporal features
      interactionTime: duration_ms,
      speedVariability: this._calculateSpeedVariability(motion_events),
      
      // Entropy (randomness)
      entropy: this._calculateEntropy(motion_events),
      
      // Counts
      motionCount: motion_events.length,
      touchCount: touch_events.length
    };
  }

  /**
   * Calculate tremor frequency (human: 8-12 Hz)
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
   * Calculate micro-movement ratio
   */
  _calculateMicroMovementRatio(events) {
    if (events.length === 0) return 0;
    
    const microMovements = events.filter(e => e.m < 0.5).length;
    return microMovements / events.length;
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
   * Calculate acceleration profile (smoothness)
   */
  _calculateAccelerationProfile(events) {
    if (events.length < 3) return 0;
    
    let totalJerk = 0;
    
    for (let i = 2; i < events.length; i++) {
      const accel1 = events[i - 1].m - events[i - 2].m;
      const accel2 = events[i].m - events[i - 1].m;
      const jerk = Math.abs(accel2 - accel1);
      totalJerk += jerk;
    }
    
    return events.length > 2 ? totalJerk / (events.length - 2) : 0;
  }
  /**
 * Z-KINETIC AI ENGINE (BLACK BOX)
 * PART 2: Statistical Analysis & Bot Detection
 */

  /**
   * Calculate pressure variance
   */
  _calculatePressureVariance(events) {
    if (events.length < 2) return 0;
    
    const pressures = events.map(e => e.p);
    return this._standardDeviation(pressures);
  }

  /**
   * Calculate velocity profile
   */
  _calculateVelocityProfile(events) {
    if (events.length === 0) return 0;
    
    const velocities = events.map(e => {
      return Math.sqrt(e.vx * e.vx + e.vy * e.vy);
    });
    
    return _.mean(velocities);
  }

  /**
   * Calculate hesitation count
   */
  _calculateHesitationCount(events) {
    if (events.length < 2) return 0;
    
    let hesitations = 0;
    for (let i = 1; i < events.length; i++) {
      const gap = events[i].t - events[i - 1].t;
      if (gap > 200) hesitations++;
    }
    
    return hesitations;
  }

  /**
   * Calculate speed variability
   */
  _calculateSpeedVariability(events) {
    if (events.length < 2) return 0;
    
    const speeds = [];
    for (let i = 1; i < events.length; i++) {
      const dt = events[i].t - events[i - 1].t;
      if (dt > 0) {
        speeds.push(1000 / dt);
      }
    }
    
    if (speeds.length === 0) return 0;
    
    const mean = _.mean(speeds);
    const stdDev = this._standardDeviation(speeds);
    
    return mean > 0 ? stdDev / mean : 0;
  }

  /**
   * Calculate entropy (Shannon entropy)
   */
  _calculateEntropy(events) {
    if (events.length === 0) return 0;
    
    const magnitudes = events.map(e => e.m);
    const distribution = {};
    
    magnitudes.forEach(mag => {
      const bucket = Math.round(mag * 10);
      distribution[bucket] = (distribution[bucket] || 0) + 1;
    });
    
    let entropy = 0;
    const total = magnitudes.length;
    
    Object.values(distribution).forEach(count => {
      const probability = count / total;
      if (probability > 0) {
        entropy -= probability * Math.log2(probability);
      }
    });
    
    return Math.min(entropy / 4.0, 1.0);
  }

  /**
   * Calculate bot probability
   */
  _calculateBotProbability(features) {
    let score = 0;
    
    // Too consistent rhythm (bot signature)
    if (features.rhythmConsistency < 0.03) {
      score += 0.4;
    }
    
    // No tremor or out of human range
    if (features.tremorFrequency < this.config.minTremorHz || 
        features.tremorFrequency > this.config.maxTremorHz * 1.5) {
      score += 0.3;
    }
    
    // Perfect pressure (no variance)
    if (features.pressureVariance < 0.05) {
      score += 0.2;
    }
    
    // No hesitations + too fast
    if (features.hesitationCount === 0 && features.interactionTime < 500) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Detect anomalies using Z-score
   */
  _detectAnomaly(features, baseline) {
    const deviations = [];
    let totalDeviation = 0;
    let metricCount = 0;
    
    // Check tremor frequency
    const tremorZ = this._calculateZScore(
      features.tremorFrequency,
      baseline.avgTremorFrequency,
      baseline.tremorStdDev
    );
    if (Math.abs(tremorZ) > this.config.anomalyThreshold) {
      deviations.push('TREMOR_ANOMALY');
      totalDeviation += Math.abs(tremorZ);
    }
    metricCount++;
    
    // Check pressure variance
    const pressureZ = this._calculateZScore(
      features.pressureVariance,
      baseline.avgPressureVariance,
      baseline.pressureStdDev
    );
    if (Math.abs(pressureZ) > this.config.anomalyThreshold) {
      deviations.push('PRESSURE_ANOMALY');
      totalDeviation += Math.abs(pressureZ);
    }
    metricCount++;
    
    // Check interaction time
    const timeZ = this._calculateZScore(
      features.interactionTime,
      baseline.avgInteractionTime,
      baseline.timeStdDev
    );
    if (Math.abs(timeZ) > this.config.anomalyThreshold) {
      deviations.push('TIMING_ANOMALY');
      totalDeviation += Math.abs(timeZ);
    }
    metricCount++;
    
    const anomalyScore = Math.min((totalDeviation / metricCount) / 10, 1.0);
    
    let threatLevel = 'SAFE';
    if (anomalyScore > 0.8 || deviations.length >= 3) {
      threatLevel = 'CRITICAL';
    } else if (anomalyScore > 0.5 || deviations.length >= 2) {
      threatLevel = 'HIGH';
    } else if (deviations.length > 0) {
      threatLevel = 'SUSPICIOUS';
    }
    
    return {
      isAnomalous: deviations.length > 0,
      anomalyScore,
      confidence: baseline.confidenceLevel,
      deviations,
      threatLevel
    };
  }

  /**
   * Calculate overall confidence
   */
  _calculateConfidence(features, baseline) {
    const entropyScore = features.entropy;
    const motionScore = Math.min(features.motionCount / 20, 1.0);
    const touchScore = Math.min(features.touchCount / 10, 1.0);
    
    let confidence = (
      entropyScore * 0.4 +
      motionScore * 0.3 +
      touchScore * 0.3
    );
    
    // Boost if baseline exists and matches
    if (baseline && baseline.isEstablished) {
      confidence *= 1.2;
    }
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate Z-score
   */
  _calculateZScore(value, mean, stdDev) {
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
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
}

module.exports = AIEngine;

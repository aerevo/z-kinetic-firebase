/**
 * Z-KINETIC SECURITY UTILITIES
 * Device authentication, blacklist, and nonce validation
 */

const crypto = require('crypto');

class Security {
  constructor(db) {
    this.db = db;
    this.nonceCache = new Map(); // In-memory for performance
  }

  /**
   * Check if device is blacklisted
   */
  async isDeviceBlacklisted(deviceId) {
    try {
      const doc = await this.db
        .collection('blacklisted_devices')
        .doc(deviceId)
        .get();
      
      if (!doc.exists) return false;
      
      const data = doc.data();
      
      // Check if temporary ban expired
      if (data.type === 'TEMPORARY' && data.expiresAt) {
        const now = new Date();
        const expiresAt = data.expiresAt.toDate();
        
        if (now > expiresAt) {
          // Ban expired, remove from blacklist
          await doc.ref.delete();
          return false;
        }
      }
      
      return true;
      
    } catch (error) {
      console.error('Blacklist check error:', error);
      return false; // Fail open (don't block user on error)
    }
  }

  /**
   * Blacklist a device
   */
  async blacklistDevice(deviceId, options = {}) {
    const { reason, incidentId, severity } = options;
    
    // Check existing blacklist entry
    const existingDoc = await this.db
      .collection('blacklisted_devices')
      .doc(deviceId)
      .get();
    
    const incidentCount = existingDoc.exists 
      ? (existingDoc.data().incidentCount || 0) + 1 
      : 1;
    
    // Permanent ban after 10 incidents
    const isPermanent = incidentCount >= 10 || severity === 'CRITICAL';
    
    const blacklistEntry = {
      deviceId,
      type: isPermanent ? 'PERMANENT' : 'TEMPORARY',
      reason: reason || 'SECURITY_INCIDENT',
      incidentId,
      severity,
      incidentCount,
      blacklistedAt: new Date(),
      expiresAt: isPermanent ? null : new Date(Date.now() + 3600000), // 1 hour
      updatedAt: new Date()
    };
    
    await this.db
      .collection('blacklisted_devices')
      .doc(deviceId)
      .set(blacklistEntry, { merge: true });
    
    console.log(`Device blacklisted: ${deviceId} (${blacklistEntry.type})`);
    
    return blacklistEntry;
  }

  /**
   * Validate nonce (prevent replay attacks)
   */
  async validateNonce(deviceId, nonce, timestamp) {
    if (!nonce || !timestamp) return false;
    
    const nonceKey = `${deviceId}:${nonce}`;
    
    // Check in-memory cache first (fast)
    if (this.nonceCache.has(nonceKey)) {
      return false; // Already used
    }
    
    // Check timestamp freshness (60 seconds window)
    const now = Date.now();
    const requestTime = parseInt(timestamp);
    const timeDiff = Math.abs(now - requestTime);
    
    if (timeDiff > 60000) {
      return false; // Too old or too far in future
    }
    
    // Check Firestore for distributed systems
    const nonceDoc = await this.db
      .collection('used_nonces')
      .doc(nonceKey)
      .get();
    
    if (nonceDoc.exists) {
      return false; // Replay attack!
    }
    
    // Store nonce (expires in 2 minutes)
    await this.db
      .collection('used_nonces')
      .doc(nonceKey)
      .set({
        deviceId,
        nonce,
        timestamp: new Date(requestTime),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 120000)
      });
    
    // Add to cache
    this.nonceCache.set(nonceKey, true);
    
    // Auto-cleanup cache after 2 minutes
    setTimeout(() => {
      this.nonceCache.delete(nonceKey);
    }, 120000);
    
    return true;
  }

  /**
   * Flag suspicious activity
   */
  async flagSuspiciousActivity(deviceId, reason) {
    await this.db.collection('suspicious_activity').add({
      deviceId,
      reason,
      timestamp: new Date(),
      flaggedAt: new Date()
    });
    
    // Check if multiple flags within 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 600000);
    
    const flagsSnapshot = await this.db
      .collection('suspicious_activity')
      .where('deviceId', '==', deviceId)
      .where('timestamp', '>', tenMinutesAgo)
      .get();
    
    // Auto-blacklist if 5+ flags in 10 minutes
    if (flagsSnapshot.size >= 5) {
      await this.blacklistDevice(deviceId, {
        reason: 'EXCESSIVE_SUSPICIOUS_ACTIVITY',
        severity: 'HIGH'
      });
    }
  }

  /**
   * Generate secure nonce
   */
  static generateNonce() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Hash data (SHA-256)
   */
  static hash(data) {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }
}

module.exports = Security;

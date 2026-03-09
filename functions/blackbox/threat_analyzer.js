/**
 * Z-KINETIC THREAT ANALYZER
 * Analyzes security incidents and determines severity
 * Migrated from: server/services/biometric_validator.js
 */

class ThreatAnalyzer {
  
  /**
   * Analyze threat from incident report
   */
  analyze(threatIntel) {
    const { type, original_val, manipulated_val } = threatIntel;
    
    let attackVector = 'UNKNOWN';
    let confidence = 0.5;
    let severity = threatIntel.severity || 'MEDIUM';
    
    // Detect attack type based on manipulation
    if (type === 'MITM_AMOUNT_MANIPULATION' || type === 'DATA_INTEGRITY_MISMATCH') {
      attackVector = this._detectManipulationVector(original_val, manipulated_val);
      confidence = this._calculateThreatConfidence(original_val, manipulated_val);
      
      // Auto-adjust severity
      const manipulationRatio = this._getManipulationRatio(original_val, manipulated_val);
      
      if (manipulationRatio > 100) {
        severity = 'CRITICAL'; // >100x increase
      } else if (manipulationRatio > 10) {
        severity = 'HIGH'; // >10x increase
      } else if (manipulationRatio > 2) {
        severity = 'MEDIUM';
      } else {
        severity = 'LOW';
      }
    }
    
    return {
      type: type || 'GENERIC_THREAT',
      attackVector,
      severity,
      confidence,
      details: {
        original: original_val,
        manipulated: manipulated_val,
        ratio: this._getManipulationRatio(original_val, manipulated_val)
      }
    };
  }

  /**
   * Detect specific manipulation vector
   */
  _detectManipulationVector(original, manipulated) {
    if (!original || !manipulated) return 'UNKNOWN';
    
    const origNum = this._extractNumber(original);
    const manipNum = this._extractNumber(manipulated);
    
    if (origNum === null || manipNum === null) {
      return 'NON_NUMERIC_MANIPULATION';
    }
    
    const ratio = manipNum / origNum;
    
    // Pattern detection
    if (ratio > 1000) {
      return 'OVERLAY_ATTACK'; // Extreme increase
    } else if (ratio > 100) {
      return 'MITM_DECIMAL_SHIFT';
    } else if (ratio > 10) {
      return 'MITM_VALUE_INFLATION';
    } else if (Math.abs(manipNum - origNum) < 10) {
      return 'SUBTLE_MANIPULATION';
    } else if (manipNum < origNum) {
      return 'VALUE_DEFLATION';
    }
    
    return 'MITM_AMOUNT_MANIPULATION';
  }

  /**
   * Calculate threat confidence
   */
  _calculateThreatConfidence(original, manipulated) {
    const origNum = this._extractNumber(original);
    const manipNum = this._extractNumber(manipulated);
    
    if (origNum === null || manipNum === null) return 0.5;
    
    const ratio = Math.abs(manipNum - origNum) / origNum;
    
    if (ratio > 10) return 0.99;
    if (ratio > 5) return 0.95;
    if (ratio > 2) return 0.90;
    if (ratio > 1) return 0.80;
    if (ratio > 0.5) return 0.70;
    
    return 0.60;
  }

  /**
   * Get manipulation ratio
   */
  _getManipulationRatio(original, manipulated) {
    const origNum = this._extractNumber(original);
    const manipNum = this._extractNumber(manipulated);
    
    if (origNum === null || manipNum === null || origNum === 0) {
      return 1;
    }
    
    return Math.abs(manipNum / origNum);
  }

  /**
   * Extract numeric value from string
   */
  _extractNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return null;
    
    // Remove currency symbols and commas
    const cleaned = value.replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    
    return isNaN(num) ? null : num;
  }
}

module.exports = ThreatAnalyzer;

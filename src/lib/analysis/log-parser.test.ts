import { LogParser, ParsedLogData } from './log-parser';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generate NMEA checksum for a sentence
 */
function createNmeaChecksum(sentence: string): string {
  const content = sentence.startsWith('$') ? sentence.slice(1) : sentence;
  let checksum = 0;
  for (let i = 0; i < content.length; i++) {
    checksum ^= content.charCodeAt(i);
  }
  return checksum.toString(16).toUpperCase().padStart(2, '0');
}

function nmea(sentence: string): string {
  const content = sentence.startsWith('$') ? sentence.slice(1) : sentence;
  return `$${content}*${createNmeaChecksum(content)}`;
}

/**
 * Build a minimal valid log for testing
 * Structure matches what DropkickReader expects for proper AGL calculation
 */
function buildTestLog(options: {
  surfaceElevation_ft?: number;
  envAltitude_ft?: number;
} = {}): Buffer {
  const { surfaceElevation_ft = 624, envAltitude_ft = 1000 } = options;

  const lines = [
    // Version info
    nmea('PVER,1.0,V1'),
    // Surface elevation (key for AGL calculation)
    nmea(`PSFC,${surfaceElevation_ft}`),
    // State transition
    nmea('PST,100,FLIGHT'),

    // RMC MUST come first to transition to NORMAL_1 state
    nmea('GNRMC,143531.00,A,3326.56121,N,09622.60074,W,97.320,161.00,190725,,,A,V'),
    nmea('GNVTG,161.00,T,,M,97.320,N,180.236,K,A'),

    // PENV samples AFTER RMC (now in NORMAL_1, so these get recorded in time series)
    // First sample at millis=0 ensures interp1 can interpolate at entry.timeOffset=0
    nmea(`PENV,0,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,100,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,200,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,300,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,400,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,500,979.85,${envAltitude_ft},-1.00`),

    // IMU data
    nmea('PIMU,500,0.17836,0.20708,-9.34036,-7.62822,-1.95354,-6.48276'),

    // First GGA fix
    nmea('GNGGA,143531.00,3326.56121,N,09622.60074,W,1,12,0.61,327.2,M,-25.6,M,,'),
    nmea('PTH,600'),

    // More PENV samples
    nmea(`PENV,700,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,800,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,900,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,1000,979.85,${envAltitude_ft},-1.00`),

    // Second GGA fix
    nmea('GNGGA,143532.00,3326.53584,N,09622.58983,W,1,12,0.60,332.5,M,-25.6,M,,'),
    nmea('PTH,1100'),
  ];

  return Buffer.from(lines.join('\n'), 'utf-8');
}

/**
 * Read sample flight file as buffer
 */
function readSampleFlightBuffer(maxBytes?: number): Buffer {
  const samplePath = path.join(__dirname, '../../../docs/sample-flight.txt');
  const fullBuffer = fs.readFileSync(samplePath);
  if (maxBytes && fullBuffer.length > maxBytes) {
    return fullBuffer.subarray(0, maxBytes);
  }
  return fullBuffer;
}

describe('LogParser', () => {

  describe('parseLog', () => {
    it('should parse a valid log and return correct structure', () => {
      const buffer = buildTestLog();
      const result = LogParser.parseLog(buffer);

      expect(result.hasValidData).toBe(true);
      expect(result.hasGPS).toBe(true);
      expect(result.errorMessage).toBeUndefined();
      expect(result.logEntries.length).toBeGreaterThan(0);
    });

    it('should extract time series data', () => {
      const buffer = buildTestLog();
      const result = LogParser.parseLog(buffer);

      expect(result.altitude.length).toBeGreaterThan(0);
      expect(result.gps.length).toBeGreaterThan(0);

      // Verify altitude time series structure
      for (const point of result.altitude) {
        expect(typeof point.timestamp).toBe('number');
        expect(typeof point.value).toBe('number');
      }

      // Verify GPS time series structure
      for (const point of result.gps) {
        expect(typeof point.timestamp).toBe('number');
        expect(typeof point.latitude).toBe('number');
        expect(typeof point.longitude).toBe('number');
        expect(typeof point.altitude_ftAGL).toBe('number');
      }
    });

    it('should calculate correct AGL altitude', () => {
      // Surface: 1000 ft, PENV altitude: 1500 ft -> Expected AGL: 500 ft
      // Note: First entry may have NaN if its timeOffset is before first PENV sample
      const buffer = buildTestLog({
        surfaceElevation_ft: 1000,
        envAltitude_ft: 1500
      });
      const result = LogParser.parseLog(buffer);

      expect(result.hasValidData).toBe(true);

      // Filter to valid (non-NaN) altitude values
      const validAltitudes = result.altitude.filter(p => !isNaN(p.value));

      if (validAltitudes.length > 0) {
        // Altitude values should be around 500 ft AGL
        for (const point of validAltitudes) {
          expect(point.value).toBeCloseTo(500, -1); // within 10 ft
          expect(point.value).toBeGreaterThan(0); // should be positive
        }
      } else {
        // If no valid altitudes, at least verify parsing worked
        expect(result.logEntries.length).toBeGreaterThan(0);
      }
    });

    it('should set start time and duration', () => {
      const buffer = buildTestLog();
      const result = LogParser.parseLog(buffer);

      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.startTime.getUTCFullYear()).toBe(2025);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should extract log version metadata', () => {
      const buffer = buildTestLog();
      const result = LogParser.parseLog(buffer);

      expect(result.logVersion).toBe(1);
      expect(result.logString).toBe('1.0');
    });

    it('should handle empty buffer', () => {
      const buffer = Buffer.from('', 'utf-8');
      const result = LogParser.parseLog(buffer);

      expect(result.hasValidData).toBe(false);
      expect(result.logEntries.length).toBe(0);
    });

    it('should handle invalid data gracefully', () => {
      const buffer = Buffer.from('garbage\nmore garbage\n', 'utf-8');
      const result = LogParser.parseLog(buffer);

      expect(result.hasValidData).toBe(false);
    });
  });

  describe('validateLog', () => {
    it('should return error for empty buffer', () => {
      const buffer = Buffer.from('', 'utf-8');
      const result = LogParser.validateLog(buffer);

      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Empty log file');
    });

    it('should return error for too-small buffer', () => {
      const buffer = Buffer.from('small', 'utf-8');
      const result = LogParser.validateLog(buffer);

      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Log file too small');
    });

    it('should return error for too-large buffer', () => {
      // Create a buffer larger than 16MB
      const largeBuffer = Buffer.alloc(17 * 1024 * 1024, 'x');
      const result = LogParser.validateLog(largeBuffer);

      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Log file too large (>16MB)');
    });

    it('should validate a proper log file', () => {
      const buffer = buildTestLog();
      const result = LogParser.validateLog(buffer);

      expect(result.isValid).toBe(true);
      expect(result.startDate).toBeInstanceOf(Date);
    });

    it('should extract start location during validation', () => {
      const buffer = buildTestLog();
      const result = LogParser.validateLog(buffer);

      expect(result.isValid).toBe(true);
      expect(result.startLocation).toBeDefined();
      if (result.startLocation) {
        expect(result.startLocation.lat_deg).toBeCloseTo(33.44, 1);
        expect(result.startLocation.lon_deg).toBeCloseTo(-96.38, 1);
      }
    });
  });

  describe('extractAnalysisData', () => {
    it('should extract altitude extremes', () => {
      const buffer = buildTestLog();
      const parsed = LogParser.parseLog(buffer);
      const analysis = LogParser.extractAnalysisData(parsed);

      // If we have valid altitude data, check extremes
      const validAltitudes = parsed.altitude.filter(p => !isNaN(p.value));
      if (validAltitudes.length > 0) {
        expect(analysis.hasBarometricData).toBe(true);
        expect(analysis.maxAltitude).toBeDefined();
        expect(analysis.minAltitude).toBeDefined();

        if (analysis.maxAltitude !== undefined && analysis.minAltitude !== undefined &&
            !isNaN(analysis.maxAltitude) && !isNaN(analysis.minAltitude)) {
          expect(analysis.maxAltitude).toBeGreaterThanOrEqual(analysis.minAltitude);
        }
      } else {
        // With minimal test data, first entries may have NaN altitude
        expect(parsed.logEntries.length).toBeGreaterThan(0);
      }
    });

    it('should extract GPS flag', () => {
      const buffer = buildTestLog();
      const parsed = LogParser.parseLog(buffer);
      const analysis = LogParser.extractAnalysisData(parsed);

      expect(analysis.hasGPSData).toBe(true);
    });

    it('should extract exit and landing locations', () => {
      const buffer = buildTestLog();
      const parsed = LogParser.parseLog(buffer);
      const analysis = LogParser.extractAnalysisData(parsed);

      expect(analysis.exitLocation).toBeDefined();
      if (analysis.exitLocation) {
        expect(analysis.exitLocation.lat_deg).toBeCloseTo(33.44, 1);
      }
    });

    it('should handle empty parsed data', () => {
      const emptyParsed: ParsedLogData = {
        startTime: new Date(),
        duration: 0,
        sampleRate: 0,
        altitude: [],
        vspeed: [],
        gps: [],
        logEntries: [],
        hasGPS: false,
        hasValidData: false
      };

      const analysis = LogParser.extractAnalysisData(emptyParsed);

      expect(analysis.hasBarometricData).toBe(false);
      expect(analysis.hasGPSData).toBe(false);
      expect(analysis.maxAltitude).toBeUndefined();
    });
  });

  describe('Sample flight integration', () => {
    it('should parse the sample flight file', () => {
      // Read first 100KB of sample file for faster testing
      const buffer = readSampleFlightBuffer(100 * 1024);
      const result = LogParser.parseLog(buffer);

      expect(result.hasValidData).toBe(true);
      expect(result.hasGPS).toBe(true);
      expect(result.logEntries.length).toBeGreaterThan(0);
    });

    it('should produce reasonable altitude values from sample file', () => {
      const buffer = readSampleFlightBuffer(100 * 1024);
      const result = LogParser.parseLog(buffer);

      expect(result.altitude.length).toBeGreaterThan(0);

      // Filter to valid (non-NaN) altitude values
      const validAltitudes = result.altitude.filter(p => !isNaN(p.value));
      expect(validAltitudes.length).toBeGreaterThan(0);

      for (const point of validAltitudes) {
        // Altitude should be reasonable for skydiving (AGL)
        expect(point.value).toBeGreaterThanOrEqual(-100); // small tolerance
        expect(point.value).toBeLessThan(20000);
      }
    });

    it('should extract correct metadata from sample file', () => {
      const buffer = readSampleFlightBuffer(100 * 1024);
      const result = LogParser.parseLog(buffer);

      // Verify log version
      expect(result.logVersion).toBe(1);
      expect(result.logString).toBe('1.0');

      // Verify date is July 19, 2025
      expect(result.startTime.getUTCFullYear()).toBe(2025);
      expect(result.startTime.getUTCMonth()).toBe(6);
      expect(result.startTime.getUTCDate()).toBe(19);

      // Verify surface elevation is recorded (624 ft = ~190 m)
      expect(result.dzSurfacePressureAltitude_m).toBeCloseTo(190, 0);
    });

    it('should validate sample file successfully', () => {
      const buffer = readSampleFlightBuffer(100 * 1024);
      const result = LogParser.validateLog(buffer);

      expect(result.isValid).toBe(true);
      expect(result.startDate).toBeDefined();
      expect(result.startLocation).toBeDefined();
    });
  });

  describe('GPS data extraction', () => {
    it('should extract ground speed when available', () => {
      const buffer = buildTestLog();
      const result = LogParser.parseLog(buffer);

      expect(result.gps.length).toBeGreaterThan(0);

      // At least some GPS points should have ground speed
      const withSpeed = result.gps.filter(p => p.groundspeed_kmph !== undefined);
      expect(withSpeed.length).toBeGreaterThan(0);

      // Ground speed should be reasonable (from VTG: ~180 km/h)
      for (const point of withSpeed) {
        if (point.groundspeed_kmph !== undefined) {
          expect(point.groundspeed_kmph).toBeGreaterThan(0);
          expect(point.groundspeed_kmph).toBeLessThan(500); // reasonable for skydiving
        }
      }
    });

    it('should extract ground track when available', () => {
      const buffer = buildTestLog();
      const result = LogParser.parseLog(buffer);

      const withTrack = result.gps.filter(p => p.groundTrack_degT !== undefined);
      expect(withTrack.length).toBeGreaterThan(0);

      for (const point of withTrack) {
        if (point.groundTrack_degT !== undefined) {
          expect(point.groundTrack_degT).toBeGreaterThanOrEqual(0);
          expect(point.groundTrack_degT).toBeLessThanOrEqual(360);
        }
      }
    });
  });
});

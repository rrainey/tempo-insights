import { DropkickReader, ReaderState, KMLDataV1 } from './dropkick-reader';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generate NMEA checksum for a sentence (without $ prefix and * suffix)
 */
function createNmeaChecksum(sentence: string): string {
  // Remove $ if present at start
  const content = sentence.startsWith('$') ? sentence.slice(1) : sentence;

  let checksum = 0;
  for (let i = 0; i < content.length; i++) {
    checksum ^= content.charCodeAt(i);
  }

  return checksum.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Create a complete NMEA sentence with checksum
 */
function nmea(sentence: string): string {
  const content = sentence.startsWith('$') ? sentence.slice(1) : sentence;
  return `$${content}*${createNmeaChecksum(content)}`;
}

/**
 * Build a minimal valid log with customizable values for testing
 */
interface MinimalLogOptions {
  surfaceElevation_ft?: number;
  envAltitude_ft?: number;
  latitude?: number;
  longitude?: number;
  gpsAltitude_m?: number;
  groundspeed_knots?: number;
  track_deg?: number;
  date?: string; // DDMMYY format
  time?: string; // HHMMSS.SS format
}

function buildMinimalLog(options: MinimalLogOptions = {}): string[] {
  const {
    surfaceElevation_ft = 624,
    envAltitude_ft = 1000,
    latitude = 33.4426868,
    longitude = -96.3766790,
    gpsAltitude_m = 327.2,
    groundspeed_knots = 97.320,
    track_deg = 161.00,
    date = '190725',
    time = '143531.00'
  } = options;

  // Convert decimal degrees to NMEA format
  // Latitude: DDMM.MMMMM (2 digits for degrees, then MM.MMMMM for minutes)
  // Longitude: DDDMM.MMMMM (3 digits for degrees, then MM.MMMMM for minutes)
  const latDeg = Math.floor(Math.abs(latitude));
  const latMin = (Math.abs(latitude) - latDeg) * 60;
  // Minutes must be formatted as MM.MMMMM (8 chars total, padded with leading zero if needed)
  const latMinStr = latMin.toFixed(5).padStart(8, '0');
  const latStr = `${latDeg.toString().padStart(2, '0')}${latMinStr}`;
  const latDir = latitude >= 0 ? 'N' : 'S';

  const lonDeg = Math.floor(Math.abs(longitude));
  const lonMin = (Math.abs(longitude) - lonDeg) * 60;
  const lonMinStr = lonMin.toFixed(5).padStart(8, '0');
  const lonStr = `${lonDeg.toString().padStart(3, '0')}${lonMinStr}`;
  const lonDir = longitude >= 0 ? 'E' : 'W';

  // Build time string for second fix (1 second later)
  const timeParts = time.split('.');
  const baseSeconds = parseInt(timeParts[0].slice(-2));
  const nextSeconds = (baseSeconds + 1).toString().padStart(2, '0');
  const time2 = timeParts[0].slice(0, -2) + nextSeconds + '.' + (timeParts[1] || '00');

  const lines: string[] = [
    // Version info
    nmea('PVER,1.0,V1'),
    // Surface elevation (this is key for AGL calculation)
    nmea(`PSFC,${surfaceElevation_ft}`),
    // State transition to flight
    nmea('PST,100,FLIGHT'),

    // RMC to establish date and transition to NORMAL_1 state (MUST come before PENV samples are recorded)
    nmea(`GNRMC,${time},A,${latStr},${latDir},${lonStr},${lonDir},${groundspeed_knots},${track_deg},${date},,,A,V`),
    // VTG for ground track and speed
    nmea(`GNVTG,${track_deg},T,,M,${groundspeed_knots},N,${(groundspeed_knots * 1.852).toFixed(3)},K,A`),

    // Environment data samples AFTER RMC (now in NORMAL_1 state, so these get recorded)
    // CRITICAL: First sample at millis=0 ensures interp1 can interpolate at entry.timeOffset=0
    // Entry timeOffset is GPS-based (0 for first entry), PENV times are millis-based
    // Sample at millis=0 gives time=0, matching the first entry's timeOffset
    nmea(`PENV,0,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,100,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,200,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,300,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,400,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,500,979.85,${envAltitude_ft},-1.00`),

    // IMU data
    nmea('PIMU,500,0.17836,0.20708,-9.34036,-7.62822,-1.95354,-6.48276'),

    // First GGA position fix (triggers log entry creation)
    nmea(`GNGGA,${time},${latStr},${latDir},${lonStr},${lonDir},1,12,0.61,${gpsAltitude_m},M,-25.6,M,,`),
    // Time hack correlates millis 600 to GPS time (establishes time offset for entry)
    nmea('PTH,600'),

    // More PENV samples after first fix
    nmea(`PENV,700,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,800,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,900,979.85,${envAltitude_ft},-1.00`),
    nmea(`PENV,1000,979.85,${envAltitude_ft},-1.00`),

    // Second GGA fix (1 second later)
    nmea(`GNGGA,${time2},${latStr},${latDir},${lonStr},${lonDir},1,12,0.61,${gpsAltitude_m},M,-25.6,M,,`),
    nmea('PTH,1100'),
  ];

  return lines;
}

/**
 * Read first N lines from the sample flight file
 */
function readSampleFlightLines(count: number): string[] {
  const samplePath = path.join(__dirname, '../../../docs/sample-flight.txt');
  const content = fs.readFileSync(samplePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  return lines.slice(0, count);
}

describe('DropkickReader', () => {

  describe('NMEA checksum utility', () => {
    it('should generate correct checksums', () => {
      // Known checksum from sample file: $PSFC,624*1A
      expect(createNmeaChecksum('PSFC,624')).toBe('1A');

      // Another known checksum: $PVER,1.0,V1,0.156,2025-07-19*7F
      expect(createNmeaChecksum('PVER,1.0,V1,0.156,2025-07-19')).toBe('7F');
    });
  });

  describe('Basic parsing', () => {
    it('should parse version info from $PVER sentence', () => {
      const reader = new DropkickReader();

      reader.onData(nmea('PVER,1.0,V1'));

      expect(reader.logVersion).toBe(1);
      expect(reader.logString).toBe('1.0');
      expect(reader.state).toBe(ReaderState.SEEKING_RMC);
    });

    it('should parse surface elevation from $PSFC sentence', () => {
      const reader = new DropkickReader();

      reader.onData(nmea('PVER,1.0,V1'));
      reader.onData(nmea('PSFC,1500'));

      // Surface elevation stored in meters (converted from feet)
      const expectedMeters = 1500 * 0.3048;
      expect(reader.dzSurfacePressureAltitude_m).toBeCloseTo(expectedMeters, 1);
    });

    it('should parse RMC sentence and establish date', () => {
      const reader = new DropkickReader();

      reader.onData(nmea('PVER,1.0,V1'));
      // RMC format: time,status,lat,N/S,lon,E/W,speed,track,date,magvar,magdir,mode,navstatus
      reader.onData(nmea('GNRMC,143531.00,A,3326.56121,N,09622.60074,W,97.320,161.00,190725,,,A,V'));

      expect(reader.state).toBe(ReaderState.NORMAL_1);
      expect(reader.startDate).toBeDefined();
      expect(reader.calendarDate).toBeDefined();

      // Verify date is July 19, 2025
      if (reader.startDate) {
        expect(reader.startDate.getUTCFullYear()).toBe(2025);
        expect(reader.startDate.getUTCMonth()).toBe(6); // 0-indexed, July = 6
        expect(reader.startDate.getUTCDate()).toBe(19);
      }
    });

    it('should transition through correct states', () => {
      const reader = new DropkickReader();

      expect(reader.state).toBe(ReaderState.START);

      reader.onData(nmea('PVER,1.0,V1'));
      expect(reader.state).toBe(ReaderState.SEEKING_RMC);

      reader.onData(nmea('GNRMC,143531.00,A,3326.56121,N,09622.60074,W,97.320,161.00,190725,,,A,V'));
      expect(reader.state).toBe(ReaderState.NORMAL_1);

      reader.onClose();
      expect(reader.state).toBe(ReaderState.END);
    });
  });

  describe('Log entry creation', () => {
    it('should create log entries from GGA fixes', () => {
      const reader = new DropkickReader();
      const lines = buildMinimalLog();

      for (const line of lines) {
        reader.onData(line);
      }
      reader.onClose();

      expect(reader.logEntries.length).toBeGreaterThan(0);

      const entry = reader.logEntries[0];
      expect(entry.location).not.toBeNull();
      expect(entry.timestamp).not.toBeNull();
    });

    it('should store correct location from GGA', () => {
      const reader = new DropkickReader();
      const lines = buildMinimalLog({
        latitude: 40.7128,
        longitude: -74.0060,
        gpsAltitude_m: 100.5
      });

      for (const line of lines) {
        reader.onData(line);
      }
      reader.onClose();

      expect(reader.logEntries.length).toBeGreaterThan(0);
      const location = reader.logEntries[0].location;
      expect(location).not.toBeNull();
      if (location) {
        expect(location.lat_deg).toBeCloseTo(40.7128, 3);
        expect(location.lon_deg).toBeCloseTo(-74.0060, 3);
        expect(location.alt_m).toBeCloseTo(100.5, 1);
      }
    });
  });

  describe('AGL altitude calculation (critical)', () => {
    it('should calculate AGL altitude correctly by subtracting surface elevation once', () => {
      // This test verifies the fix for the double-subtraction bug
      // Surface: 1000 ft MSL, PENV altitude: 1500 ft MSL
      // Expected AGL: 1500 - 1000 = 500 ft
      //
      // Note: The first entry may have NaN altitude if its timeOffset falls before
      // the first recorded PENV sample (this is expected behavior per LOG-FORMAT.md).
      // We check entries that have valid interpolatable data.

      const reader = new DropkickReader();
      const lines = buildMinimalLog({
        surfaceElevation_ft: 1000,
        envAltitude_ft: 1500
      });

      for (const line of lines) {
        reader.onData(line);
      }
      reader.onClose();

      expect(reader.logEntries.length).toBeGreaterThan(0);

      // Find an entry with valid baroAlt_ft (may need to skip first entry)
      const validEntry = reader.logEntries.find(e =>
        e.baroAlt_ft !== null && !isNaN(e.baroAlt_ft)
      );

      // If we have a valid entry, verify AGL calculation
      if (validEntry) {
        // Should be approximately 500 ft AGL (1500 - 1000)
        expect(validEntry.baroAlt_ft).toBeCloseTo(500, -1); // within 10 ft
        // Verify it's NOT the double-subtracted value (-500)
        expect(validEntry.baroAlt_ft!).toBeGreaterThan(0);
      } else {
        // If no valid entries, verify the PENV time series was populated correctly
        expect(reader.envAltSeries_ft.length).toBeGreaterThan(0);
        // The stored values should be AGL (1500 - 1000 = 500)
        expect(reader.envAltSeries_ft[0]).toBeCloseTo(500, -1);
      }
    });

    it('should handle zero surface elevation', () => {
      const reader = new DropkickReader();
      const lines = buildMinimalLog({
        surfaceElevation_ft: 0,
        envAltitude_ft: 1000
      });

      for (const line of lines) {
        reader.onData(line);
      }
      reader.onClose();

      expect(reader.logEntries.length).toBeGreaterThan(0);

      // Find an entry with valid baroAlt_ft
      const validEntry = reader.logEntries.find(e =>
        e.baroAlt_ft !== null && !isNaN(e.baroAlt_ft)
      );

      if (validEntry) {
        // With surface at 0 ft MSL, AGL should equal MSL
        expect(validEntry.baroAlt_ft).toBeCloseTo(1000, -1);
      } else {
        // Verify time series has correct AGL values
        expect(reader.envAltSeries_ft.length).toBeGreaterThan(0);
        expect(reader.envAltSeries_ft[0]).toBeCloseTo(1000, -1);
      }
    });

    it('should handle high surface elevations (Denver-like)', () => {
      // Test with Denver-like elevation (~5280 ft)
      const reader = new DropkickReader();
      const lines = buildMinimalLog({
        surfaceElevation_ft: 5280,
        envAltitude_ft: 6280
      });

      for (const line of lines) {
        reader.onData(line);
      }
      reader.onClose();

      expect(reader.logEntries.length).toBeGreaterThan(0);

      // Find an entry with valid baroAlt_ft
      const validEntry = reader.logEntries.find(e =>
        e.baroAlt_ft !== null && !isNaN(e.baroAlt_ft)
      );

      if (validEntry) {
        // AGL should be 1000 ft (6280 - 5280)
        expect(validEntry.baroAlt_ft).toBeCloseTo(1000, -1);
      } else {
        // Verify time series has correct AGL values
        expect(reader.envAltSeries_ft.length).toBeGreaterThan(0);
        expect(reader.envAltSeries_ft[0]).toBeCloseTo(1000, -1);
      }
    });
  });

  describe('Sample flight integration', () => {
    it('should parse sample-flight.txt and extract valid data', () => {
      const reader = new DropkickReader();
      const lines = readSampleFlightLines(500);

      for (const line of lines) {
        reader.onData(line);
      }
      reader.onClose();

      // Verify basic metadata extraction
      expect(reader.logVersion).toBe(1);
      expect(reader.logString).toBe('1.0');

      // Verify date extraction (2025-07-19)
      expect(reader.startDate).toBeDefined();
      if (reader.startDate) {
        expect(reader.startDate.getUTCFullYear()).toBe(2025);
        expect(reader.startDate.getUTCMonth()).toBe(6);
        expect(reader.startDate.getUTCDate()).toBe(19);
      }

      // Verify surface elevation (624 ft from $PSFC,624)
      expect(reader.dzSurfacePressureAltitude_m).toBeCloseTo(624 * 0.3048, 1);

      // Verify location extraction
      expect(reader.startLocation).toBeDefined();
      if (reader.startLocation) {
        expect(reader.startLocation.lat_deg).toBeCloseTo(33.44, 1);
        expect(reader.startLocation.lon_deg).toBeCloseTo(-96.38, 1);
      }

      // Verify log entries were created
      expect(reader.logEntries.length).toBeGreaterThan(0);
    });

    it('should produce reasonable altitude values from sample data', () => {
      const reader = new DropkickReader();
      const lines = readSampleFlightLines(500);

      for (const line of lines) {
        reader.onData(line);
      }
      reader.onClose();

      // Filter to entries with valid (non-NaN) altitude
      const entriesWithAlt = reader.logEntries.filter(
        e => e.baroAlt_ft !== null && !isNaN(e.baroAlt_ft)
      );

      // Should have some valid altitude entries
      expect(entriesWithAlt.length).toBeGreaterThan(0);

      // Check that altitude values are reasonable (positive, not impossibly large)
      for (const entry of entriesWithAlt) {
        // Altitude should be positive (AGL)
        expect(entry.baroAlt_ft!).toBeGreaterThanOrEqual(-100); // small tolerance for noise
        // Altitude should be reasonable (less than 20000 ft AGL for skydiving)
        expect(entry.baroAlt_ft!).toBeLessThan(20000);
      }
    });

    it('should have monotonically increasing time offsets', () => {
      const reader = new DropkickReader();
      const lines = readSampleFlightLines(500);

      for (const line of lines) {
        reader.onData(line);
      }
      reader.onClose();

      // Time offsets should be monotonically increasing
      let lastOffset = -1;
      for (const entry of reader.logEntries) {
        expect(entry.timeOffset).toBeGreaterThan(lastOffset);
        lastOffset = entry.timeOffset;
      }
    });
  });

  describe('IMU data processing', () => {
    it('should accumulate IMU samples and compute averages', () => {
      const reader = new DropkickReader();
      const lines = buildMinimalLog();

      // Add additional IMU samples
      lines.push(nmea('PIMU,260,1.0,2.0,-9.8,0.1,0.2,0.3'));
      lines.push(nmea('PIMU,270,1.0,2.0,-9.8,0.1,0.2,0.3'));

      // Add another GGA to trigger entry creation with IMU data
      lines.push(nmea('GNGGA,143532.00,3326.56121,N,09622.60074,W,1,12,0.61,330.0,M,-25.6,M,,'));
      lines.push(nmea('PTH,350'));

      for (const line of lines) {
        reader.onData(line);
      }
      reader.onClose();

      // At least one entry should have acceleration data
      const entryWithAccel = reader.logEntries.find(e => e.accel_mps2 !== null);
      expect(entryWithAccel).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input gracefully', () => {
      const reader = new DropkickReader();
      reader.onClose();

      expect(reader.logEntries.length).toBe(0);
      expect(reader.state).toBe(ReaderState.END);
    });

    it('should handle invalid NMEA sentences', () => {
      const reader = new DropkickReader();

      // These should not throw
      expect(() => reader.onData('garbage data')).not.toThrow();
      expect(() => reader.onData('')).not.toThrow();
      expect(() => reader.onData('$INVALID,data*00')).not.toThrow();

      reader.onClose();
      expect(reader.logEntries.length).toBe(0);
    });

    it('should handle incomplete sequences', () => {
      const reader = new DropkickReader();

      // Only version info, no GPS data
      reader.onData(nmea('PVER,1.0,V1'));
      reader.onData(nmea('PSFC,1000'));
      reader.onClose();

      expect(reader.logEntries.length).toBe(0);
      expect(reader.logVersion).toBe(1);
    });
  });
});

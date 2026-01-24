# GNSS Path Map Visualization - Implementation Plan

## Overview

Add a "god's-eye view" map component to display the GNSS path logged by a skydiver during a jump. The map will use MapLibre GL JS with OpenStreetMap tiles, supporting pan/zoom, phase filtering, and hover callouts showing groundspeed.

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  JumpDetailsPanel.tsx                                        │   │
│  │    └── GNSSPathMap.tsx (new MapLibre GL component)          │   │
│  │          ├── Phase filter controls                           │   │
│  │          ├── MapLibre GL map instance                        │   │
│  │          └── Hover callout overlay                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Backend                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  /api/tiles/{z}/{x}/{y}.png (new)                           │   │
│  │    └── Caching proxy to OSM tile server                     │   │
│  │        └── Supabase Storage bucket: "map-tiles"             │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    OSM Tile Server                                   │
│  https://tile.openstreetmap.org/{z}/{x}/{y}.png                    │
│  (User-Agent: "tempo-insights")                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Phase 1: GNSSPathMap Component (Implement First)

### 1.1 Install Dependencies

Add MapLibre GL JS to the project:

```bash
npm install maplibre-gl
npm install -D @types/maplibre-gl
```

### 1.2 Create GNSSPathMap Component

**File:** `src/components/home/GNSSPathMap.tsx`

**Props Interface:**
```typescript
interface GNSSPathMapProps {
  gpsData: GPSPoint[];           // From ParsedLogData.gps
  exitOffsetSec?: number;        // From jump analysis
  deploymentOffsetSec?: number;  // From jump analysis
  landingOffsetSec?: number;     // From jump analysis
}

interface GPSPoint {
  timestamp: number;     // offset in seconds from log start
  latitude: number;      // degrees
  longitude: number;     // degrees
  altitude: number;      // meters (GNSS altitude)
  groundspeed?: number;  // km/h (from $GNVTG or $PFIX)
  heading?: number;      // degrees true (from $GNVTG or $PFIX)
}
```

**Features:**
1. **Map Display**
   - Use MapLibre GL JS with raster tile source
   - Initial tile URL: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (direct)
   - Later switch to: `/api/tiles/{z}/{x}/{y}.png` (caching proxy)
   - Auto-fit bounds to GPS track with padding

2. **Path Rendering**
   - Single GeoJSON LineString source for the full path
   - No color coding (as specified)
   - Line width: 3px, with subtle outline for visibility

3. **Phase Filtering**
   - SegmentedControl with options:
     - "All" (default)
     - "Climb-out" (start → exit)
     - "Freefall" (exit → deployment)
     - "Under Canopy" (deployment → landing)
   - Filter updates the GeoJSON source to show only selected segment
   - When filtered, re-fit bounds to visible segment

4. **Hover Callout**
   - Use MapLibre's `queryRenderedFeatures` on mousemove
   - Show popup near cursor with:
     - Groundspeed in mph (converted from km/h)
     - Phase indicator (climb/freefall/canopy)
   - Use invisible wider line for easier hover detection

5. **Pan & Zoom**
   - Enable MapLibre's built-in navigation controls
   - Double-click zoom, scroll zoom, drag pan
   - Touch gesture support for mobile

### 1.3 Data Processing Utilities

**File:** `src/lib/analysis/gps-path-utils.ts`

```typescript
// Convert GPSPoint array to GeoJSON LineString
export function gpsToGeoJSON(gpsData: GPSPoint[]): GeoJSON.Feature<GeoJSON.LineString>

// Filter GPS points by phase
export function filterByPhase(
  gpsData: GPSPoint[],
  phase: 'all' | 'climb' | 'freefall' | 'canopy',
  exitOffset?: number,
  deploymentOffset?: number,
  landingOffset?: number
): GPSPoint[]

// Calculate bounding box for GPS points
export function calculateBounds(gpsData: GPSPoint[]): [number, number, number, number]

// Convert km/h to mph
export function kmphToMph(kmph: number): number
```

### 1.4 Integration with JumpDetailsPanel

Add the map below the altitude chart in `JumpDetailsPanel.tsx`:

```tsx
{/* GNSS Path Map */}
{jump.timeSeries && jump.timeSeries.hasGPS && jump.timeSeries.gps.length > 0 && (
  <GNSSPathMap
    gpsData={jump.timeSeries.gps}
    exitOffsetSec={jump.timeSeries.exitOffsetSec}
    deploymentOffsetSec={jump.timeSeries.deploymentOffsetSec}
    landingOffsetSec={jump.timeSeries.landingOffsetSec}
  />
)}
```

### 1.5 GPS Data Enhancement

Update `src/lib/analysis/log-parser.ts` to include groundspeed in GPS data:

The existing `ParsedLogData.gps` array needs to include groundspeed data. Looking at the dropkick-reader, `KMLDataV1` already has:
- `groundspeed_kmph` from VTG sentences
- `groundtrack_degT` from VTG sentences

Ensure these are propagated to the `gps` array in `LogParser.parseLog()`.

---

## Phase 2: Caching Tile Server (Implement Later)

### 2.1 Create API Route

**File:** `src/pages/api/tiles/[...params].ts`

This will handle requests like `/api/tiles/12/1234/5678.png`

**Logic:**
1. Parse z/x/y from URL params
2. Construct cache key: `tiles/{z}/{x}/{y}.png`
3. Check Supabase Storage for cached tile
4. If cached: return tile from storage
5. If not cached:
   - Fetch from `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
   - Set User-Agent header: `"tempo-insights"`
   - Store in Supabase Storage
   - Return tile to client

**Caching Strategy:**
- Store tiles in Supabase Storage bucket: `map-tiles`
- Path structure: `{z}/{x}/{y}.png`
- No expiration (tiles are static unless OSM updates)
- Consider limiting zoom levels cached (e.g., z=10-18)

### 2.2 Create Supabase Storage Bucket

Add bucket configuration for map tiles:
- Bucket name: `map-tiles`
- Public access: false (served through API)
- File size limit: 256KB (tiles are small)

### 2.3 Rate Limiting Considerations

Per OSM tile usage policy:
- Maximum 2 requests/second to OSM servers
- Implement request queue with rate limiting
- Cache aggressively to minimize upstream requests

### 2.4 Update GNSSPathMap Tile Source

Switch from direct OSM URL to local proxy:

```typescript
const tileSource = process.env.NODE_ENV === 'production'
  ? '/api/tiles/{z}/{x}/{y}.png'
  : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
```

---

## File Structure

```
src/
├── components/
│   └── home/
│       ├── GNSSPathMap.tsx          # New - MapLibre GL map component
│       └── JumpDetailsPanel.tsx      # Modified - add map integration
├── lib/
│   └── analysis/
│       ├── gps-path-utils.ts        # New - GPS/GeoJSON utilities
│       └── log-parser.ts            # Modified - ensure groundspeed in gps array
└── pages/
    └── api/
        └── tiles/
            └── [...params].ts        # New - caching tile proxy (Phase 2)
```

---

## Implementation Order

### Step 1: Install MapLibre GL JS
- Add `maplibre-gl` and `@types/maplibre-gl` to package.json

### Step 2: Create GPS Path Utilities
- Create `src/lib/analysis/gps-path-utils.ts`
- Implement GeoJSON conversion, filtering, bounds calculation

### Step 3: Verify GPS Data in API Response
- Check that `timeSeries.gps` includes groundspeed
- Update `log-parser.ts` if needed to propagate groundspeed from KMLDataV1

### Step 4: Create GNSSPathMap Component
- Implement MapLibre GL integration
- Add path rendering with GeoJSON source
- Implement phase filter controls (SegmentedControl)
- Add hover callout functionality

### Step 5: Integrate with JumpDetailsPanel
- Add conditional rendering of GNSSPathMap
- Pass required props from jump data

### Step 6: Testing
- Test with sample flight data
- Verify phase filtering works correctly
- Test hover callouts show correct groundspeed
- Test pan/zoom functionality

### (Future) Step 7: Implement Caching Tile Server
- Create Supabase Storage bucket
- Implement `/api/tiles/[...params].ts`
- Add rate limiting
- Switch component to use local proxy

---

## Technical Notes

### OSM Tile Policy Compliance
- User-Agent: `tempo-insights`
- Rate limit: max 2 req/sec when fetching from OSM
- Caching is encouraged by OSM policy
- Attribution required (MapLibre handles this with default controls)

### MapLibre GL Configuration

```typescript
const map = new maplibregl.Map({
  container: containerRef.current,
  style: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }
    },
    layers: [{
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm'
    }]
  },
  center: [centerLon, centerLat],
  zoom: 14
});
```

### Phase Detection Logic

Using event offsets from jump analysis:
- **Climb-out:** `timestamp < exitOffsetSec`
- **Freefall:** `exitOffsetSec <= timestamp < deploymentOffsetSec`
- **Under Canopy:** `deploymentOffsetSec <= timestamp <= landingOffsetSec`

---

## Estimated Implementation Effort

| Task | Complexity |
|------|------------|
| GPS utilities | Low |
| GNSSPathMap component | Medium |
| Phase filtering | Low |
| Hover callouts | Medium |
| JumpDetailsPanel integration | Low |
| Caching tile server (Phase 2) | Medium |

---

## Dependencies to Add

```json
{
  "dependencies": {
    "maplibre-gl": "^4.7.0"
  },
  "devDependencies": {
    "@types/maplibre-gl": "^4.7.0"
  }
}
```

---

## Questions Resolved

1. **Tile source:** OSM via caching proxy (direct access initially)
2. **User agent:** "tempo-insights"
3. **Phase detection:** Use existing event offsets from analysis
4. **Groundspeed units:** Display in mph (convert from km/h in data)
5. **Path color:** Single color, no phase-based color coding
6. **Hover info:** Groundspeed only (in mph)

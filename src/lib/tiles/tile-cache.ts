// lib/tiles/tile-cache.ts
// Tile caching service using Supabase Storage

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const BUCKET_NAME = 'map-tiles';
const OSM_TILE_URL = 'https://tile.openstreetmap.org';
const USER_AGENT = 'tempo-insights';

// Rate limiting: OSM policy allows max 2 requests/second
const RATE_LIMIT_MS = 500; // 500ms between requests = 2 req/sec
let lastOsmRequest = 0;

// Valid zoom levels for caching (reasonable range for skydiving DZs)
const MIN_ZOOM = 8;
const MAX_ZOOM = 18;

export interface TileCacheResult {
  data: Buffer | null;
  contentType: string;
  fromCache: boolean;
  error?: string;
}

export interface TileCacheStats {
  totalTiles: number;
  totalSizeBytes: number;
  oldestTile?: Date;
  newestTile?: Date;
}

/**
 * Get Supabase client for tile operations
 */
function getSupabaseClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Validate tile coordinates
 */
export function validateTileCoords(z: number, x: number, y: number): boolean {
  if (z < MIN_ZOOM || z > MAX_ZOOM) return false;

  const maxTile = Math.pow(2, z);
  if (x < 0 || x >= maxTile) return false;
  if (y < 0 || y >= maxTile) return false;

  return true;
}

/**
 * Generate storage path for a tile
 */
export function getTilePath(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}.png`;
}

/**
 * Rate-limited fetch from OSM
 */
async function fetchFromOSM(z: number, x: number, y: number): Promise<Buffer | null> {
  // Enforce rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastOsmRequest;

  if (timeSinceLastRequest < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - timeSinceLastRequest));
  }

  lastOsmRequest = Date.now();

  const url = `${OSM_TILE_URL}/${z}/${x}/${y}.png`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT
      }
    });

    if (!response.ok) {
      console.error(`[TILE-CACHE] OSM fetch failed: ${response.status} for ${url}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`[TILE-CACHE] OSM fetch error for ${url}:`, error);
    return null;
  }
}

/**
 * Get a tile, using cache if available
 */
export async function getTile(z: number, x: number, y: number): Promise<TileCacheResult> {
  // Validate coordinates
  if (!validateTileCoords(z, x, y)) {
    return {
      data: null,
      contentType: 'image/png',
      fromCache: false,
      error: `Invalid tile coordinates: z=${z}, x=${x}, y=${y}`
    };
  }

  const supabase = getSupabaseClient();
  const tilePath = getTilePath(z, x, y);

  // Try to get from cache first
  try {
    const { data: cachedTile, error: downloadError } = await supabase.storage
      .from(BUCKET_NAME)
      .download(tilePath);

    if (!downloadError && cachedTile) {
      const buffer = Buffer.from(await cachedTile.arrayBuffer());
      console.log(`[TILE-CACHE] Cache hit: ${tilePath}`);
      return {
        data: buffer,
        contentType: 'image/png',
        fromCache: true
      };
    }
  } catch {
    // Cache miss or error, will fetch from OSM
  }

  // Cache miss - fetch from OSM
  console.log(`[TILE-CACHE] Cache miss, fetching from OSM: ${tilePath}`);
  const tileData = await fetchFromOSM(z, x, y);

  if (!tileData) {
    return {
      data: null,
      contentType: 'image/png',
      fromCache: false,
      error: 'Failed to fetch tile from OSM'
    };
  }

  // Store in cache (async, don't wait)
  storeTileInCache(supabase, tilePath, tileData).catch(err => {
    console.error(`[TILE-CACHE] Failed to cache tile ${tilePath}:`, err);
  });

  return {
    data: tileData,
    contentType: 'image/png',
    fromCache: false
  };
}

/**
 * Store a tile in the cache
 */
async function storeTileInCache(
  supabase: SupabaseClient,
  tilePath: string,
  data: Buffer
): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(tilePath, data, {
      contentType: 'image/png',
      cacheControl: '31536000', // 1 year cache
      upsert: true
    });

  if (error) {
    console.error(`[TILE-CACHE] Storage error for ${tilePath}:`, error);
    throw error;
  }

  console.log(`[TILE-CACHE] Cached tile: ${tilePath}`);
}

/**
 * Flush all cached tiles (admin only)
 */
export async function flushTileCache(): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const supabase = getSupabaseClient();
  let deletedCount = 0;

  try {
    // List all files in the bucket by iterating through zoom levels
    for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
      const { data: zoomFolders, error: listError } = await supabase.storage
        .from(BUCKET_NAME)
        .list(String(z), { limit: 1000 });

      if (listError) {
        console.error(`[TILE-CACHE] Error listing zoom level ${z}:`, listError);
        continue;
      }

      if (!zoomFolders || zoomFolders.length === 0) continue;

      // For each x folder at this zoom level
      for (const xFolder of zoomFolders) {
        if (!xFolder.name) continue;

        const xPath = `${z}/${xFolder.name}`;
        const { data: tiles, error: tilesError } = await supabase.storage
          .from(BUCKET_NAME)
          .list(xPath, { limit: 1000 });

        if (tilesError || !tiles) continue;

        // Delete tiles in batches
        const tilePaths = tiles
          .filter(t => t.name && t.name.endsWith('.png'))
          .map(t => `${xPath}/${t.name}`);

        if (tilePaths.length > 0) {
          const { error: deleteError } = await supabase.storage
            .from(BUCKET_NAME)
            .remove(tilePaths);

          if (!deleteError) {
            deletedCount += tilePaths.length;
          } else {
            console.error(`[TILE-CACHE] Error deleting tiles in ${xPath}:`, deleteError);
          }
        }
      }
    }

    console.log(`[TILE-CACHE] Flushed ${deletedCount} tiles from cache`);
    return { success: true, deletedCount };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TILE-CACHE] Flush error:', error);
    return { success: false, deletedCount, error: errorMessage };
  }
}

/**
 * Get cache statistics (admin only)
 */
export async function getTileCacheStats(): Promise<TileCacheStats> {
  const supabase = getSupabaseClient();
  let totalTiles = 0;
  let totalSizeBytes = 0;
  let oldestTile: Date | undefined;
  let newestTile: Date | undefined;

  try {
    for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
      const { data: zoomFolders, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(String(z), { limit: 1000 });

      if (error || !zoomFolders) continue;

      for (const xFolder of zoomFolders) {
        if (!xFolder.name) continue;

        const xPath = `${z}/${xFolder.name}`;
        const { data: tiles, error: tilesError } = await supabase.storage
          .from(BUCKET_NAME)
          .list(xPath, { limit: 1000 });

        if (tilesError || !tiles) continue;

        for (const tile of tiles) {
          if (!tile.name?.endsWith('.png')) continue;

          totalTiles++;
          totalSizeBytes += tile.metadata?.size || 0;

          const createdAt = tile.created_at ? new Date(tile.created_at) : undefined;
          if (createdAt) {
            if (!oldestTile || createdAt < oldestTile) oldestTile = createdAt;
            if (!newestTile || createdAt > newestTile) newestTile = createdAt;
          }
        }
      }
    }
  } catch (error) {
    console.error('[TILE-CACHE] Stats error:', error);
  }

  return { totalTiles, totalSizeBytes, oldestTile, newestTile };
}

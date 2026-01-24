// pages/api/tiles/[...params].ts
// Caching tile proxy for OSM tiles

import { NextApiRequest, NextApiResponse } from 'next';
import { getTile, validateTileCoords } from '../../../lib/tiles/tile-cache';

export const config = {
  api: {
    responseLimit: false, // Tiles are small, but disable limit just in case
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { params } = req.query;

  // params should be [z, x, y.png] or [z, x, y]
  if (!params || !Array.isArray(params) || params.length < 3) {
    return res.status(400).json({ error: 'Invalid tile path. Expected /api/tiles/{z}/{x}/{y}.png' });
  }

  // Parse tile coordinates
  const z = parseInt(params[0], 10);
  const x = parseInt(params[1], 10);

  // Handle both "y.png" and "y" formats
  let yStr = params[2];
  if (yStr.endsWith('.png')) {
    yStr = yStr.slice(0, -4);
  }
  const y = parseInt(yStr, 10);

  // Validate parsed values
  if (isNaN(z) || isNaN(x) || isNaN(y)) {
    return res.status(400).json({ error: 'Invalid tile coordinates. z, x, y must be integers.' });
  }

  if (!validateTileCoords(z, x, y)) {
    return res.status(400).json({
      error: `Invalid tile coordinates. z must be 8-18, x and y must be within valid range for zoom level.`
    });
  }

  try {
    const result = await getTile(z, x, y);

    if (result.error || !result.data) {
      return res.status(404).json({ error: result.error || 'Tile not found' });
    }

    // Set cache headers
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000'); // 1 day browser, 1 year CDN
    res.setHeader('X-Tile-Cache', result.fromCache ? 'HIT' : 'MISS');

    return res.send(result.data);

  } catch (error) {
    console.error('[TILES API] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

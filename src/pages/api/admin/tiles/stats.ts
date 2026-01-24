// pages/api/admin/tiles/stats.ts
// Admin API to get tile cache statistics

import { NextApiResponse } from 'next';
import { requireAdmin, AuthenticatedRequest } from '../../../../lib/auth/middleware';
import { getTileCacheStats } from '../../../../lib/tiles/tile-cache';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = await getTileCacheStats();

    return res.status(200).json({
      success: true,
      stats: {
        totalTiles: stats.totalTiles,
        totalSizeBytes: stats.totalSizeBytes,
        totalSizeMB: (stats.totalSizeBytes / (1024 * 1024)).toFixed(2),
        oldestTile: stats.oldestTile?.toISOString() || null,
        newestTile: stats.newestTile?.toISOString() || null
      }
    });

  } catch (error) {
    console.error('[ADMIN] Tile stats error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

export default requireAdmin(handler);

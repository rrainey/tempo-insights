// pages/api/admin/tiles/flush.ts
// Admin API to flush the tile cache

import { NextApiResponse } from 'next';
import { requireAdmin, AuthenticatedRequest } from '../../../../lib/auth/middleware';
import { flushTileCache } from '../../../../lib/tiles/tile-cache';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed. Use POST or DELETE.' });
  }

  console.log(`[ADMIN] User ${req.user?.email} initiated tile cache flush`);

  try {
    const result = await flushTileCache();

    if (result.success) {
      console.log(`[ADMIN] Tile cache flush completed: ${result.deletedCount} tiles deleted`);
      return res.status(200).json({
        success: true,
        message: `Successfully flushed tile cache`,
        deletedCount: result.deletedCount
      });
    } else {
      console.error(`[ADMIN] Tile cache flush failed:`, result.error);
      return res.status(500).json({
        success: false,
        error: result.error || 'Unknown error during flush',
        deletedCount: result.deletedCount
      });
    }

  } catch (error) {
    console.error('[ADMIN] Tile flush error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

export default requireAdmin(handler);

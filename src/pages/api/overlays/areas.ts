// pages/api/overlays/areas.ts
// Serves the landing areas GeoJSON overlay
// This is a temporary endpoint - will be replaced by dynamic overlay management

import { NextApiRequest, NextApiResponse } from 'next';
import areasData from '../../../../docs/SSD-areas.json';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Set cache headers - areas don't change often
  res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache

  return res.status(200).json(areasData);
}

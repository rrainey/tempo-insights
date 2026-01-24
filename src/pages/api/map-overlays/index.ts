// pages/api/map-overlays/index.ts
// List and create map overlays (Admin only for mutations)

import { NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';
import { requireAdmin, AuthenticatedRequest } from '../../../lib/auth/middleware';
import { calculateGeoJSONBounds, validateGeoJSON } from '../../../lib/overlays/geojson-overlay';

const prisma = new PrismaClient();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const BUCKET_NAME = 'map-overlays';

export const config = {
  api: {
    bodyParser: false, // Disable for file uploads
  },
};

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'POST') {
    return handlePost(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

// GET /api/map-overlays - List overlays
async function handleGet(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const { minLon, minLat, maxLon, maxLat, visibleOnly } = req.query;

    const where: any = {};

    // Filter by visibility if requested
    if (visibleOnly === 'true') {
      where.isVisible = true;
    }

    // Filter by bounds if provided (spatial query)
    if (minLon && minLat && maxLon && maxLat) {
      where.AND = [
        { maxLon: { gte: parseFloat(minLon as string) } },
        { minLon: { lte: parseFloat(maxLon as string) } },
        { maxLat: { gte: parseFloat(minLat as string) } },
        { minLat: { lte: parseFloat(maxLat as string) } },
      ];
    }

    const overlays = await prisma.mapOverlay.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: { id: true, name: true, slug: true }
        }
      }
    });

    return res.status(200).json({ overlays });
  } catch (error) {
    console.error('Error listing overlays:', error);
    return res.status(500).json({ error: 'Failed to list overlays' });
  }
}

// POST /api/map-overlays - Upload new overlay
async function handlePost(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
    });

    const [fields, files] = await form.parse(req);

    const name = fields.name?.[0];
    const description = fields.description?.[0] || null;
    const file = files.file?.[0];

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!file) {
      return res.status(400).json({ error: 'GeoJSON file is required' });
    }

    // Read and validate GeoJSON
    const fileContent = fs.readFileSync(file.filepath, 'utf-8');
    let geojson;

    try {
      geojson = JSON.parse(fileContent);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON file' });
    }

    const validation = validateGeoJSON(geojson);
    if (!validation.valid) {
      return res.status(400).json({ error: `Invalid GeoJSON: ${validation.error}` });
    }

    // Calculate bounds
    const bounds = calculateGeoJSONBounds(geojson);
    if (!bounds) {
      return res.status(400).json({ error: 'Could not calculate bounds from GeoJSON' });
    }

    // Generate storage path
    const timestamp = Date.now();
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
    const storagePath = `${safeName}-${timestamp}.json`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileContent, {
        contentType: 'application/json',
        upsert: false
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload file to storage' });
    }

    // Create database record
    const overlay = await prisma.mapOverlay.create({
      data: {
        name,
        description,
        storagePath,
        minLon: bounds.minLon,
        minLat: bounds.minLat,
        maxLon: bounds.maxLon,
        maxLat: bounds.maxLat,
        featureCount: geojson.features.length,
        fileSize: file.size,
        uploadedById: req.user!.id
      },
      include: {
        uploadedBy: {
          select: { id: true, name: true, slug: true }
        }
      }
    });

    // Clean up temp file
    fs.unlinkSync(file.filepath);

    return res.status(201).json({
      message: 'Overlay created successfully',
      overlay
    });
  } catch (error) {
    console.error('Error creating overlay:', error);
    return res.status(500).json({ error: 'Failed to create overlay' });
  }
}

export default requireAdmin(handler);

// pages/api/map-overlays/[id].ts
// Get, update, and delete individual map overlays (Admin only)

import { NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin, AuthenticatedRequest } from '../../../lib/auth/middleware';

const prisma = new PrismaClient();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const BUCKET_NAME = 'map-overlays';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid overlay ID' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, id);
  } else if (req.method === 'PATCH') {
    return handlePatch(req, res, id);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res, id);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

// GET /api/map-overlays/[id] - Get overlay details
async function handleGet(req: AuthenticatedRequest, res: NextApiResponse, id: string) {
  try {
    const { download } = req.query;

    const overlay = await prisma.mapOverlay.findUnique({
      where: { id },
      include: {
        uploadedBy: {
          select: { id: true, name: true, slug: true }
        }
      }
    });

    if (!overlay) {
      return res.status(404).json({ error: 'Overlay not found' });
    }

    // If download requested, fetch the GeoJSON from storage
    if (download === 'true') {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .download(overlay.storagePath);

      if (error) {
        console.error('Storage download error:', error);
        return res.status(500).json({ error: 'Failed to download overlay file' });
      }

      const geojson = await data.text();

      return res.status(200).json({
        overlay,
        geojson: JSON.parse(geojson)
      });
    }

    return res.status(200).json({ overlay });
  } catch (error) {
    console.error('Error fetching overlay:', error);
    return res.status(500).json({ error: 'Failed to fetch overlay' });
  }
}

// PATCH /api/map-overlays/[id] - Update overlay
async function handlePatch(req: AuthenticatedRequest, res: NextApiResponse, id: string) {
  try {
    const overlay = await prisma.mapOverlay.findUnique({
      where: { id }
    });

    if (!overlay) {
      return res.status(404).json({ error: 'Overlay not found' });
    }

    const { name, description, isVisible, fillColor, fillOpacity, strokeColor, strokeWidth } = req.body;

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isVisible !== undefined) updateData.isVisible = isVisible;
    if (fillColor !== undefined) updateData.fillColor = fillColor;
    if (fillOpacity !== undefined) updateData.fillOpacity = fillOpacity;
    if (strokeColor !== undefined) updateData.strokeColor = strokeColor;
    if (strokeWidth !== undefined) updateData.strokeWidth = strokeWidth;

    const updatedOverlay = await prisma.mapOverlay.update({
      where: { id },
      data: updateData,
      include: {
        uploadedBy: {
          select: { id: true, name: true, slug: true }
        }
      }
    });

    return res.status(200).json({
      message: 'Overlay updated successfully',
      overlay: updatedOverlay
    });
  } catch (error) {
    console.error('Error updating overlay:', error);
    return res.status(500).json({ error: 'Failed to update overlay' });
  }
}

// DELETE /api/map-overlays/[id] - Delete overlay
async function handleDelete(_req: AuthenticatedRequest, res: NextApiResponse, id: string) {
  try {
    const overlay = await prisma.mapOverlay.findUnique({
      where: { id }
    });

    if (!overlay) {
      return res.status(404).json({ error: 'Overlay not found' });
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([overlay.storagePath]);

    if (storageError) {
      console.error('Storage delete error:', storageError);
      // Continue with database deletion even if storage fails
    }

    // Delete from database
    await prisma.mapOverlay.delete({
      where: { id }
    });

    return res.status(200).json({ message: 'Overlay deleted successfully' });
  } catch (error) {
    console.error('Error deleting overlay:', error);
    return res.status(500).json({ error: 'Failed to delete overlay' });
  }
}

export default requireAdmin(handler);

// pages/api/jumps/import/confirm.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../../lib/auth/middleware';
import { PrismaClient, DeviceState, UserRole } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Validation schema for the request body
const confirmSchema = z.object({
  hash: z.string(),
  jumpNumber: z.number().int().positive().optional(),
  notes: z.string().nullable().optional(),
  targetUserId: z.string().optional(),
});

declare global {
  var importCache: Map<string, {
    buffer: Buffer;
    originalFileName: string;
    userId: string;
    targetUserId: string;
    timestamp: number;
  }>;
}

export default withAuth(async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate request body
    const body = confirmSchema.parse(req.body);

    // Retrieve cached data
    const cachedData = global.importCache?.get(body.hash);
    
    if (!cachedData) {
      return res.status(400).json({ 
        error: 'Import session expired. Please upload the file again.' 
      });
    }

    // Verify the cached data belongs to this import session
    if (cachedData.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Determine the target user
    const targetUserId = body.targetUserId || cachedData.targetUserId;

    // Validate admin permission if importing for another user
    const isAdmin = req.user!.role === UserRole.ADMIN || req.user!.role === UserRole.SUPER_ADMIN;
    if (targetUserId !== req.user!.id && !isAdmin) {
      return res.status(403).json({ 
        error: 'Only administrators can import jumps on behalf of other users' 
      });
    }

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, nextJumpNumber: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    // Get or create a manual import device for the TARGET user
    let manualDevice = await prisma.device.findFirst({
      where: {
        ownerId: targetUserId,
        name: 'Manual Import',
      },
    });

    if (!manualDevice) {
      manualDevice = await prisma.device.create({
        data: {
          bluetoothId: `manual-${targetUserId}`,
          name: 'Manual Import',
          state: DeviceState.ACTIVE,
          ownerId: targetUserId,
          lastSeen: new Date(),
        },
      });
      console.log(`[IMPORT] Created Manual Import device for user ${targetUser.name}`);
    }

    // Upload to Supabase Storage - same pattern as bluetooth scanner
    const storagePath = `${targetUserId}/${manualDevice.id}/${body.hash}.log`;
    console.log(`[IMPORT] Uploading to Supabase Storage: ${storagePath}`);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('jump-logs')
      .upload(storagePath, cachedData.buffer, {
        contentType: 'application/octet-stream',
        upsert: false
      });
    
    if (uploadError) {
      throw new Error(`Failed to upload to storage: ${uploadError.message}`);
    }

    console.log(`[IMPORT] Successfully uploaded to storage`);
    
    // Get the storage URL
    const storageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/jump-logs/${storagePath}`;

    // Handle jump number - either use provided or auto-increment for TARGET user
    let jumpNumber = body.jumpNumber;
    
    if (jumpNumber) {
      // If a specific jump number provided, update nextJumpNumber if needed
      await prisma.user.update({
        where: { id: targetUserId },
        data: {
          nextJumpNumber: Math.max(jumpNumber + 1, targetUser.nextJumpNumber)
        }
      });
    } else {
      // Use and increment the TARGET user's nextJumpNumber
      const updatedUser = await prisma.user.update({
        where: { id: targetUserId },
        data: {
          nextJumpNumber: { increment: 1 }
        },
        select: {
          nextJumpNumber: true
        }
      });
      jumpNumber = updatedUser.nextJumpNumber - 1;
    }

    // Create the jump log entry for the TARGET user
    const jumpLog = await prisma.jumpLog.create({
      data: {
        hash: body.hash,
        jumpNumber: jumpNumber,
        storageUrl: storageUrl,
        storagePath: storagePath,
        fileSize: cachedData.buffer.length,
        mimeType: 'application/octet-stream',
        deviceId: manualDevice.id,
        userId: targetUserId, // Jump belongs to target user
        offsets: {}, // Will be populated by analysis worker
        flags: {
          originalFileName: cachedData.originalFileName,
          uploadedAt: new Date().toISOString(),
          manualImport: true,
          importedBy: req.user!.id !== targetUserId ? req.user!.id : undefined, // Track admin import
        },
        visibleToConnections: true,
        notes: body.notes || null,
        // Analysis fields left null - worker will populate
      },
    });

    console.log(`[IMPORT] Created JumpLog with ID ${jumpLog.id} for user ${targetUser.name} (${targetUserId})`);
    console.log(`[IMPORT]   - Jump number: ${jumpNumber}`);
    console.log(`[IMPORT]   - Storage path: ${storagePath}`);
    console.log(`[IMPORT]   - File size: ${cachedData.buffer.length} bytes`);
    if (req.user!.id !== targetUserId) {
      console.log(`[IMPORT]   - Imported by admin: ${req.user!.name} (${req.user!.id})`);
    }

    // Clean up the cached data
    global.importCache.delete(body.hash);

    return res.status(200).json({
      message: `Jump imported successfully for ${targetUser.name}`,
      jumpId: jumpLog.id,
    });

  } catch (error) {
    console.error('[IMPORT] Error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error });
    }
    
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to save jump' 
    });
  }
});
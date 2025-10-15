// pages/api/jumps/import/index.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../../lib/auth/middleware';
import { LogParser } from '../../../../lib/analysis/log-parser';
import formidable from 'formidable';
import { createReadStream } from 'fs';
import crypto from 'crypto';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

export const config = {
  api: {
    bodyParser: false, // We need to use formidable for file uploads
  },
};

interface ParsedFormData {
  fields: formidable.Fields;
  files: formidable.Files;
}

async function parseForm(req: NextApiRequest): Promise<ParsedFormData> {
  const form = formidable({
    maxFileSize: 16 * 1024 * 1024, // 16MB limit
    keepExtensions: true,
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
      } else {
        resolve({ fields, files });
      }
    });
  });
}

export default withAuth(async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse the multipart form data
    const { fields, files } = await parseForm(req);
    
    // Get the uploaded file
    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
    
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Get targetUserId from fields if provided
    const targetUserIdField = Array.isArray(fields.targetUserId) 
      ? fields.targetUserId[0] 
      : fields.targetUserId;
    const targetUserId = targetUserIdField || req.user!.id;

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
      select: { id: true, name: true, nextJumpNumber: true, isProxy: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    // Read the file content
    const fileBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(uploadedFile.filepath);
      
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });

    // Validate the log file structure
    const validation = LogParser.validateLog(fileBuffer);
    
    if (!validation.isValid) {
      return res.status(400).json({ 
        error: `Invalid log file: ${validation.message}` 
      });
    }
    
    // Compute hash
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    console.log(`[IMPORT] File hash: ${hash.substring(0, 16)}...`);

    // Check if we already have this jump log
    const existingJumpLog = await prisma.jumpLog.findUnique({
      where: { hash },
    });

    if (existingJumpLog) {
      // If it belongs to the target user, just return success
      if (existingJumpLog.userId === targetUserId) {
        return res.status(200).json({
          message: 'This jump log already exists for this user',
          existingJumpId: existingJumpLog.id,
          alreadyExists: true,
        });
      } else {
        return res.status(400).json({ 
          error: 'This jump log already exists and belongs to another user' 
        });
      }
    }

    // Get original filename from upload
    const originalFileName = uploadedFile.originalFilename || 'manual-upload.dat';

    // Store the file buffer temporarily with target user info
    global.importCache = global.importCache || new Map();
    global.importCache.set(hash, {
      buffer: fileBuffer,
      originalFileName: originalFileName,
      userId: req.user!.id, // Who initiated the import
      targetUserId: targetUserId, // Who the jump is for
      timestamp: Date.now(),
    });

    // Clean up old entries (older than 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [key, value] of global.importCache.entries()) {
      if (value.timestamp < oneHourAgo) {
        global.importCache.delete(key);
      }
    }

    console.log(`[IMPORT] File uploaded by ${req.user!.name} for user ${targetUser.name} (${targetUserId})`);

    return res.status(200).json({
      message: 'File uploaded successfully',
      fileInfo: {
        hash: hash,
        fileName: originalFileName,
        fileSize: fileBuffer.length,
        suggestedJumpNumber: targetUser.nextJumpNumber,
        targetUserId: targetUserId,
        targetUserName: targetUser.name,
        // Include validation data if available
        startDate: validation.startDate?.toISOString() || null,
        startLocation: validation.startLocation || null,
      },
    });

  } catch (error) {
    console.error('[IMPORT] Error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to process file' 
    });
  }
});
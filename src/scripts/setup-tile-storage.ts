// scripts/setup-tile-storage.ts
// Creates the map-tiles storage bucket for caching OSM tiles

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const BUCKET_NAME = 'map-tiles';

async function setupTileStorage() {
  try {
    // First check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.error('Error listing buckets:', listError);
      throw listError;
    }

    const bucketExists = buckets?.some(bucket => bucket.name === BUCKET_NAME);

    if (bucketExists) {
      console.log(`Bucket "${BUCKET_NAME}" already exists`);
      return;
    }

    // Create bucket if it doesn't exist
    console.log(`Creating bucket "${BUCKET_NAME}"...`);
    const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: false, // Tiles are served through our API, not directly
      fileSizeLimit: 262144, // 256KB limit per tile (tiles are usually 10-50KB)
      allowedMimeTypes: ['image/png']
    });

    if (error) {
      console.error('Error creating bucket:', error);
      throw error;
    }

    console.log('Storage bucket created successfully:', data);
    console.log('\nThe map-tiles bucket is ready for caching OSM tiles.');
    console.log('Tiles will be automatically cached when requested through /api/tiles/{z}/{x}/{y}.png');

  } catch (error) {
    console.error('Setup failed:', error);
    throw error;
  }
}

// Run the setup
setupTileStorage()
  .then(() => {
    console.log('\nTile storage setup completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nTile storage setup failed:', error);
    process.exit(1);
  });

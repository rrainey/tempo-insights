// scripts/setup-overlay-storage.ts
// Creates the map-overlays storage bucket for GeoJSON overlay files

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const BUCKET_NAME = 'map-overlays';

async function setupOverlayStorage() {
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
      public: false, // Overlays are served through our API, not directly
      fileSizeLimit: 10485760, // 10MB limit per GeoJSON file
      allowedMimeTypes: ['application/json', 'application/geo+json']
    });

    if (error) {
      console.error('Error creating bucket:', error);
      throw error;
    }

    console.log('Storage bucket created successfully:', data);
    console.log('\nThe map-overlays bucket is ready for storing GeoJSON overlay files.');
    console.log('Overlays can be uploaded through the admin interface at /map-overlays');

  } catch (error) {
    console.error('Setup failed:', error);
    throw error;
  }
}

// Run the setup
setupOverlayStorage()
  .then(() => {
    console.log('\nOverlay storage setup completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nOverlay storage setup failed:', error);
    process.exit(1);
  });

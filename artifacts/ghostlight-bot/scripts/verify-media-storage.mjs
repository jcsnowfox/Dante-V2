import 'dotenv/config';

function pass(message) {
  console.log(`[verify:media-storage] PASS ${message}`);
}

function warn(message) {
  console.warn(`[verify:media-storage] WARN ${message}`);
}

function fail(message) {
  console.error(`[verify:media-storage] FAIL ${message}`);
  process.exitCode = 1;
}

async function main() {
  // Check bucket config
  const bucketName = process.env.BUCKET || process.env.BUCKET_NAME || process.env.TIGRIS_BUCKET_NAME || process.env.AWS_BUCKET;
  const accessKeyId = process.env.ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const endpoint = process.env.ENDPOINT || process.env.AWS_ENDPOINT_URL_S3;
  const localDir = process.env.MEDIA_STORAGE_DIR;

  if (bucketName) {
    pass(`Bucket name configured: ${bucketName}`);
    if (!accessKeyId) {
      fail('Bucket name set but ACCESS_KEY_ID/AWS_ACCESS_KEY_ID is missing');
    } else {
      pass('accessKeyId is configured');
    }
    if (!secretAccessKey) {
      fail('Bucket name set but SECRET_ACCESS_KEY/AWS_SECRET_ACCESS_KEY is missing');
    } else {
      pass('secretAccessKey is configured');
    }
    if (!endpoint) {
      warn('ENDPOINT/AWS_ENDPOINT_URL_S3 is not set — using AWS default endpoint (OK for AWS S3)');
    } else {
      pass(`endpoint configured: ${endpoint}`);
    }
  } else if (localDir) {
    pass(`Local filesystem storage configured: ${localDir}`);
  } else {
    fail('No storage configured — set BUCKET/BUCKET_NAME/TIGRIS_BUCKET_NAME/AWS_BUCKET or MEDIA_STORAGE_DIR');
  }

  // Check image storage prefix
  const imgPrefix = process.env.IMAGE_GENERATION_BUCKET_PREFIX || 'generated-images';
  pass(`Image bucket prefix: ${imgPrefix}`);

  // Check audio storage prefix
  const audioPrefix = process.env.AUDIO_BUCKET_PREFIX || 'generated-audio';
  pass(`Audio bucket prefix: ${audioPrefix}`);

  if (!process.exitCode) {
    console.log('[verify:media-storage] All checks passed.');
  }
}

main().catch((error) => {
  console.error('[verify:media-storage] Unexpected error:', error.message);
  process.exit(1);
});

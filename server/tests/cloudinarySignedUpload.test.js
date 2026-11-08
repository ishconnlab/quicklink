import assert from 'node:assert/strict';
import test from 'node:test';

test('Cloudinary uploads support foldered assets and folderless image uploads', async (t) => {
  process.env.CLOUDINARY_CLOUD_NAME = ' test-cloud ';
  process.env.CLOUDINARY_API_KEY = ' test-api-key ';
  process.env.CLOUDINARY_API_SECRET = ' test-api-secret ';
  process.env.CLOUDINARY_FOLDER_PREFIX = ' quicklink ';

  const [{ uploadCloudinaryBuffer }, { v2: cloudinary }] = await Promise.all([
    import('../src/services/cloudinary.js'),
    import('cloudinary'),
  ]);
  const originalUpload = cloudinary.uploader.upload_stream;

  try {
    await t.test('preserves explicit folders for other asset uploads', async () => {
      let captured;
      cloudinary.uploader.upload_stream = (options, callback) => {
        captured = { options, credentials: cloudinary.config() };
        return {
          end() {
            callback(null, {
              public_id: 'quicklink/course-thumbnails/test-image',
              resource_type: 'image',
              secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/test-image.jpg',
              bytes: 3,
            });
          },
        };
      };

      const result = await uploadCloudinaryBuffer({
        buffer: Buffer.from('img'),
        folder: 'quicklink/course-thumbnails',
        resourceType: 'image',
      });
      assert.equal(captured.credentials.cloud_name, 'test-cloud');
      assert.equal(captured.credentials.api_key, 'test-api-key');
      assert.equal(captured.credentials.api_secret, 'test-api-secret');
      assert.equal(captured.options.folder, 'quicklink/course-thumbnails');
      assert.equal('overwrite' in captured.options, false);
      assert.equal('invalidate' in captured.options, false);
      assert.equal('unique_filename' in captured.options, false);
      assert.equal(result.publicId, 'quicklink/course-thumbnails/test-image');
      assert.equal(result.secureUrl, 'https://res.cloudinary.com/test-cloud/image/upload/test-image.jpg');
    });

    await t.test('omits the folder parameter when explicitly disabled', async () => {
      let captured;
      cloudinary.uploader.upload_stream = (options, callback) => {
        captured = options;
        return {
          end() {
            callback(null, {
              public_id: 'lesson-image',
              resource_type: 'image',
              secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/lesson-image.jpg',
              bytes: 3,
            });
          },
        };
      };

      const result = await uploadCloudinaryBuffer({
        buffer: Buffer.from('img'),
        folder: null,
        resourceType: 'image',
        publicId: 'lesson-image',
      });
      assert.equal('folder' in captured, false);
      assert.equal(result.publicId, 'lesson-image');
      assert.equal(result.folder, '');
    });
  } finally {
    cloudinary.uploader.upload_stream = originalUpload;
  }
});

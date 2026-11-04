import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import config from '../config/env.js';

export function validateCloudinaryConfig({ required = false } = {}) {
  const missing = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
    .filter((name) => !process.env[name]);

  if (missing.length > 0 && required) {
    throw new Error(`Missing required Cloudinary environment variables: ${missing.join(', ')}`);
  }

  if (missing.length > 0 && process.env.CLOUDINARY_CLOUD_NAME) {
    console.warn('[storage] Cloudinary is only partially configured; uploads will fall back to the local filesystem.');
  }

  return Boolean(config.cloudinary.enabled);
}

export function getCloudinarySdk() {
  if (!config.cloudinary.enabled) return null;
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
  return cloudinary;
}

export async function uploadCloudinaryBuffer({ buffer, folder, resourceType = 'auto', publicId, overwrite = false }) {
  const sdk = getCloudinarySdk();
  if (!sdk || !buffer) return null;

  const resolvedFolder = folder || config.cloudinary.folderPrefix || 'quicklink';
  const resolvedPublicId = publicId || `${Date.now()}-${randomUUID()}`;

  return new Promise((resolve, reject) => {
    const uploadStream = sdk.uploader.upload_stream({
      folder: resolvedFolder,
      public_id: resolvedPublicId,
      resource_type: resourceType,
      overwrite,
      unique_filename: true,
      invalidate: true,
    }, (error, result) => {
      if (error) return reject(error);
      resolve({
        publicId: result?.public_id ?? resolvedPublicId,
        resourceType: result?.resource_type ?? resourceType,
        format: result?.format ?? '',
        bytes: result?.bytes ?? buffer.length,
        url: result?.secure_url ?? result?.url ?? '',
        secureUrl: result?.secure_url ?? result?.url ?? '',
        version: result?.version,
        folder: result?.folder ?? resolvedFolder,
      });
    });

    uploadStream.end(buffer);
  });
}

export async function deleteCloudinaryAsset({ publicId, resourceType = 'image' }) {
  const sdk = getCloudinarySdk();
  if (!sdk || !publicId) return false;
  const result = await sdk.uploader.destroy(publicId, { resource_type: resourceType });
  return Boolean(result?.result === 'ok' || result?.result === 'not found');
}

export function resolveCloudinaryAssetUrl(publicId, resourceType = 'image') {
  const sdk = getCloudinarySdk();
  if (!sdk || !publicId) return '';
  return sdk.url(publicId, { resource_type: resourceType, secure: true, sign_url: false });
}

export default {
  validateCloudinaryConfig,
  getCloudinarySdk,
  uploadCloudinaryBuffer,
  deleteCloudinaryAsset,
  resolveCloudinaryAssetUrl,
};

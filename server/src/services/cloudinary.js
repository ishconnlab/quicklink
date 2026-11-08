import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import config from '../config/env.js';

export function validateCloudinaryConfig({ required = false } = {}) {
  const missing = [
    ['CLOUDINARY_CLOUD_NAME', config.cloudinary.cloudName],
    ['CLOUDINARY_API_KEY', config.cloudinary.apiKey],
    ['CLOUDINARY_API_SECRET', config.cloudinary.apiSecret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0 && required) {
    throw new Error(`Missing required Cloudinary environment variables: ${missing.join(', ')}`);
  }

  if (missing.length > 0 && config.cloudinary.cloudName) {
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

export async function uploadCloudinaryBuffer({ buffer, folder, resourceType = 'auto', publicId }) {
  if (!buffer) return null;
  const sdk = getCloudinarySdk();
  if (!sdk) return null;

  const resolvedFolder = folder === undefined ? config.cloudinary.folderPrefix || 'quicklink' : folder;
  const resolvedPublicId = publicId || `${Date.now()}-${randomUUID()}`;

  return new Promise((resolve, reject) => {
    const options = {
      public_id: resolvedPublicId,
      resource_type: resourceType,
      ...(resolvedFolder ? { folder: resolvedFolder } : {}),
    };
    const callback = (error, result) => {
      if (error) return reject(error);
      resolve({
        publicId: result?.public_id ?? resolvedPublicId,
        resourceType: result?.resource_type ?? resourceType,
        format: result?.format ?? '',
        bytes: result?.bytes ?? buffer.length,
        url: result?.secure_url ?? result?.url ?? '',
        secureUrl: result?.secure_url ?? result?.url ?? '',
        version: result?.version,
        folder: result?.folder ?? resolvedFolder ?? '',
      });
    };
    sdk.uploader.upload_stream(options, callback).end(buffer);
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

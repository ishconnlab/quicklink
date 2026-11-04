import {
  deleteCloudinaryAsset,
  resolveCloudinaryAssetUrl,
  uploadCloudinaryBuffer,
  validateCloudinaryConfig,
} from './cloudinary.js';

export function getStorageProvider() {
  return validateCloudinaryConfig() ? 'cloudinary' : 'local';
}

export async function uploadAsset({ buffer, folder, resourceType = 'auto', originalName, publicId }) {
  if (!buffer) throw new Error('Missing upload buffer');

  if (validateCloudinaryConfig()) {
    const result = await uploadCloudinaryBuffer({ buffer, folder, resourceType, publicId });
    return {
      provider: 'cloudinary',
      publicId: result?.publicId ?? publicId ?? originalName,
      resourceType,
      url: result?.secureUrl ?? result?.url ?? '',
      secureUrl: result?.secureUrl ?? result?.url ?? '',
      format: result?.format || '',
      bytes: result?.bytes || buffer.length,
      fileName: originalName || publicId || 'upload',
    };
  }

  return {
    provider: 'local',
    publicId: publicId || originalName || 'upload',
    resourceType,
    url: '',
    secureUrl: '',
    format: '',
    bytes: buffer.length,
    fileName: originalName || publicId || 'upload',
  };
}

export async function deleteAsset({ publicId, resourceType = 'image' }) {
  if (publicId && validateCloudinaryConfig()) {
    return deleteCloudinaryAsset({ publicId, resourceType });
  }
  return false;
}

export function resolveAssetUrl(publicId, resourceType = 'image') {
  if (!publicId) return '';
  return validateCloudinaryConfig() ? resolveCloudinaryAssetUrl(publicId, resourceType) : '';
}

export default {
  getStorageProvider,
  uploadAsset,
  deleteAsset,
  resolveAssetUrl,
  validateCloudinaryConfig,
};

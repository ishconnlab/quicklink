import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { assetUrl } from '../api/client.js';

export default function CourseThumbnail({ imageUrl, title, className = '', loading = 'lazy' }) {
  const src = assetUrl(imageUrl);
  const [failedSrc, setFailedSrc] = useState('');
  const showImage = src && failedSrc !== src;

  return <div className={`relative overflow-hidden bg-gradient-to-br from-brand-700 via-orange-600 to-amber-500 ${className}`}>
    {showImage && <img src={src} alt={`Cover for ${title}`} loading={loading} className="h-full w-full object-cover" onError={() => setFailedSrc(src)} />}
    {!showImage && <div role="img" aria-label={src ? `Cover unavailable for ${title}` : `No cover uploaded for ${title}`} className="absolute inset-0 flex items-center justify-center text-white/90"><GraduationCap size={42} aria-hidden="true" /></div>}
  </div>;
}

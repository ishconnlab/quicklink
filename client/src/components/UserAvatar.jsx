import { useEffect, useState } from 'react';

export default function UserAvatar({ name, imageUrl = '', className = 'h-9 w-9', textClassName = 'text-xs' }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [imageUrl]);

  return <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-700 font-bold text-white ${textClassName} ${className}`} aria-hidden="true">
    {imageUrl && !imageFailed
      ? <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setImageFailed(true)} />
      : (name?.trim()?.slice(0, 1)?.toUpperCase() || '?')}
  </span>;
}

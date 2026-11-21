const SUPPORTED_HOSTS = new Set(['github.com', 'gist.github.com', 'drive.google.com', 'docs.google.com']);

export function isSupportedProjectLink(value) {
  let url;
  try { url = new URL(value); }
  catch { return false; }
  return url.protocol === 'https:' && SUPPORTED_HOSTS.has(url.hostname.toLowerCase());
}

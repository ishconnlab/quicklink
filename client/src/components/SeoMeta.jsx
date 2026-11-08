import { useEffect } from 'react';

export const SITE_URL = 'https://quicklink.ishconnect.rw';
export const SITE_NAME = 'QuickLink by IshConnect';
export const ORGANIZATION_SCHEMA = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#ishconnect`,
  name: 'IshConnect',
  url: 'https://www.ishconnect.rw/',
};

const ensureMeta = (selector, attribute, key, value) => {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', value);
};

export default function SeoMeta({ title, description, path = '/', noIndex = false, image = `${SITE_URL}/og-quicklink.svg`, type = 'website', jsonLd }) {
  useEffect(() => {
    const canonicalUrl = new URL(path, SITE_URL).toString();
    document.title = title;
    ensureMeta('meta[name="description"]', 'name', 'description', description);
    ensureMeta('meta[name="robots"]', 'name', 'robots', noIndex ? 'noindex, follow' : 'index, follow, max-image-preview:large');
    ensureMeta('meta[property="og:type"]', 'property', 'og:type', type);
    ensureMeta('meta[property="og:site_name"]', 'property', 'og:site_name', SITE_NAME);
    ensureMeta('meta[property="og:title"]', 'property', 'og:title', title);
    ensureMeta('meta[property="og:description"]', 'property', 'og:description', description);
    ensureMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    ensureMeta('meta[property="og:image"]', 'property', 'og:image', image);
    ensureMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', 'QuickLink by IshConnect, online technology learning from Kigali, Rwanda');
    ensureMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    ensureMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    ensureMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    ensureMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = canonicalUrl;
    let script = document.head.querySelector('script[data-quicklink-schema]');
    if (jsonLd) {
      if (!script) { script = document.createElement('script'); script.type = 'application/ld+json'; script.dataset.quicklinkSchema = 'true'; document.head.appendChild(script); }
      script.textContent = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
    } else script?.remove();
  }, [description, image, jsonLd, noIndex, path, title, type]);
  return null;
}

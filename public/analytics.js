/* Google Analytics 4, loaded only when the dashboard has been given a
   measurement ID — and never during an admin draft preview, so looking at
   unpublished work does not show up as a visit. The tag lives in this file
   rather than inline in every page: the site's CSP allows no inline scripts. */

window.initAnalytics = function initAnalytics(cfg) {
  const id = String((cfg && cfg.measurementId) || '').trim();
  // A malformed value would load a script URL built from arbitrary text, so
  // nothing is loaded unless it looks like a real GA4 measurement ID.
  if (!/^G-[A-Z0-9]+$/i.test(id)) return;
  if (window.__gaStarted) return;
  window.__gaStarted = true;

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(tag);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', id, { anonymize_ip: true });
};

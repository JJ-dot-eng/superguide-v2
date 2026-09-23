// Google Analytics runs only on the published GitHub Pages site, never on
// local previews. Page views come from GA itself; this adds a view event.
const MEASUREMENT_ID = 'G-5XFT3VQ054';

export function initAnalytics(win = window, doc = document) {
  const { protocol, hostname, pathname } = win.location;
  const published = protocol === 'https:' && hostname === 'jj-dot-eng.github.io' && (pathname === '/superguide' || pathname.startsWith('/superguide/'));
  if (!published) return () => {};

  win.dataLayer = win.dataLayer || [];
  win.gtag = win.gtag || function gtag() { win.dataLayer.push(arguments); };
  win.gtag('js', new Date());
  win.gtag('config', MEASUREMENT_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const script = doc.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  doc.head.appendChild(script);

  // Keep the previous site's feature names so existing reports stay continuous.
  const feature = { arsenal: 'catalog', enemy: 'combat', demolition: 'demolition', factions: 'factions' };
  let last;
  return view => {
    if (!feature[view] || view === last) return;
    last = view;
    win.gtag('event', 'view_feature', { feature: feature[view], send_to: MEASUREMENT_ID });
  };
}

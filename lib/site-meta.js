(function initSiteMetaModule(global) {
  const DEFAULTS = {
    gtmId: 'GTM-MV8KQGJF',
    adsClient: 'ca-pub-6634731722045607',
    locale: 'ko_KR',
    twitterCard: 'summary',
  };

  function ensureMeta(attr, key, content) {
    if (!content) return;
    const selector = attr === 'name'
      ? `meta[name="${key}"]`
      : `meta[property="${key}"]`;

    let el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function ensureCanonical(url) {
    if (!url) return;
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  function ensureScript(src, attrs) {
    if (!src) return;
    let script = Array.from(document.scripts).find((s) => s.src === src);
    if (script) return;

    script = document.createElement('script');
    script.src = src;
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === true) script.setAttribute(k, '');
      else if (v !== false && v != null) script.setAttribute(k, String(v));
    });
    document.head.appendChild(script);
  }

  function ensureGtm(gtmId) {
    if (!gtmId) return;

    if (!global.dataLayer) global.dataLayer = [];
    const exists = global.dataLayer.some(
      (x) => x && x.event === 'gtm.js' && typeof x['gtm.start'] === 'number'
    );
    if (!exists) {
      global.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    }

    const gtmSrc = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
    ensureScript(gtmSrc, { async: true });

    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => ensureGtmNoScript(gtmId), { once: true });
    } else {
      ensureGtmNoScript(gtmId);
    }
  }

  function ensureGtmNoScript(gtmId) {
    if (!gtmId || !document.body) return;
    if (document.getElementById('oc-gtm-noscript')) return;

    const wrapper = document.createElement('noscript');
    wrapper.id = 'oc-gtm-noscript';

    const iframe = document.createElement('iframe');
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(gtmId)}`;
    iframe.height = '0';
    iframe.width = '0';
    iframe.style.display = 'none';
    iframe.style.visibility = 'hidden';

    wrapper.appendChild(iframe);
    document.body.insertBefore(wrapper, document.body.firstChild);
  }

  function ensureAdSense(client) {
    if (!client) return;
    const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    ensureScript(src, { async: true, crossorigin: 'anonymous' });
  }

  function applySeo(options) {
    const title = options.title || document.title;
    const description = options.description;
    const url = options.url || global.location.href;
    const locale = options.locale || DEFAULTS.locale;

    if (title) document.title = title;

    ensureCanonical(url);

    ensureMeta('name', 'description', description);
    ensureMeta('property', 'og:title', title);
    ensureMeta('property', 'og:description', description);
    ensureMeta('property', 'og:url', url);
    ensureMeta('property', 'og:type', options.ogType || 'website');
    ensureMeta('property', 'og:locale', locale);

    ensureMeta('name', 'twitter:card', options.twitterCard || DEFAULTS.twitterCard);
    ensureMeta('name', 'twitter:title', title);
    ensureMeta('name', 'twitter:description', description);
  }

  function initSiteMeta(config) {
    const options = Object.assign({}, DEFAULTS, config || {});
    applySeo(options);
    ensureGtm(options.gtmId);
    ensureAdSense(options.adsClient);
  }

  global.SiteMeta = {
    init: initSiteMeta,
    applySeo,
    ensureGtm,
    ensureAdSense,
  };
})(window);

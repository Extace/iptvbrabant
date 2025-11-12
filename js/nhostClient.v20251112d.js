// Resilient Nhost client bootstrap for static hosting (no build tool).
// We attempt multiple ESM CDNs because some may send incorrect MIME types via your edge cache.
// If all imports fail, we leave a stub so the site still works (order save just won't persist).

const NHOST_SUBDOMAIN = 'yvkysucfvqxfaqbyeggp';
const NHOST_REGION = 'eu-west-2';

async function loadNhostClient() {
  const sources = [
    'https://esm.sh/@nhost/nhost-js@latest',
    'https://unpkg.com/@nhost/nhost-js@latest/dist/nhost-js.esm.js',
    // jsDelivr path (kept last due to current MIME/CORS issue):
    'https://cdn.jsdelivr.net/npm/@nhost/nhost-js@latest/dist/nhost-js.esm.js'
  ];
  for (const src of sources) {
    try {
      const mod = await import(src);
      if (mod?.NhostClient) {
        return mod.NhostClient;
      }
    } catch (e) {
      console.warn('[nhost] import failed for', src, e);
    }
  }
  return null;
}

(async () => {
  console.info('[nhost] client build tag', '20251112c');
  // On your production domain behind Cloudflare, skip CDN module imports to avoid noisy CORS/MIME errors
  const FORCE_FALLBACK = (() => {
    try {
      const h = (location.hostname || '').toLowerCase();
      if (!h) return false;
      if (h === 'iptvbrabant.work' || h === 'www.iptvbrabant.work') return true;
      // Allow forcing via query param for testing: ?nhost=fallback
      const q = new URLSearchParams(location.search);
      if ((q.get('nhost') || '').toLowerCase() === 'fallback') return true;
      return false;
    } catch(_) { return false; }
  })();

  if (FORCE_FALLBACK) {
    console.warn('[nhost] Skipping CDN imports on this domain; using direct GraphQL fallback.');
    // New Nhost public endpoint pattern uses service + region: <sub>.graphql.<region>.nhost.run
    // Force DIRECT Nhost in production; ignore any proxy to avoid cached/stale worker issues.
    let endpointBase = `https://${NHOST_SUBDOMAIN}.graphql.${NHOST_REGION}.nhost.run`;
    try {
      if (typeof window !== 'undefined' && window.NHOST_PROXY_URL_BASE) {
        console.warn('[nhost] Proxy URL present but ignored on production; using direct Nhost endpoint.');
      }
    } catch(_) {}
    // GraphQL lives on /v1 (not /v1/graphql) for the service endpoint
    const GQL_ENDPOINT = `${endpointBase}/v1`;
  console.info('[nhost] GraphQL endpoint (fallback):', GQL_ENDPOINT, 'from origin', location.origin);
    const mutation = `mutation InsertOrder($object: orders_insert_input!) {\n  insert_orders_one(object: $object) { id }\n}`;
    window.saveOrderNhost = async (order) => {
      try {
        const res = await fetch(GQL_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Be explicit: ensure Hasura treats this as an anonymous call
            'x-hasura-role': 'anonymous'
          },
          body: JSON.stringify({ query: mutation, variables: { object: order } })
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch(_) {}
        if (!res.ok || (json && json.errors)) {
          console.warn('[nhost] fallback insert failed', json?.errors || `status ${res.status}: ${text || '<empty body>'}`);
          return { ok: false, error: json?.errors || `status ${res.status}: ${text || '<empty body>'}` };
        }
        const id = json?.data?.insert_orders_one?.id;
        console.log('[nhost] insert success (fallback)', id);
        return { ok: true, id };
      } catch (e) {
        console.warn('[nhost] network/parse error fallback', e);
        return { ok: false, error: e };
      }
    };
    return; // done; using fallback only
  }

  const NhostClient = await loadNhostClient();
  if (!NhostClient) {
    console.warn('[nhost] All CDN imports failed; enabling direct GraphQL fallback (anonymous).');
    // Direct GraphQL endpoint pattern (current): https://<sub>.graphql.<region>.nhost.run/v1
    let endpointBase2 = `https://${NHOST_SUBDOMAIN}.graphql.${NHOST_REGION}.nhost.run`;
    try {
      if (typeof window !== 'undefined' && window.NHOST_PROXY_URL_BASE) {
        console.warn('[nhost] Proxy URL present but ignored on production; using direct Nhost endpoint.');
      }
    } catch(_) {}
    const GQL_ENDPOINT = `${endpointBase2}/v1`;
  console.info('[nhost] GraphQL endpoint (fallback after import fail):', GQL_ENDPOINT, 'from origin', location.origin);
    const mutation = `mutation InsertOrder($object: orders_insert_input!) {\n  insert_orders_one(object: $object) { id }\n}`;
    window.saveOrderNhost = async (order) => {
      try {
        const res = await fetch(GQL_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json', // no admin secret for security
            'x-hasura-role': 'anonymous'
          },
          body: JSON.stringify({ query: mutation, variables: { object: order } })
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch(_) {}
        if (!res.ok || (json && json.errors)) {
          console.warn('[nhost] fallback insert failed', json?.errors || `status ${res.status}: ${text || '<empty body>'}`);
          return { ok: false, error: json?.errors || `status ${res.status}: ${text || '<empty body>'}` };
        }
        const id = json?.data?.insert_orders_one?.id;
        console.log('[nhost] insert success (fallback)', id);
        return { ok: true, id };
      } catch (e) {
        console.warn('[nhost] network/parse error fallback', e);
        return { ok: false, error: e };
      }
    };
    return; // done; using fallback only
  }
  const nhost = new NhostClient({ subdomain: NHOST_SUBDOMAIN, region: NHOST_REGION });
  window.nhost = nhost;
  window.saveOrderNhost = async function(order) {
    try {
      if (!window.nhost) return { ok: false, error: 'Client missing' };
      const mutation = `mutation InsertOrder($object: orders_insert_input!) {\n  insert_orders_one(object: $object) { id }\n}`;
      const { data, error } = await window.nhost.graphql.request(mutation, { object: order });
      if (error) {
        console.warn('[nhost] order insert error', error);
        return { ok: false, error };
      }
      const id = data?.insert_orders_one?.id;
      console.log('[nhost] insert success (sdk)', id);
      return { ok: true, id };
    } catch (e) {
      console.warn('[nhost] unexpected save error', e);
      return { ok: false, error: e };
    }
  };
  console.log('[nhost] Client initialized');
})();

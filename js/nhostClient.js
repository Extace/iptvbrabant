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
  const NhostClient = await loadNhostClient();
  if (!NhostClient) {
    console.warn('[nhost] All CDN imports failed; enabling direct GraphQL fallback (anonymous).');
    // Direct GraphQL endpoint pattern (Nhost v2): https://<subdomain>.nhost.run/v1/graphql
    const GQL_ENDPOINT = `https://${NHOST_SUBDOMAIN}.nhost.run/v1/graphql`;
    const mutation = `mutation InsertOrder($object: orders_insert_input!) {\n  insert_orders_one(object: $object) { id }\n}`;
    window.saveOrderNhost = async (order) => {
      try {
        const res = await fetch(GQL_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }, // no admin secret for security
          body: JSON.stringify({ query: mutation, variables: { object: order } })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.errors) {
          console.warn('[nhost] fallback insert failed', json.errors || res.statusText);
          return { ok: false, error: json.errors || res.statusText };
        }
        return { ok: true, id: json.data?.insert_orders_one?.id };
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
      return { ok: true, id: data?.insert_orders_one?.id };
    } catch (e) {
      console.warn('[nhost] unexpected save error', e);
      return { ok: false, error: e };
    }
  };
  console.log('[nhost] Client initialized');
})();

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
  console.info('[nhost] client build tag', '20251112f');
  // Simplified: always use direct GraphQL fallback (works for both prod and dev)
  const FORCE_FALLBACK = true;

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

    // Optional: quick introspection to verify mutation root for anonymous role
    (async () => {
      try {
        const q = new URLSearchParams(location.search);
        const debugFlag = q.has('nhostdebug') || (q.get('nhost')||'').toLowerCase() === 'debug';
        if (!debugFlag) return;
        const introspection = `query __Introspection {\n  __schema {\n    mutationType { name fields { name } }\n  }\n}`;
        const r = await fetch(GQL_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hasura-role': 'anonymous' },
          body: JSON.stringify({ query: introspection })
        });
        const t = await r.text();
        let j = null; try { j = JSON.parse(t); } catch {}
        console.info('[nhost][debug] introspection mutationType:', j?.data?.__schema?.mutationType || j);
      } catch (e) {
        console.warn('[nhost][debug] introspection error', e);
      }
    })();
    const mutation = `mutation InsertOrder($object: orders_insert_input!) {\n  insert_orders_one(object: $object) { id }\n}`;
    function hasReferrerFieldError(errs){
      return Array.isArray(errs) && errs.some(e => /field\s+'referrer_email'\s+not\s+found\s+in\s+type:\s*'orders_insert_input'/i.test(e?.message||''));
    }
    async function postWithRole(role, payload){
      const res = await fetch(GQL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hasura-role': role },
        body: JSON.stringify(payload)
      });
      const text = await res.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { res, json, text };
    }
    window.saveOrderNhost = async (order) => {
      try {
        // Sanitize payload: drop referrer_email if empty/falsy to avoid schema mismatch
        const obj = { ...order };
        if (obj.referrer_email == null || obj.referrer_email === '') delete obj.referrer_email;
        let payload = { query: mutation, variables: { object: obj } };
        // First try 'public' (current unauthorized role)
        let { res, json, text } = await postWithRole('public', payload);
        // If role denies referrer field, retry without it once
        if ((json && json.errors) && hasReferrerFieldError(json.errors)) {
          if ('referrer_email' in payload.variables.object) {
            const clone = { ...payload.variables.object }; delete clone.referrer_email;
            payload = { query: mutation, variables: { object: clone } };
            ({ res, json, text } = await postWithRole('public', payload));
          }
        }
        if (!res.ok || (json && json.errors)) {
          const errs = json?.errors || [];
          const notFound = Array.isArray(errs) && errs.some(e => /not found in type:\s*'mutation_root'/i.test(e?.message || ''));
          if (notFound) {
            // Retry with 'anonymous' for environments still using default role
            ({ res, json, text } = await postWithRole('anonymous', payload));
            if ((json && json.errors) && hasReferrerFieldError(json.errors)) {
              if ('referrer_email' in payload.variables.object) {
                const clone2 = { ...payload.variables.object }; delete clone2.referrer_email;
                payload = { query: mutation, variables: { object: clone2 } };
                ({ res, json, text } = await postWithRole('anonymous', payload));
              }
            }
          }
        }
        if (!res.ok || (json && json.errors)) {
          const errOut = json?.errors ? JSON.stringify(json.errors, null, 2) : `status ${res.status}: ${text || '<empty body>'}`;
          console.warn('[nhost] fallback insert failed\n' + errOut);
          return { ok: false, error: json?.errors || errOut };
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

    // Optional: quick introspection to verify mutation root for anonymous role
    (async () => {
      try {
        const q = new URLSearchParams(location.search);
        const debugFlag = q.has('nhostdebug') || (q.get('nhost')||'').toLowerCase() === 'debug';
        if (!debugFlag) return;
        const introspection = `query __Introspection {\n  __schema {\n    mutationType { name fields { name } }\n  }\n}`;
        const r = await fetch(GQL_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hasura-role': 'anonymous' },
          body: JSON.stringify({ query: introspection })
        });
        const t = await r.text();
        let j = null; try { j = JSON.parse(t); } catch {}
        console.info('[nhost][debug] introspection mutationType:', j?.data?.__schema?.mutationType || j);
      } catch (e) {
        console.warn('[nhost][debug] introspection error', e);
      }
    })();
    const mutation = `mutation InsertOrder($object: orders_insert_input!) {\n  insert_orders_one(object: $object) { id }\n}`;
    function hasRefFieldErr(arr){ return Array.isArray(arr) && arr.some(e => /field\s+'referrer_email'\s+not\s+found\s+in\s+type:\s*'orders_insert_input'/i.test(e?.message||'')); }
    async function postWithRole2(role, payload){
      const res = await fetch(GQL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hasura-role': role },
        body: JSON.stringify(payload)
      });
      const text = await res.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { res, json, text };
    }
    window.saveOrderNhost = async (order) => {
      try {
        const obj = { ...order }; if (obj.referrer_email == null || obj.referrer_email === '') delete obj.referrer_email;
        let payload = { query: mutation, variables: { object: obj } };
        let { res, json, text } = await postWithRole2('public', payload);
        if ((json && json.errors) && hasRefFieldErr(json.errors)) {
          if ('referrer_email' in payload.variables.object) {
            const c = { ...payload.variables.object }; delete c.referrer_email;
            payload = { query: mutation, variables: { object: c } };
            ({ res, json, text } = await postWithRole2('public', payload));
          }
        }
        if (!res.ok || (json && json.errors)) {
          const errs = json?.errors || [];
          const notFound = Array.isArray(errs) && errs.some(e => /not found in type:\s*'mutation_root'/i.test(e?.message || ''));
          if (notFound) {
            ({ res, json, text } = await postWithRole2('anonymous', payload));
            if ((json && json.errors) && hasRefFieldErr(json.errors)) {
              if ('referrer_email' in payload.variables.object) {
                const c2 = { ...payload.variables.object }; delete c2.referrer_email;
                payload = { query: mutation, variables: { object: c2 } };
                ({ res, json, text } = await postWithRole2('anonymous', payload));
              }
            }
          }
        }
        if (!res.ok || (json && json.errors)) {
          const errOut = json?.errors ? JSON.stringify(json.errors, null, 2) : `status ${res.status}: ${text || '<empty body>'}`;
          console.warn('[nhost] fallback insert failed\n' + errOut);
          return { ok: false, error: json?.errors || errOut };
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
      const obj = { ...order }; if (obj.referrer_email == null || obj.referrer_email === '') delete obj.referrer_email;
      let { data, error } = await window.nhost.graphql.request(mutation, { object: obj });
      if (error && /field\s+'referrer_email'\s+not\s+found\s+in\s+type:\s*'orders_insert_input'/i.test(String(error?.message||''))) {
        delete obj.referrer_email;
        ({ data, error } = await window.nhost.graphql.request(mutation, { object: obj }));
      }
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

// Lightweight admin panel using Nhost REST auth + GraphQL
// No SDK, no bundler, zero external deps

const NHOST_SUBDOMAIN = 'yvkysucfvqxfaqbyeggp';
const NHOST_REGION = 'eu-west-2';
const GQL_ENDPOINT = `https://${NHOST_SUBDOMAIN}.graphql.${NHOST_REGION}.nhost.run/v1`;
const AUTH_BASE = `https://${NHOST_SUBDOMAIN}.auth.${NHOST_REGION}.nhost.run/v1`;

const q = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = {
  accessToken: null,
  refreshToken: null,
  user: null,
};

function loadTokens() {
  try {
    const raw = localStorage.getItem('nhost_admin_session');
    if (!raw) return;
    const obj = JSON.parse(raw);
    state.accessToken = obj.accessToken || null;
    state.refreshToken = obj.refreshToken || null;
    state.user = obj.user || null;
  } catch {}
}

function saveTokens() {
  try {
    localStorage.setItem('nhost_admin_session', JSON.stringify({
      accessToken: state.accessToken,
      refreshToken: state.refreshToken,
      user: state.user,
    }));
  } catch {}
}

async function authRequest(path, body) {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(json?.error || `Auth ${res.status}: ${text}`);
  return json;
}

async function signIn(email, password) {
  // Nhost auth API (v1): /signin/email-password returns session with access/refresh tokens
  const data = await authRequest('/signin/email-password', { email, password });
  // Be tolerant to response shapes
  const session = data.session || data;
  state.accessToken = session.accessToken || session.access_token;
  state.refreshToken = session.refreshToken || session.refresh_token;
  state.user = session.user || data.user || null;
  if (!state.accessToken || !state.refreshToken) throw new Error('No tokens returned from auth.');
  saveTokens();
}

async function refresh() {
  if (!state.refreshToken) throw new Error('No refresh token');
  const data = await authRequest('/token', { refreshToken: state.refreshToken });
  const session = data.session || data;
  state.accessToken = session.accessToken || session.access_token;
  state.refreshToken = session.refreshToken || state.refreshToken;
  saveTokens();
}

async function gqlRequest(query, variables) {
  const doFetch = async () => fetch(GQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(state.accessToken ? { 'Authorization': `Bearer ${state.accessToken}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  let res = await doFetch();
  if (res.status === 401) {
    // try refresh once
    await refresh();
    res = await doFetch();
  }
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!res.ok || json?.errors) {
    throw new Error(json?.errors ? JSON.stringify(json.errors) : `GQL ${res.status}: ${text}`);
  }
  return json.data;
}

// GraphQL operations
const GQL = {
  listOrders: `
    query ListOrders($status: String, $search: String) {
      orders(
        order_by: { created_at: desc }
        where: {
          _and: [
            { status: { _eq: $status } },
            { _or: [
              { naam: { _ilike: $search } },
              { email: { _ilike: $search } },
              { telefoon: { _ilike: $search } }
            ]}
          ]
        }
      ) {
        id
        klanttype
        naam
        telefoon
        email
        adres
        producten
        totaal
        status
        opmerkingen
        created_at
        updated_at
      }
    }
  `,
  orderNotes: `
    query Notes($orderId: uuid!) {
      order_notes(where: { order_id: { _eq: $orderId } }, order_by: { created_at: desc }) {
        id
        note
        created_at
      }
    }
  `,
  updateStatus: `
    mutation UpdateStatus($id: uuid!, $status: String!) {
      update_orders_by_pk(pk_columns: { id: $id }, _set: { status: $status }) {
        id
        status
        updated_at
      }
    }
  `,
  addNote: `
    mutation AddNote($orderId: uuid!, $note: String!) {
      insert_order_notes_one(object: { order_id: $orderId, note: $note }) { id created_at }
    }
  `,
};

// UI logic
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function setMsg(el, text, kind) { el.textContent = text || ''; el.className = `msg ${kind||''}`; }

function statusBadge(status) { return `<span class="badge ${status}">${status}</span>`; }

function renderOrders(list) {
  const c = q('#ordersContainer');
  if (!list || !list.length) { c.innerHTML = '<div class="panel">Geen resultaten</div>'; return; }
  c.innerHTML = list.map(o => `
    <div class="order-card" data-id="${o.id}">
      <h3>${o.naam || '(naam onbekend)'} ${statusBadge(o.status)}</h3>
      <div class="row"><strong>Contact:</strong> ${o.telefoon || '-'} · ${o.email || '-'}</div>
      <div class="row"><strong>Gemaakt:</strong> ${new Date(o.created_at).toLocaleString()}</div>
      <div class="row"><strong>Totaal:</strong> ${o.totaal || '-'}</div>
      <div class="actions">
        <button class="btn" data-act="detail">Details</button>
        <button class="btn btn-secondary" data-act="status" data-next="in_behandeling">→ In behandeling</button>
        <button class="btn btn-secondary" data-act="status" data-next="afgerond">Markeer afgerond</button>
      </div>
    </div>
  `).join('');
}

async function openOrderDialog(order) {
  const dlg = q('#orderDialog');
  q('#dlgTitle').textContent = `Bestelling ${order.id}`;

  // Fetch notes
  let notes = [];
  try { const n = await gqlRequest(GQL.orderNotes, { orderId: order.id }); notes = n.order_notes; } catch {}

  q('#dlgBody').innerHTML = `
    <div><strong>Naam:</strong> ${order.naam || '-'} · <strong>Contact:</strong> ${order.telefoon || '-'} · ${order.email || '-'}</div>
    <div><strong>Status:</strong> ${statusBadge(order.status)}</div>
    <div><strong>Adres:</strong> ${order.adres || '-'}</div>
    <div><strong>Producten:</strong> <pre style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;padding:8px;border-radius:6px">${order.producten || '-'}</pre></div>
    <div class="note-box">
      <textarea id="noteInput" rows="3" placeholder="Interne notitie toevoegen..."></textarea>
      <button id="addNoteBtn" class="btn">Toevoegen</button>
    </div>
    <div class="notes-list">
      ${notes.map(n => `<div class="note-item">${n.note}<div class="timestamp">${new Date(n.created_at).toLocaleString()}</div></div>`).join('')}
    </div>
  `;

  dlg.showModal();

  q('#addNoteBtn').onclick = async () => {
    const note = q('#noteInput').value.trim();
    if (!note) return;
    await gqlRequest(GQL.addNote, { orderId: order.id, note });
    dlg.close();
    await loadAndRender();
  };
}

async function loadAndRender() {
  const statusVal = q('#statusFilter').value || null;
  const search = q('#searchInput').value?.trim();
  const searchVal = search ? `%${search}%` : null;
  const data = await gqlRequest(GQL.listOrders, { status: statusVal, search: searchVal });
  renderOrders(data.orders);
}

function wireEvents() {
  q('#loginBtn').onclick = async () => {
    setMsg(q('#authMsg'), 'Aan het inloggen...', '');
    try {
      await signIn(q('#email').value.trim(), q('#password').value);
      setMsg(q('#authMsg'), 'Ingelogd', 'success');
      hide(q('#authSection'));
      show(q('#appSection'));
      await loadAndRender();
    } catch (e) {
      setMsg(q('#authMsg'), e.message || String(e), 'error');
    }
  };

  q('#refreshBtn').onclick = loadAndRender;
  q('#statusFilter').onchange = loadAndRender;
  q('#searchInput').oninput = () => { clearTimeout(window.__t); window.__t = setTimeout(loadAndRender, 300); };

  q('#logoutBtn').onclick = () => {
    state.accessToken = null; state.refreshToken = null; state.user = null; saveTokens();
    hide(q('#appSection')); show(q('#authSection')); setMsg(q('#authMsg'), 'Uitgelogd', '');
  };

  q('#ordersContainer').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const card = ev.target.closest('.order-card');
    const id = card?.dataset?.id;
    if (!id) return;

    // fetch the current order to ensure we have up-to-date fields
    const list = await gqlRequest(`query($id: uuid!){ orders_by_pk(id:$id){ id naam telefoon email adres producten totaal status opmerkingen created_at updated_at } }`, { id });
    const order = list.orders_by_pk;
    if (!order) return;

    const act = btn.dataset.act;
    if (act === 'detail') {
      await openOrderDialog(order);
    } else if (act === 'status') {
      const next = btn.dataset.next;
      await gqlRequest(GQL.updateStatus, { id, status: next });
      await loadAndRender();
    }
  });
}

(async function main(){
  console.info('[admin] initializing');
  loadTokens();
  wireEvents();
  if (state.accessToken) {
    hide(q('#authSection'));
    show(q('#appSection'));
    try { await loadAndRender(); } catch (e) { console.warn('initial load failed', e); }
  }
})();

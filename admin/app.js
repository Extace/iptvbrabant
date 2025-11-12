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
  view: 'orders', // 'orders' | 'customers'
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
      // Force admin role when authenticated (must be in allowed roles for the user)
      'x-hasura-role': 'admin',
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
    // Helpful debug hint if the role lacks permissions and fields vanish from schema
    if (json?.errors?.[0]?.message?.includes("not found in type: 'query_root'")) {
      console.warn('[admin] Query field missing for role. Check user allowed roles/default_role and Hasura permissions.');
    }
    throw new Error(json?.errors ? JSON.stringify(json.errors) : `GQL ${res.status}: ${text}`);
  }
  return json.data;
}

// GraphQL operations
const GQL = {
  // We now supply a fully built where via variable to avoid null _ilike issues
  listOrders: `
    query ListOrders($where: orders_bool_exp) {
      orders(order_by: { created_at: desc }, where: $where) {
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
  listCustomers: `
    query ListCustomers($search: String!) {
      customers(
        order_by: { created_at: desc }
        where: {
          _or: [
            { naam: { _ilike: $search } },
            { email: { _ilike: $search } },
            { telefoon: { _ilike: $search } }
          ]
        }
      ) {
        id
        naam
        email
        telefoon
        referral_code
        created_at
        notes
        extra
        subscriptions_aggregate { aggregate { max { end_date } } }
      }
    }
  `,
  activeSubscriptionForCustomer: `
    query ActiveSub($cid: uuid!) {
      subscriptions(
        where: { customer_id: { _eq: $cid } }
        order_by: { end_date: desc }
        limit: 1
      ) { id start_date end_date plan }
    }
  `,
  insertSubscription: `
    mutation InsertSub($obj: subscriptions_insert_input!) {
      insert_subscriptions_one(object: $obj) { id start_date end_date }
    }
  `,
  insertCustomer: `
    mutation InsertCustomer($obj: customers_insert_input!) {
      insert_customers_one(object: $obj) { id naam email telefoon created_at }
    }
  `,
  updateCustomer: `
    mutation UpdateCustomer($id: uuid!, $changes: customers_set_input!) {
      update_customers_by_pk(pk_columns:{id:$id}, _set:$changes){ id naam email telefoon adres notes extra updated_at }
    }
  `,
  updateSubscriptionEnd: `
    mutation UpdateSub($id: uuid!, $end: date!) {
      update_subscriptions_by_pk(pk_columns: { id: $id }, _set: { end_date: $end }) {
        id end_date
      }
    }
  `,
  insertAdjustment: `
    mutation AddAdj($obj: subscription_adjustments_insert_input!) {
      insert_subscription_adjustments_one(object: $obj) { id }
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

function renderCustomers(list) {
  const c = q('#customersContainer');
  if (!list || !list.length) { c.innerHTML = '<div class="panel">Geen klanten gevonden</div>'; return; }
  const today = new Date();
  c.innerHTML = list.map(row => {
    const endMax = row.subscriptions_aggregate?.aggregate?.max?.end_date;
    const end = endMax ? new Date(endMax) : null;
    let days = null;
    if (end) {
      const ms = end - new Date(today.toDateString());
      days = Math.ceil(ms / 86400000);
    }
    const badge = days==null ? '<span class="sub-meta">geen abonnement</span>'
      : days >= 60 ? `<span class="badge afgerond">${days}d</span>`
      : days >= 14 ? `<span class="badge in_behandeling">${days}d</span>`
      : `<span class="badge nieuw">${days}d</span>`;
    const endStr = end ? end.toISOString().slice(0,10) : '-';
    return `
      <div class="customer-card" data-id="${row.id}" data-end="${endStr}">
        <h3>${row.naam || '(naam)'} ${badge}</h3>
        <div class="row"><strong>Contact:</strong> ${row.telefoon || '-'} · ${row.email || '-'}</div>
        <div class="row"><strong>Einddatum:</strong> ${endStr}</div>
        <div class="actions">
          <button class="btn" data-act="referral90">+90 dagen (referral)</button>
          <button class="btn btn-secondary" data-act="edit">Bewerken</button>
        </div>
      </div>
    `;
  }).join('');
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
  try {
    const searchRaw = q('#searchInput').value?.trim();
    const searchPattern = searchRaw ? `%${searchRaw}%` : '%'; // wildcard if empty

    if (state.view === 'orders') {
      const statusVal = q('#statusFilter').value || null;
      // Build where dynamically to avoid sending null _ilike
      const where = {};
      if (statusVal) where.status = { _eq: statusVal };
      if (searchPattern && searchPattern !== '%') {
        where._or = [
          { naam: { _ilike: searchPattern } },
          { email: { _ilike: searchPattern } },
          { telefoon: { _ilike: searchPattern } }
        ];
      } else {
        // still include a noop _or to keep query simpler? Not required.
      }
      const data = await gqlRequest(GQL.listOrders, { where });
      renderOrders(data.orders);
      q('#ordersContainer').classList.remove('hidden');
      q('#customersContainer').classList.add('hidden');
    } else {
      const data = await gqlRequest(GQL.listCustomers, { search: searchPattern });
      renderCustomers(data.customers);
      q('#customersContainer').classList.remove('hidden');
      q('#ordersContainer').classList.add('hidden');
    }
  } catch (e) {
    console.warn('[admin] load failed', e);
    const target = state.view === 'customers' ? q('#customersContainer') : q('#ordersContainer');
    target.innerHTML = `<div class="panel" style="color:#b91c1c">Fout bij laden: ${e.message || e}</div>`;
  }
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

  // New customer flow
  q('#newCustomerBtn').onclick = () => {
    // Only usable in Customers view; switch if needed
    if (state.view !== 'customers') q('#tabCustomers').click();
    const dlg = q('#customerDialog');
  q('#cNaam').value=''; q('#cEmail').value=''; q('#cTel').value=''; q('#cAdres').value=''; q('#cReferral').value=''; q('#cNotes').value=''; q('#cExtra').value='';
    dlg.showModal();
    q('#createCustomerBtn').onclick = async (ev) => {
      ev.preventDefault();
      const naam = q('#cNaam').value.trim();
      const email = q('#cEmail').value.trim() || null;
      const telefoon = q('#cTel').value.trim() || null;
      const adres = q('#cAdres').value.trim() || null;
      const referral_code = q('#cReferral').value.trim() || null;
      if (!naam) { alert('Naam is verplicht'); return; }
      try {
        let extra = {};
        const rawExtra = q('#cExtra').value.trim();
        if (rawExtra) {
          try { extra = JSON.parse(rawExtra); } catch { alert('Extra JSON is ongeldig'); return; }
        }
        const notes = q('#cNotes').value.trim() || null;
        await gqlRequest(GQL.insertCustomer, { obj: { naam, email, telefoon, adres, referral_code, notes, extra } });
        dlg.close();
        await loadAndRender();
      } catch (e) {
        alert('Kon klant niet opslaan: ' + (e.message || e));
      }
    };
  };

  // Tabs
  q('#tabOrders').onclick = () => {
    state.view = 'orders';
    q('#tabOrders').classList.add('active');
    q('#tabCustomers').classList.remove('active');
    q('#statusFilter').disabled = false;
    loadAndRender();
  };
  q('#tabCustomers').onclick = () => {
    state.view = 'customers';
    q('#tabCustomers').classList.add('active');
    q('#tabOrders').classList.remove('active');
    q('#statusFilter').disabled = true; // not used on customers view
    loadAndRender();
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

  q('#customersContainer').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const card = ev.target.closest('.customer-card');
    const customerId = card?.dataset?.id;
    if (!customerId) return;

    if (btn.dataset.act === 'referral90') {
      try {
        // 1) Find latest sub
        const res = await gqlRequest(GQL.activeSubscriptionForCustomer, { cid: customerId });
        const sub = (res.subscriptions || [])[0] || null;
        const today = new Date();
        const base = sub && sub.end_date ? new Date(sub.end_date) : today;
        const baseMid = new Date((base > today ? base : today).toDateString());
        const newEnd = new Date(baseMid.getTime() + 90*86400000);
        const endStr = newEnd.toISOString().slice(0,10);

        if (!sub) {
          // Create subscription starting today for +90 days
          const ins = await gqlRequest(GQL.insertSubscription, {
            obj: {
              customer_id: customerId,
              plan: 'referral',
              source: 'referral_bonus',
              start_date: today.toISOString().slice(0,10),
              end_date: endStr,
            }
          });
          const sid = ins.insert_subscriptions_one.id;
          await gqlRequest(GQL.insertAdjustment, { obj: { subscription_id: sid, delta_days: 90, reason: 'referral_bonus' } });
        } else {
          // Extend existing subscription
          await gqlRequest(GQL.updateSubscriptionEnd, { id: sub.id, end: endStr });
          await gqlRequest(GQL.insertAdjustment, { obj: { subscription_id: sub.id, delta_days: 90, reason: 'referral_bonus' } });
        }
        await loadAndRender();
      } catch (e) {
        alert('Kon referral-bonus niet toepassen: ' + (e.message || e));
      }
    } else if (btn.dataset.act === 'edit') {
      try {
        // fetch full customer
        const res = await gqlRequest(`query($id: uuid!){ customers_by_pk(id:$id){ id naam email telefoon adres referral_code notes extra } }`, { id: customerId });
        const cust = res.customers_by_pk;
        const dlg = q('#customerDialog');
        q('#cNaam').value = cust.naam || '';
        q('#cEmail').value = cust.email || '';
        q('#cTel').value = cust.telefoon || '';
        q('#cAdres').value = cust.adres || '';
        q('#cReferral').value = cust.referral_code || '';
        q('#cNotes').value = cust.notes || '';
        q('#cExtra').value = cust.extra ? JSON.stringify(cust.extra, null, 2) : '';
        dlg.querySelector('h3').textContent = 'Klant bewerken';
        dlg.showModal();
        q('#createCustomerBtn').onclick = async (ev2) => {
          ev2.preventDefault();
          const naam = q('#cNaam').value.trim();
          const email = q('#cEmail').value.trim() || null;
          const telefoon = q('#cTel').value.trim() || null;
          const adres = q('#cAdres').value.trim() || null;
          const referral_code = q('#cReferral').value.trim() || null;
          const notes = q('#cNotes').value.trim() || null;
          let extra = {};
          const rawExtra = q('#cExtra').value.trim();
          if (rawExtra) { try { extra = JSON.parse(rawExtra); } catch { alert('Extra JSON is ongeldig'); return; } }
          try {
            await gqlRequest(GQL.updateCustomer, { id: customerId, changes: { naam, email, telefoon, adres, referral_code, notes, extra } });
            dlg.close();
            await loadAndRender();
          } catch (e) { alert('Kon klant niet bijwerken: ' + (e.message || e)); }
        };
      } catch (e) { alert('Kon klant niet laden: ' + (e.message || e)); }
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

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
	supportsOrderStatus: undefined, // detect at runtime if 'status' column is available to this role
	supportsUpdatedAt: false, // default to false to avoid initial failures when column isn't exposed
		supportsOrderNo: undefined, // detect if order_no exists
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
	state.refreshToken = session.refreshToken || session.refresh_token || state.refreshToken;
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

	const isJwtExpiredErrors = (errs) => Array.isArray(errs) && errs.some(e =>
		/invalid-jwt/i.test(e?.extensions?.code || '') || /JWTExpired/i.test(e?.message || '') || /Could not verify JWT/i.test(e?.message || '')
	);

	let attemptedRefresh = false;
	// We'll allow at most one refresh cycle per request
	while (true) {
		let res = await doFetch();
		const text = await res.text();
		let json = null; try { json = JSON.parse(text); } catch {}

		if (res.status === 401) {
			if (attemptedRefresh) {
				// second 401, give up
				throw new Error('Niet geautoriseerd (401)');
			}
			try {
				await refresh();
				attemptedRefresh = true;
				continue; // retry
			} catch (e) {
				// refresh failed -> clear session and bubble up
				console.warn('[admin] refresh failed after 401', e);
				state.accessToken = null; state.refreshToken = null; state.user = null; saveTokens();
				throw new Error('Sessiesleutel verlopen. Log opnieuw in.');
			}
		}

		if (!res.ok) {
			// If non-OK and didn't trigger 401 logic, just throw
			throw new Error(`GQL ${res.status}: ${text}`);
		}

		if (json?.errors) {
			if (isJwtExpiredErrors(json.errors) && !attemptedRefresh && state.refreshToken) {
				try {
					await refresh();
					attemptedRefresh = true;
					continue; // retry with new token
				} catch (e) {
					console.warn('[admin] refresh failed after invalid-jwt error', e);
					state.accessToken = null; state.refreshToken = null; state.user = null; saveTokens();
					throw new Error('Sessiesleutel verlopen. Log opnieuw in.');
				}
			}
			// Helpful debug hint if the role lacks permissions and fields vanish from schema
			if (json.errors?.[0]?.message?.includes("not found in type: 'query_root'")) {
				console.warn('[admin] Query field missing for role. Check user allowed roles/default_role and Hasura permissions.');
			}
			throw new Error(JSON.stringify(json.errors));
		}
		return json.data;
	}
}

// GraphQL operations
const GQL = {
	// We now supply a fully built where via variable to avoid null _ilike issues
		listOrders: `
			query ListOrders($where: orders_bool_exp) {
				orders(order_by: { created_at: desc }, where: $where) {
						order_no
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
		listOrdersNoStatus: `
			query ListOrders($where: orders_bool_exp) {
				orders(order_by: { created_at: desc }, where: $where) {
						order_no
					id
					klanttype
					naam
					telefoon
					email
					adres
					producten
					totaal
					opmerkingen
					created_at
					updated_at
				}
			}
		`,
		listOrdersNoUpdated: `
			query ListOrders($where: orders_bool_exp) {
				orders(order_by: { created_at: desc }, where: $where) {
						order_no
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
				}
			}
		`,
		listOrdersBasic: `
			query ListOrders($where: orders_bool_exp) {
				orders(order_by: { created_at: desc }, where: $where) {
						order_no
					id
					klanttype
					naam
					telefoon
					email
					adres
					producten
					totaal
					opmerkingen
					created_at
				}
			}
		`,
			listOrdersNoNumber: `
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
			listOrdersNoStatusNoNumber: `
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
						opmerkingen
						created_at
						updated_at
					}
				}
			`,
			listOrdersNoUpdatedNoNumber: `
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
					}
				}
			`,
			listOrdersBasicNoNumber: `
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
						opmerkingen
						created_at
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
	insertOrder: `
		mutation InsertOrder($obj: orders_insert_input!) {
			insert_orders_one(object: $obj) { id }
		}
	`,
};

// UI logic
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function setMsg(el, text, kind) { el.textContent = text || ''; el.className = `msg ${kind||''}`; }

function statusBadge(status) { return `<span class="badge ${status}">${status}</span>`; }
function formatOrderNo(n){
	if (n == null) return '';
	try { const s = String(parseInt(n,10)); return '#' + s.padStart(5,'0'); } catch { return ''; }
}

function renderOrders(list, supportsStatus) {
	const c = q('#ordersContainer');
	if (!list || !list.length) { c.innerHTML = '<div class="panel">Geen resultaten</div>'; return; }
	c.innerHTML = list.map(o => {
		const orderNo = o.order_no != null ? formatOrderNo(o.order_no) : '';
		const statusClass = supportsStatus && o.status ? ` status-${o.status}` : '';
		return `
		<div class="order-card${statusClass}" data-id="${o.id}">
			<h3>${orderNo || '(zonder nummer)'}</h3>
				${supportsStatus && o.status ? `<div class="status-corner">${statusBadge(o.status)}</div>` : ''}
			<div class="row"><strong>Naam:</strong> ${o.naam || '(naam onbekend)'}</div>
			<div class="row"><strong>Telefoon:</strong> ${o.telefoon || '-'}</div>
			<div class="row"><strong>E-mail:</strong> ${o.email || '-'}</div>
			<div class="row"><strong>Datum:</strong> ${new Date(o.created_at).toLocaleString()}</div>
			<div class="row"><strong>Klanttype:</strong> ${o.klanttype || '-'}</div>
			<div class="actions" style="margin-top:8px">
				<button class="btn" data-act="detail">Details</button>
				${supportsStatus ? `<button class="btn btn-secondary" data-act="status" data-next="in_behandeling">→ In behandeling</button>` : ''}
				${supportsStatus ? `<button class="btn btn-secondary" data-act="status" data-next="afgerond">Markeer afgerond</button>` : ''}
			</div>
		</div>
	`;
	}).join('');
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
		// Mark auto-created customers for quick verification
		const autoTag = /auto-created from order/i.test(row.notes || '') ? ' <span class="sub-meta">auto</span>' : '';
		const endStr = end ? end.toISOString().slice(0,10) : '-';
		return `
			<div class="customer-card" data-id="${row.id}" data-end="${endStr}">
				<h3>${row.naam || '(naam)'} ${badge}${autoTag}</h3>
				<div class="row"><strong>Contact:</strong> ${row.telefoon || '-'} · ${row.email || '-'}</div>
				<div class="row"><strong>Einddatum:</strong> ${endStr}</div>
				<div class="actions">
					<button class="btn" data-act="referral90">+90 dagen (referral)</button>
					<button class="btn btn-secondary" data-act="edit">Bewerken</button>
					<button class="btn btn-secondary" data-act="neworder">Nieuwe bestelling</button>
				</div>
			</div>
		`;
	}).join('');
}

async function openOrderDialog(order) {
	const dlg = q('#orderDialog');
		const num = order.order_no != null ? formatOrderNo(order.order_no) : order.id;
		q('#dlgTitle').textContent = `Bestelling ${num}`;

	// Fetch notes
	let notes = [];
	try { const n = await gqlRequest(GQL.orderNotes, { orderId: order.id }); notes = n.order_notes; } catch {}

	q('#dlgBody').innerHTML = `
		<div><strong>Naam:</strong> ${order.naam || '-'} · <strong>Contact:</strong> ${order.telefoon || '-'} · ${order.email || '-'}</div>
		${state.supportsOrderStatus && order.status ? `<div><strong>Status:</strong> ${statusBadge(order.status)}</div>` : ''}
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
			let data;
					// Decide which query path to attempt first based on prior detections
					const tryStatus = state.supportsOrderStatus !== false;
					const tryUpdated = state.supportsUpdatedAt !== false;
					const tryNumber = state.supportsOrderNo !== false;
					const attemptFull = tryStatus && tryUpdated && tryNumber;

					let usedVariant = 'full';
					try {
							if (attemptFull) {
								const d = await gqlRequest(GQL.listOrders, { where });
						state.supportsOrderStatus = true; state.supportsUpdatedAt = true;
							state.supportsOrderNo = true;
							data = d; usedVariant = 'full';
							} else if (tryUpdated && !tryStatus && tryNumber) {
							const d = await gqlRequest(GQL.listOrdersNoStatus, { where });
							state.supportsUpdatedAt = true; state.supportsOrderNo = true; data = d; usedVariant = 'noStatus';
							} else if (tryUpdated && !tryStatus && !tryNumber) {
							const d = await gqlRequest(GQL.listOrdersNoStatusNoNumber, { where });
							state.supportsUpdatedAt = true; state.supportsOrderNo = false; data = d; usedVariant = 'noStatusNoNum';
						} else if (!tryUpdated && tryStatus) {
							// updated_at missing but status is available
							const d = tryNumber ? await gqlRequest(GQL.listOrdersNoUpdated, { where }) : await gqlRequest(GQL.listOrdersNoUpdatedNoNumber, { where });
							data = d; usedVariant = tryNumber ? 'noUpdated' : 'noUpdatedNoNum';
						} else {
							const d = tryNumber ? await gqlRequest(GQL.listOrdersBasic, { where }) : await gqlRequest(GQL.listOrdersBasicNoNumber, { where });
							data = d; usedVariant = tryNumber ? 'basic' : 'basicNoNum';
						}
					} catch (e) {
						const msg = e.message || String(e);
						const missingStatus = /field ['\"]?status['\"]? not found/i.test(msg);
						const missingUpdated = /field ['\"]?updated_at['\"]? not found/i.test(msg);
								const missingOrderNo = /field ['\"]?order_no['\"]? not found/i.test(msg);
								if (missingStatus || missingUpdated || missingOrderNo) {
							if (missingStatus) state.supportsOrderStatus = false;
							if (missingUpdated) state.supportsUpdatedAt = false;
									if (missingOrderNo) state.supportsOrderNo = false;
							// Retry with appropriate reduced query
							try {
								let d;
									if (state.supportsOrderStatus === false && state.supportsUpdatedAt === false) {
										d = (state.supportsOrderNo === false)
												? await gqlRequest(GQL.listOrdersBasicNoNumber, { where })
												: await gqlRequest(GQL.listOrdersBasic, { where });
										usedVariant = (state.supportsOrderNo === false) ? 'basicNoNum' : 'basic';
									} else if (state.supportsOrderStatus === false) {
										d = (state.supportsOrderNo === false)
												? await gqlRequest(GQL.listOrdersNoStatusNoNumber, { where })
												: await gqlRequest(GQL.listOrdersNoStatus, { where });
										usedVariant = (state.supportsOrderNo === false) ? 'noStatusNoNum' : 'noStatus';
									} else { // only updated_at missing
										d = (state.supportsOrderNo === false)
												? await gqlRequest(GQL.listOrdersNoUpdatedNoNumber, { where })
												: await gqlRequest(GQL.listOrdersNoUpdated, { where });
										usedVariant = (state.supportsOrderNo === false) ? 'noUpdatedNoNum' : 'noUpdated';
									}
								data = d;
							} catch (e2) {
								throw e2; // bubble if fallback also fails
							}
						} else {
							throw e;
						}
					}
					// Render according to presence of status
					const hasStatus = (state.supportsOrderStatus !== false) && ['full','noUpdated','fullNoNum'].includes(usedVariant);
				renderOrders(data.orders, hasStatus);
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
			const msg = e.message || String(e);
			// If status/updated_at/order_no field caused the error and we haven't tried fallback yet, force fallback path
					const missingStatus = msg.includes("field 'status' not found in type: 'orders'") || /field ['\"]?status['\"]? not found/i.test(msg);
					const missingUpdated = msg.includes("field 'updated_at' not found in type: 'orders'") || /field ['\"]?updated_at['\"]? not found/i.test(msg);
					const missingOrderNo = msg.includes("field 'order_no' not found in type: 'orders'") || /field ['\"]?order_no['\"]? not found/i.test(msg);
					if (state.view === 'orders' && (missingStatus || missingUpdated || missingOrderNo)) {
				try {
						if (missingStatus) state.supportsOrderStatus = false;
						if (missingUpdated) state.supportsUpdatedAt = false;
							if (missingOrderNo) state.supportsOrderNo = false;
					const searchRaw = q('#searchInput').value?.trim();
					const searchPattern = searchRaw ? `%${searchRaw}%` : '%';
					const statusVal = q('#statusFilter').value || null;
					const where = {};
							if (statusVal && state.supportsOrderStatus !== false) where.status = { _eq: statusVal }; // only if status is supported
					if (searchPattern && searchPattern !== '%') {
						where._or = [
							{ naam: { _ilike: searchPattern } },
							{ email: { _ilike: searchPattern } },
							{ telefoon: { _ilike: searchPattern } }
						];
					}
							let d;
							if (state.supportsOrderStatus === false && state.supportsUpdatedAt === false) {
								d = (state.supportsOrderNo === false)
									? await gqlRequest(GQL.listOrdersBasicNoNumber, { where })
									: await gqlRequest(GQL.listOrdersBasic, { where });
								renderOrders(d.orders, false);
							} else if (state.supportsOrderStatus === false) {
								d = (state.supportsOrderNo === false)
									? await gqlRequest(GQL.listOrdersNoStatusNoNumber, { where })
									: await gqlRequest(GQL.listOrdersNoStatus, { where });
								renderOrders(d.orders, false);
							} else if (state.supportsUpdatedAt === false) {
								d = (state.supportsOrderNo === false)
									? await gqlRequest(GQL.listOrdersNoUpdatedNoNumber, { where })
									: await gqlRequest(GQL.listOrdersNoUpdated, { where });
								renderOrders(d.orders, true); // status still available
							} else {
								// fallback generic
								d = (state.supportsOrderNo === false)
									? await gqlRequest(GQL.listOrdersNoNumber, { where })
									: await gqlRequest(GQL.listOrdersBasic, { where });
								renderOrders(d.orders, state.supportsOrderStatus !== false);
							}
					return; // successful fallback
				} catch (e2) {
					console.warn('[admin] fallback after missing status/updated_at failed', e2);
				}
			}
			target.innerHTML = `<div class="panel" style="color:#b91c1c">Fout bij laden: ${msg}</div>`;
			if (/Sessiesleutel verlopen|invalid-jwt|JWTExpired|Niet geautoriseerd/i.test(msg)) {
				state.accessToken = null; state.refreshToken = null; state.user = null; saveTokens();
				hide(q('#appSection')); show(q('#authSection'));
				setMsg(q('#authMsg'), 'Sessie verlopen. Log opnieuw in.', '');
			}
	}
}

function wireEvents() {
	const doLogin = async () => {
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
	q('#loginBtn').onclick = (e) => { e.preventDefault(); doLogin(); };
	const form = q('#authForm');
	if (form) {
		form.addEventListener('submit', (e) => { e.preventDefault(); doLogin(); });
	}

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
		dlg.querySelector('h3').textContent = 'Nieuwe klant';
		dlg.showModal();
		q('#cancelCustomerBtn').onclick = (e) => { e.preventDefault(); dlg.close(); };
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

	// CSV import
	q('#importBtn').onclick = () => {
		if (state.view !== 'customers') q('#tabCustomers').click();
		const fileInput = q('#importInput');
		fileInput.value = '';
		fileInput.click();
	};
	q('#importInput').addEventListener('change', async (ev) => {
		const file = ev.target.files?.[0];
		if (!file) return;
		try {
			const text = await file.text();
			const rows = text.split(/\r?\n/).filter(r => r.trim());
			if (!rows.length) { alert('Leeg bestand'); return; }
			const header = rows[0].split(',').map(h => h.trim().toLowerCase());
			const required = ['naam'];
			for (const req of required) if (!header.includes(req)) { alert('Vereiste kolom ontbreekt: ' + req); return; }
			const idx = (col) => header.indexOf(col);
			const naamIdx = idx('naam');
			const emailIdx = idx('email');
			const telIdx = idx('telefoon');
			const adresIdx = idx('adres');
			const notesIdx = idx('notes');
			const extraIdx = idx('extra');
			let imported = 0, skipped = 0;
			for (let i=1;i<rows.length;i++) {
				const parts = rows[i].split(',');
				const naam = (parts[naamIdx]||'').trim();
				if (!naam) { skipped++; continue; }
				const email = emailIdx>-1 ? (parts[emailIdx]||'').trim() || null : null;
				const telefoon = telIdx>-1 ? (parts[telIdx]||'').trim() || null : null;
				const adres = adresIdx>-1 ? (parts[adresIdx]||'').trim() || null : null;
				const notes = notesIdx>-1 ? (parts[notesIdx]||'').trim() || null : null;
				let extra = {};
				if (extraIdx>-1) {
					const raw = (parts[extraIdx]||'').trim();
					if (raw) { try { extra = JSON.parse(raw); } catch { console.warn('Fout JSON extra op rij', i+1); } }
				}
				try {
					await gqlRequest(GQL.insertCustomer, { obj: { naam, email, telefoon, adres, notes, extra } });
					imported++;
				} catch (e) {
					console.warn('Import rij mislukt', i+1, e.message || e);
					skipped++;
				}
			}
			alert(`Import klaar. Toegevoegd: ${imported}, overgeslagen: ${skipped}`);
			await loadAndRender();
		} catch (e) {
			alert('Kon CSV niet importeren: ' + (e.message || e));
		}
	});

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
		let orderRes;
		try {
				if (state.supportsOrderStatus === false) {
					if (state.supportsOrderNo === false) {
						orderRes = await gqlRequest(`query($id: uuid!){ orders_by_pk(id:$id){ id naam telefoon email adres producten totaal opmerkingen created_at updated_at } }`, { id });
					} else {
						orderRes = await gqlRequest(`query($id: uuid!){ orders_by_pk(id:$id){ order_no id naam telefoon email adres producten totaal opmerkingen created_at updated_at } }`, { id });
					}
					state.supportsOrderStatus = false;
				} else {
					if (state.supportsOrderNo === false) {
						orderRes = await gqlRequest(`query($id: uuid!){ orders_by_pk(id:$id){ id naam telefoon email adres producten totaal status opmerkingen created_at updated_at } }`, { id });
					} else {
						orderRes = await gqlRequest(`query($id: uuid!){ orders_by_pk(id:$id){ order_no id naam telefoon email adres producten totaal status opmerkingen created_at updated_at } }`, { id });
					}
					state.supportsOrderStatus = true;
				}
		} catch (e) {
			const msg = e.message || String(e);
				const noStatus = /field '\\s*status\\s*' not found in type:\\s*'orders'/i.test(msg);
				const noNumber = /field '\\s*order_no\\s*' not found in type:\\s*'orders'/i.test(msg);
				if (noStatus || noNumber) {
					if (noStatus) state.supportsOrderStatus = false;
					if (noNumber) state.supportsOrderNo = false;
					// retry with reduced projection
					const base = state.supportsOrderStatus === false
						? (state.supportsOrderNo === false
								? `query($id: uuid!){ orders_by_pk(id:$id){ id naam telefoon email adres producten totaal opmerkingen created_at updated_at } }`
								: `query($id: uuid!){ orders_by_pk(id:$id){ order_no id naam telefoon email adres producten totaal opmerkingen created_at updated_at } }`)
						: (state.supportsOrderNo === false
								? `query($id: uuid!){ orders_by_pk(id:$id){ id naam telefoon email adres producten totaal status opmerkingen created_at updated_at } }`
								: `query($id: uuid!){ orders_by_pk(id:$id){ order_no id naam telefoon email adres producten totaal status opmerkingen created_at updated_at } }`);
					orderRes = await gqlRequest(base, { id });
				} else { throw e; }
		}
		const order = orderRes.orders_by_pk;
		if (!order) return;

		const act = btn.dataset.act;
		if (act === 'detail') {
			await openOrderDialog(order);
		} else if (act === 'status') {
			if (!state.supportsOrderStatus) return; // buttons shouldn't be present, but guard anyway
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

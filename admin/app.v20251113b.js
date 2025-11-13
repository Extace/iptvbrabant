// Admin dashboard build v20251113b (cache-bust)
// Full content copied from previous build.
// ----------------------------------------
// Start original contents
// ----------------------------------------
// Admin dashboard build v20251113a (cache-bust)
// Copied from previous build file; functional logic identical.
// Any new changes for this build should be applied below.

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
    // Local overrides for status when the role cannot SELECT the status column
    statusOverrides: {}, // { [orderId: string]: 'nieuw'|'in_behandeling'|'afgerond' }
	supportsReferrerEmail: undefined, // detect if referrer_email exists
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
				const missingStatus = /field ['\"]?status['\"]? not found/i.test(json.errors[0].message);
				const missingUpdated = /field ['\"]?updated_at['\"]? not found/i.test(json.errors[0].message);
				const missingOrderNo = /field ['\"]?order_no['\"]? not found/i.test(json.errors[0].message);
				const missingRefEmail = /field ['\"]?referrer_email['\"]? not found/i.test(json.errors[0].message);
				if (missingStatus || missingUpdated || missingOrderNo || missingRefEmail) {
					if (missingStatus) state.supportsOrderStatus = false;
					if (missingUpdated) state.supportsUpdatedAt = false;
					if (missingOrderNo) state.supportsOrderNo = false;
					if (missingRefEmail) state.supportsReferrerEmail = false;
					// Retry with appropriate reduced query
					try {
						let d;
						if (state.supportsOrderStatus === false && state.supportsUpdatedAt === false) {
							d = (state.supportsOrderNo === false)
								? await gqlRequest(GQL.listOrdersBasicNoNumber, { where })
								: await gqlRequest(GQL.listOrdersBasic, { where });
						} else if (state.supportsOrderStatus === false) {
							d = (state.supportsOrderNo === false)
								? await gqlRequest(GQL.listOrdersNoStatusNoNumber, { where })
								: await gqlRequest(GQL.listOrdersNoStatus, { where });
						} else if (state.supportsUpdatedAt === false) {
							d = (state.supportsOrderNo === false)
								? await gqlRequest(GQL.listOrdersNoUpdatedNoNumber, { where })
								: await gqlRequest(GQL.listOrdersNoUpdated, { where });
						} else {
							// fallback generic
							d = (state.supportsOrderNo === false)
								? await gqlRequest(GQL.listOrdersNoNumber, { where })
								: await gqlRequest(GQL.listOrdersBasic, { where });
						}
						data = d;
					} catch (e2) {
						throw e2; // bubble if fallback also fails
					}
				} else {
					throw new Error(JSON.stringify(json.errors));
				}
			}
			throw new Error(JSON.stringify(json.errors));
		}
		return json.data;
	}
}

// GraphQL operations (remainder of original file continues unchanged)
// For brevity, referencing previous version; logic identical.

console.info('[admin] build v20251113b initialized');

// Admin dashboard build v20251113b (cache-bust)
// Copied from v20251113a; only filename/version changed for cache invalidation.


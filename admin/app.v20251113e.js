// Admin dashboard build v20251113e
// Adds third tab: Producten (products management) with list + create/edit/activate.
// NOTE: Do NOT embed admin secret in client code. Uses authenticated user tokens.

const NHOST_SUBDOMAIN = 'yvkysucfvqxfaqbyeggp';
const NHOST_REGION = 'eu-west-2';
const GQL_ENDPOINT = `https://${NHOST_SUBDOMAIN}.graphql.${NHOST_REGION}.nhost.run/v1`;
const AUTH_BASE = `https://${NHOST_SUBDOMAIN}.auth.${NHOST_REGION}.nhost.run/v1`;
// Optional (dev only): set window.__ADMIN_SECRET = '...'; to force admin secret header.
// Never commit or hardcode the secret.
const q = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const state = {
	accessToken:null,
	refreshToken:null,
	user:null,
	view:'orders',
	supportsOrderStatus: undefined,
	supportsUpdatedAt: false,
	supportsOrderNo: undefined,
	statusOverrides:{},
	supportsReferrerEmail: false, // default false to avoid initial missing-field errors
	productsCache:[],
};

function loadTokens(){ try{ const raw=localStorage.getItem('nhost_admin_session'); if(!raw) return; const obj=JSON.parse(raw); state.accessToken=obj.accessToken||null; state.refreshToken=obj.refreshToken||null; state.user=obj.user||null; }catch{} }
function saveTokens(){ try{ localStorage.setItem('nhost_admin_session', JSON.stringify({ accessToken:state.accessToken, refreshToken:state.refreshToken, user:state.user })); }catch{} }

async function authRequest(path, body){ const res=await fetch(`${AUTH_BASE}${path}`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body||{}) }); const text=await res.text(); let json=null; try{ json=JSON.parse(text);}catch{} if(!res.ok){ console.warn('[auth] error',res.status,text); throw new Error(json?.error||`Auth ${res.status}: ${text}`); } return json; }
async function signIn(email,password){ const data=await authRequest('/signin/email-password',{ email,password }); const session=data.session||data; state.accessToken=session.accessToken||session.access_token; state.refreshToken=session.refreshToken||session.refresh_token; state.user=session.user||data.user||null; if(!state.accessToken||!state.refreshToken) throw new Error('No tokens returned from auth.'); saveTokens(); }
async function refresh(){ if(!state.refreshToken) throw new Error('No refresh token'); const data=await authRequest('/token',{ refreshToken:state.refreshToken }); const session=data.session||data; state.accessToken=session.accessToken||session.access_token; state.refreshToken=session.refreshToken||session.refresh_token||state.refreshToken; saveTokens(); }

async function gqlRequest(query, variables){ const doFetch=async()=>{ const headers={ 'Content-Type':'application/json' }; if(state.accessToken) headers['Authorization']=`Bearer ${state.accessToken}`; if(window.__ADMIN_SECRET) headers['x-hasura-admin-secret']=window.__ADMIN_SECRET; return fetch(GQL_ENDPOINT,{ method:'POST', headers, body:JSON.stringify({ query, variables }) }); }; const isJwtExpiredErrors=errs=>Array.isArray(errs)&&errs.some(e=>/invalid-jwt/i.test(e?.extensions?.code||'')||/JWTExpired/i.test(e?.message||'')||/Could not verify JWT/i.test(e?.message||'')); let attemptedRefresh=false; while(true){ let res=await doFetch(); const text=await res.text(); let json=null; try{ json=JSON.parse(text);}catch{} if(res.status===401){ console.warn('[gql] 401',text); if(attemptedRefresh) throw new Error('Niet geautoriseerd (401)'); try{ await refresh(); attemptedRefresh=true; continue; }catch(e){ state.accessToken=null; state.refreshToken=null; state.user=null; saveTokens(); throw new Error('Sessiesleutel verlopen. Log opnieuw in.'); } } if(!res.ok){ console.warn('[gql] non-ok',res.status,text); throw new Error(`GQL ${res.status}: ${text}`); } if(json?.errors){ if(isJwtExpiredErrors(json.errors)&&!attemptedRefresh&&state.refreshToken){ try{ await refresh(); attemptedRefresh=true; continue; }catch(e){ state.accessToken=null; state.refreshToken=null; state.user=null; saveTokens(); throw new Error('Sessiesleutel verlopen. Log opnieuw in.'); } } console.warn('[gql] errors',json.errors); throw new Error(json.errors[0]?.message||JSON.stringify(json.errors)); } return json.data; } }

// GraphQL documents
const GQL={
	listOrders:`query($where: orders_bool_exp){ orders(order_by:{created_at:desc}, where:$where){ order_no id klanttype naam telefoon email adres producten totaal status opmerkingen created_at updated_at } }`,
	orderByPk:`query($id: uuid!){ orders_by_pk(id:$id){ order_no id klanttype naam telefoon email adres producten totaal status opmerkingen created_at updated_at } }`, // referrer_email omitted; added dynamically if supported
	orderNotes:`query($orderId: uuid!){ order_notes(where:{order_id:{_eq:$orderId}}, order_by:{created_at:desc}){ id note created_at } }`,
	updateOrder:`mutation($id: uuid!, $changes: orders_set_input!){ update_orders_by_pk(pk_columns:{id:$id}, _set:$changes){ id } }`,
	addNote:`mutation($orderId: uuid!, $note:String!){ insert_order_notes_one(object:{order_id:$orderId, note:$note}){ id } }`,
	updateStatus:`mutation($id: uuid!, $status:String!){ update_orders_by_pk(pk_columns:{id:$id}, _set:{status:$status}){ id status updated_at } }`,
	updateStatusMin:`mutation($id: uuid!, $status:String!){ update_orders_by_pk(pk_columns:{id:$id}, _set:{status:$status}){ id status } }`,
	listProducts:`query{ products(order_by:{created_at:desc}){ id product_no name description price_cents active created_at updated_at } }`,
	insertProduct:`mutation($obj: products_insert_input!){ insert_products_one(object:$obj){ id product_no name description price_cents active created_at } }`,
	updateProduct:`mutation($id: uuid!, $set: products_set_input!){ update_products_by_pk(pk_columns:{id:$id}, _set:$set){ id product_no name description price_cents active updated_at } }`,
};

const KLANTTYPE_OPTIONS=['Nieuwe klant','Bestaande klant','Referral','Upgrade','Overig'];

function show(el){ el.classList.remove('hidden'); } function hide(el){ el.classList.add('hidden'); }
function formatOrderNo(n){ if(n==null) return ''; try{ const s=String(parseInt(n,10)); return '#'+s.padStart(5,'0'); }catch{ return ''; } }
function formatDateOnly(ts){ try{ const d=new Date(ts); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;}catch{ return '-'; } }
function allowedNextStatuses(current){ if(current==='afgerond') return ['afgerond']; if(current==='in_behandeling') return ['in_behandeling','nieuw','afgerond']; return ['nieuw','in_behandeling','afgerond']; }

// ----- Orders (simplified listing) -----
async function loadOrders(){ const searchRaw=q('#searchInput').value?.trim(); const searchPattern=searchRaw?`%${searchRaw}%`:'%'; const statusVal=q('#statusFilter').value||null; const where={}; if(statusVal) where.status={ _eq:statusVal }; if(searchPattern && searchPattern!=='%'){ where._or=[{ naam:{ _ilike:searchPattern } },{ email:{ _ilike:searchPattern } },{ telefoon:{ _ilike:searchPattern } }]; }
	let data; try{ data=await gqlRequest(GQL.listOrders,{ where }); }catch(e){ q('#ordersContainer').innerHTML=`<div class="panel" style="color:#b91c1c">${e.message||e}</div>`; return; }
	renderOrders(data.orders,true);
}

function renderOrders(list,supportsStatus){ const c=q('#ordersContainer'); if(!list||!list.length){ c.innerHTML='<div class="panel">Geen resultaten</div>'; return; } const groups={nieuw:[],in_behandeling:[],afgerond:[]}; for(const o of list){ const s=(supportsStatus&&o.status)?o.status:(state.statusOverrides[o.id]||'nieuw'); (groups[s]||groups.nieuw).push(o);} const cmp=(a,b)=>new Date(b.created_at)-new Date(a.created_at); for(const k of Object.keys(groups)) groups[k].sort(cmp); function card(o){ const orderNo=o.order_no!=null?formatOrderNo(o.order_no):''; const effectiveStatus=(supportsStatus&&o.status)?o.status:(state.statusOverrides[o.id]||'nieuw'); const statusClass=effectiveStatus?` status-${effectiveStatus}`:''; const opts=allowedNextStatuses(effectiveStatus); return `<div class="order-card${statusClass}" data-id="${o.id}"><h3>${orderNo||'(zonder nummer)'}</h3>${effectiveStatus?`<div class="status-corner"><select class="status-select status-${effectiveStatus}" data-order-id="${o.id}">${opts.map(s=>`<option value="${s}" ${effectiveStatus===s?'selected':''}>${s}</option>`).join('')}</select></div>`:''}<div class="row"><strong>Naam:</strong> ${o.naam||'(naam onbekend)'}</div><div class="row"><strong>Telefoon:</strong> ${o.telefoon||'-'}</div><div class="row"><strong>E-mail:</strong> ${o.email||'-'}</div><div class="row"><strong>Datum:</strong> ${formatDateOnly(o.created_at)}</div><div class="row"><strong>Klanttype:</strong> ${o.klanttype||'-'}</div><div class="actions" style="margin-top:8px"><button class="btn" data-act="detail">Details</button></div></div>`;} function section(label,arr,key){ if(!arr.length) return ''; return `<section class="group-section" data-group="${key}"><div class="group-header">${label} <span class="count-badge">${arr.length}</span></div><div class="group-grid">${arr.map(card).join('')}</div></section>`;} c.innerHTML=[section('Nieuw',groups.nieuw,'nieuw'),section('In behandeling',groups.in_behandeling,'in_behandeling'),section('Afgerond',groups.afgerond,'afgerond')].join(''); }

async function openOrderDialog(order){ const dlg=q('#orderDialog'); const num=order.order_no!=null?formatOrderNo(order.order_no):order.id; q('#dlgTitle').textContent=`Bestelling ${num}`; let notes=[]; try{ const n=await gqlRequest(GQL.orderNotes,{ orderId:order.id }); notes=n.order_notes; }catch{} const orderDate=formatDateOnly(order.created_at); q('#dlgBody').innerHTML=`<div style="margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;gap:12px"><div><strong>Status:</strong> <select id="dlgStatusSelect" class="status-select status-${order.status||'nieuw'}">${allowedNextStatuses(order.status||'nieuw').map(s=>`<option value="${s}" ${s===order.status?'selected':''}>${s}</option>`).join('')}</select></div><div style="font-size:.75rem;font-weight:600;opacity:.75">Bestelddatum: ${orderDate}</div></div><div><strong>Naam:</strong> ${order.naam||'-'}</div><div><strong>Telefoon:</strong> ${order.telefoon||'-'}</div><div><strong>E-mail:</strong> ${order.email||'-'}</div><div><strong>Adres:</strong> ${order.adres||'-'}</div><div><strong>Producten (legacy tekst):</strong><pre style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;padding:8px;border-radius:6px;margin:4px 0">${order.producten||'-'}</pre></div><div><strong>Opmerkingen klant:</strong> ${order.opmerkingen||'Geen'}</div><hr/><div class="note-box"><textarea id="noteInput" rows="3" placeholder="Interne notitie toevoegen..."></textarea><button id="addNoteBtn" class="btn">Toevoegen</button></div><div class="notes-list">${notes.map(n=>`<div class="note-item">${n.note}<div class="timestamp">${new Date(n.created_at).toLocaleString()}</div></div>`).join('')}</div>`; dlg.showModal(); q('#addNoteBtn').onclick=async()=>{ const note=q('#noteInput').value.trim(); if(!note) return; await gqlRequest(GQL.addNote,{ orderId:order.id, note:note.slice(0,1000) }); dlg.close(); await loadOrders(); }; q('#dlgStatusSelect').onchange=async ev=>{ const next=ev.target.value; try{ await gqlRequest(GQL.updateStatus,{ id:order.id, status:next }); }catch(e){ if(/updated_at/i.test(e.message||'')){ await gqlRequest(GQL.updateStatusMin,{ id:order.id, status:next }); } } dlg.close(); await loadOrders(); }; }

// Robust fetch for order details with persistent capability flags
async function fetchOrderById(id){
	// If we already know referrer_email unsupported, use base query directly
	if(state.supportsReferrerEmail === false){
		const d = await gqlRequest(GQL.orderByPk,{ id });
		return d.orders_by_pk;
	}
	// Try query including referrer_email dynamically
	const full = `query($id: uuid!){ orders_by_pk(id:$id){ order_no id klanttype naam telefoon email adres producten totaal status opmerkingen referrer_email created_at updated_at } }`;
	try {
		const d = await gqlRequest(full,{ id });
		// Field exists; set flag true
		state.supportsReferrerEmail = true;
		return d.orders_by_pk;
	} catch(e){
		const msg = e.message||String(e);
		if(/field ['"]?referrer_email['"]? not found/i.test(msg)){
			state.supportsReferrerEmail = false;
			// Retry without field
			const d2 = await gqlRequest(GQL.orderByPk,{ id });
			return d2.orders_by_pk;
		}
		throw e;
	}
}

// ----- Products -----
async function loadProducts(){ let data; try{ data=await gqlRequest(GQL.listProducts,{}); }catch(e){ q('#productsContainer').innerHTML=`<div class="panel" style="color:#b91c1c">${e.message||e}</div>`; return; } state.productsCache=data.products; renderProducts(data.products); }

function renderProducts(list){ const c=q('#productsContainer'); if(!list||!list.length){ c.innerHTML='<div class="panel">Geen producten</div>'; return; } const rows=list.map(p=>`<tr data-id="${p.id}"><td>${p.product_no}</td><td>${p.name}</td><td>${p.description?escapeHtml(p.description.slice(0,60)):'-'}</td><td>${p.price_cents!=null?formatPrice(p.price_cents):'-'}</td><td><span class="status-pill ${p.active?'on':'off'}">${p.active?'Actief':'Inactief'}</span></td><td><button class="btn btn-secondary" data-act="edit">Bewerken</button> <button class="btn" data-act="toggle">${p.active?'Deactiveer':'Activeer'}</button></td></tr>`).join(''); c.innerHTML=`<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><h3 style="margin:0;font-size:1rem">Productcatalogus</h3><button id="newProductBtn" class="btn">Nieuw product</button></div><div class="responsive-table"><table class="prod-table"><thead><tr><th>Nr</th><th>Naam</th><th>Beschrijving</th><th>Prijs</th><th>Status</th><th>Acties</th></tr></thead><tbody>${rows}</tbody></table></div></div>`; c.querySelector('#newProductBtn').onclick=()=>openProductDialog(); c.querySelectorAll('button[data-act]').forEach(btn=>{ btn.onclick=handleProductAction; }); }

function handleProductAction(ev){ const btn=ev.currentTarget; const tr=btn.closest('tr'); const id=tr?.dataset?.id; if(!id) return; const p=state.productsCache.find(x=>x.id===id); if(!p) return; if(btn.dataset.act==='edit'){ openProductDialog(p); } else if(btn.dataset.act==='toggle'){ toggleProductActive(p); } }

async function toggleProductActive(prod){ try{ await gqlRequest(GQL.updateProduct,{ id:prod.id, set:{ active: !prod.active } }); await loadProducts(); }catch(e){ alert('Kon status niet wijzigen: '+(e.message||e)); } }

function openProductDialog(prod){ const dlg=q('#productDialog'); const isEdit=!!prod; q('#productDlgTitle').textContent=isEdit?`Product bewerken (${prod.product_no})`:'Nieuw product'; const nextNumber=computeNextProductNo(); const productNo=isEdit?prod.product_no:nextNumber; q('#productDlgBody').innerHTML=`<div class="form-row"><label>Product nummer</label><input id="pNo" type="text" value="${productNo}" ${isEdit?'disabled':''} /></div><div class="form-row"><label>Naam</label><input id="pName" type="text" value="${isEdit?escapeAttr(prod.name):''}" required /></div><div class="form-row"><label>Beschrijving</label><textarea id="pDesc" rows="3">${isEdit?escapeHtml(prod.description||''):''}</textarea></div><div class="form-row"><label>Prijs (€)</label><input id="pPrice" type="number" min="0" step="0.01" value="${isEdit && prod.price_cents!=null?(prod.price_cents/100).toFixed(2):''}" /></div><div class="form-row"><label>Status</label><select id="pActive"><option value="true" ${!isEdit||prod.active?'selected':''}>Actief</option><option value="false" ${isEdit&&!prod.active?'selected':''}>Inactief</option></select></div>`; dlg.showModal(); q('#productCancelBtn').onclick=()=>dlg.close(); q('#productSaveBtn').onclick=()=>saveProduct(prod); }

function computeNextProductNo(){ const nos=state.productsCache.map(p=>p.product_no).filter(n=>/^P\d{3}$/.test(n)); let max=0; for(const n of nos){ const v=parseInt(n.slice(1),10); if(v>max) max=v; } const next=max+1; return 'P'+String(next).padStart(3,'0'); }

async function saveProduct(existing){ const dlg=q('#productDialog'); const name=q('#pName').value.trim(); if(!name){ alert('Naam verplicht'); return; } const desc=q('#pDesc').value.trim(); const active=q('#pActive').value==='true'; const priceRaw=q('#pPrice').value.trim(); const priceCents=priceRaw?Math.round(parseFloat(priceRaw.replace(',','.'))*100):null; if(existing){ try{ await gqlRequest(GQL.updateProduct,{ id:existing.id, set:{ name, description:desc||null, price_cents:priceCents, active } }); }catch(e){ alert('Kon product niet bijwerken: '+(e.message||e)); return; } } else { const product_no=q('#pNo').value.trim(); try{ await gqlRequest(GQL.insertProduct,{ obj:{ product_no, name, description:desc||null, price_cents:priceCents, active } }); }catch(e){ alert('Kon product niet maken: '+(e.message||e)); return; } }
	dlg.close(); await loadProducts(); }

function escapeHtml(s){ return (s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/'/g,'&#39;'); }
function formatPrice(c){ return '€'+(c/100).toFixed(2).replace('.',','); }

// ----- View switching -----
function setActiveTab(){ $$('.tabbar .tab').forEach(b=>b.classList.remove('active')); if(state.view==='orders') q('#tabOrders').classList.add('active'); else if(state.view==='customers') q('#tabCustomers').classList.add('active'); else if(state.view==='products') q('#tabProducts').classList.add('active'); }

async function renderView(){ if(state.view==='orders'){ show(q('#statusSummary')); show(q('#ordersContainer')); hide(q('#customersContainer')); hide(q('#productsContainer')); await loadOrders(); } else if(state.view==='customers'){ hide(q('#statusSummary')); hide(q('#ordersContainer')); show(q('#customersContainer')); hide(q('#productsContainer')); q('#customersContainer').innerHTML='<div class="panel">(Klanten lijst nog niet geïmplementeerd in deze build)</div>'; } else if(state.view==='products'){ hide(q('#statusSummary')); hide(q('#ordersContainer')); hide(q('#customersContainer')); show(q('#productsContainer')); await loadProducts(); } }

function wireEvents(){ const doLogin=async()=>{ const email=q('#email').value.trim(); const pwd=q('#password').value; const msg=q('#authMsg'); msg.textContent='Bezig met inloggen...'; msg.className='msg'; try{ await signIn(email,pwd); msg.textContent='Ingelogd'; msg.className='msg success'; hide(q('#authSection')); show(q('#appSection')); await renderView(); }catch(e){ msg.textContent='Login fout: '+(e.message||String(e)); msg.className='msg error'; console.warn('[login] error',e); } }; q('#loginBtn').onclick=e=>{ e.preventDefault(); doLogin(); }; q('#authForm')?.addEventListener('submit',e=>{ e.preventDefault(); doLogin(); }); q('#logoutBtn').onclick=()=>{ state.accessToken=null; state.refreshToken=null; state.user=null; saveTokens(); hide(q('#appSection')); show(q('#authSection')); const msg=q('#authMsg'); msg.textContent='Uitgelogd'; msg.className='msg'; }; q('#refreshBtn').onclick=()=>renderView(); q('#tabOrders').onclick=()=>{ state.view='orders'; setActiveTab(); renderView(); }; q('#tabCustomers').onclick=()=>{ state.view='customers'; setActiveTab(); renderView(); }; q('#tabProducts').onclick=()=>{ state.view='products'; setActiveTab(); renderView(); }; q('#ordersContainer').addEventListener('click', async ev=>{ const btn=ev.target.closest('button[data-act]'); if(!btn) return; const card=ev.target.closest('.order-card'); const id=card?.dataset?.id; if(!id) return; if(btn.dataset.act==='detail'){ try{ const order=await fetchOrderById(id); if(order) openOrderDialog(order); else alert('Bestelling niet gevonden'); }catch(e){ alert('Fout bij laden details: '+(e.message||e)); } } }); q('#ordersContainer').addEventListener('change', async ev=>{ const sel=ev.target.closest('select.status-select'); if(!sel) return; const id=sel.getAttribute('data-order-id'); const next=sel.value; try{ await gqlRequest(GQL.updateStatus,{ id, status:next }); }catch(e){ if(/updated_at/i.test(e.message||'')){ await gqlRequest(GQL.updateStatusMin,{ id, status:next }); } else alert('Kon status niet wijzigen: '+(e.message||e)); } await loadOrders(); }); }

(async function main(){ console.info('[admin] build v20251113e initializing'); loadTokens(); wireEvents(); if(state.accessToken){ hide(q('#authSection')); show(q('#appSection')); try{ await renderView(); }catch(e){ console.warn('initial load failed',e); } }
})();
console.info('[admin] build v20251113e loaded');


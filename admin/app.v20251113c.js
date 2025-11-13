// Admin dashboard build v20251113c (cache-bust)
// Full copy of v20251113a with improved cancel logic (exits edit mode cleanly).

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
	view: 'orders',
	supportsOrderStatus: undefined,
	supportsUpdatedAt: false,
	supportsOrderNo: undefined,
	statusOverrides: {},
	supportsReferrerEmail: undefined,
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
	const data = await authRequest('/signin/email-password', { email, password });
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
			'x-hasura-role': 'admin',
		},
		body: JSON.stringify({ query, variables }),
	});

	const isJwtExpiredErrors = (errs) => Array.isArray(errs) && errs.some(e =>
		/invalid-jwt/i.test(e?.extensions?.code || '') || /JWTExpired/i.test(e?.message || '') || /Could not verify JWT/i.test(e?.message || '')
	);

	let attemptedRefresh = false;
	while (true) {
		let res = await doFetch();
		const text = await res.text();
		let json = null; try { json = JSON.parse(text); } catch {}

		if (res.status === 401) {
			if (attemptedRefresh) throw new Error('Niet geautoriseerd (401)');
			try { await refresh(); attemptedRefresh = true; continue; } catch (e) {
				console.warn('[admin] refresh failed after 401', e);
				state.accessToken = null; state.refreshToken = null; state.user = null; saveTokens();
				throw new Error('Sessiesleutel verlopen. Log opnieuw in.');
			}
		}

		if (!res.ok) throw new Error(`GQL ${res.status}: ${text}`);

		if (json?.errors) {
			if (isJwtExpiredErrors(json.errors) && !attemptedRefresh && state.refreshToken) {
				try { await refresh(); attemptedRefresh = true; continue; } catch (e) {
					console.warn('[admin] refresh failed after invalid-jwt', e);
					state.accessToken = null; state.refreshToken = null; state.user = null; saveTokens();
					throw new Error('Sessiesleutel verlopen. Log opnieuw in.');
				}
			}
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
					try {
						let d;
						if (state.supportsOrderStatus === false && state.supportsUpdatedAt === false) {
							d = (state.supportsOrderNo === false) ? await gqlRequest(GQL.listOrdersBasicNoNumber, { where }) : await gqlRequest(GQL.listOrdersBasic, { where });
						} else if (state.supportsOrderStatus === false) {
							d = (state.supportsOrderNo === false) ? await gqlRequest(GQL.listOrdersNoStatusNoNumber, { where }) : await gqlRequest(GQL.listOrdersNoStatus, { where });
						} else if (state.supportsUpdatedAt === false) {
							d = (state.supportsOrderNo === false) ? await gqlRequest(GQL.listOrdersNoUpdatedNoNumber, { where }) : await gqlRequest(GQL.listOrdersNoUpdated, { where });
						} else {
							d = (state.supportsOrderNo === false) ? await gqlRequest(GQL.listOrdersNoNumber, { where }) : await gqlRequest(GQL.listOrdersBasic, { where });
						}
						data = d;
					} catch (e2) { throw e2; }
				} else { throw new Error(JSON.stringify(json.errors)); }
			}
			throw new Error(JSON.stringify(json.errors));
		}
		return json.data;
	}
}

const GQL = {
	listOrders: `query ListOrders($where: orders_bool_exp){ orders(order_by:{ created_at: desc }, where:$where){ order_no id klanttype naam telefoon email adres producten totaal status opmerkingen created_at updated_at } }`,
	listOrdersNoStatus: `query ListOrders($where: orders_bool_exp){ orders(order_by:{ created_at: desc }, where:$where){ order_no id klanttype naam telefoon email adres producten totaal opmerkingen created_at updated_at } }`,
	listOrdersNoUpdated: `query ListOrders($where: orders_bool_exp){ orders(order_by:{ created_at: desc }, where:$where){ order_no id klanttype naam telefoon email adres producten totaal status opmerkingen created_at } }`,
	listOrdersBasic: `query ListOrders($where: orders_bool_exp){ orders(order_by:{ created_at: desc }, where:$where){ order_no id klanttype naam telefoon email adres producten totaal opmerkingen created_at } }`,
	listOrdersNoNumber: `query ListOrders($where: orders_bool_exp){ orders(order_by:{ created_at: desc }, where:$where){ id klanttype naam telefoon email adres producten totaal status opmerkingen created_at updated_at } }`,
	listOrdersNoStatusNoNumber: `query ListOrders($where: orders_bool_exp){ orders(order_by:{ created_at: desc }, where:$where){ id klanttype naam telefoon email adres producten totaal opmerkingen created_at updated_at } }`,
	listOrdersNoUpdatedNoNumber: `query ListOrders($where: orders_bool_exp){ orders(order_by:{ created_at: desc }, where:$where){ id klanttype naam telefoon email adres producten totaal status opmerkingen created_at } }`,
	listOrdersBasicNoNumber: `query ListOrders($where: orders_bool_exp){ orders(order_by:{ created_at: desc }, where:$where){ id klanttype naam telefoon email adres producten totaal opmerkingen created_at } }`,
	orderNotes: `query Notes($orderId: uuid!){ order_notes(where:{ order_id:{ _eq:$orderId } }, order_by:{ created_at: desc }){ id note created_at } }`,
	updateStatus: `mutation UpdateStatus($id: uuid!, $status: String!){ update_orders_by_pk(pk_columns:{id:$id}, _set:{ status:$status }){ id status updated_at } }`,
	updateStatusMin: `mutation UpdateStatusMin($id: uuid!, $status: String!){ update_orders_by_pk(pk_columns:{id:$id}, _set:{ status:$status }){ id status } }`,
	addNote: `mutation AddNote($orderId: uuid!, $note: String!){ insert_order_notes_one(object:{ order_id:$orderId, note:$note }){ id created_at } }`,
	listCustomers: `query ListCustomers($search:String!){ customers(order_by:{ created_at: desc }, where:{ _or:[ { naam:{ _ilike:$search } }, { email:{ _ilike:$search } }, { telefoon:{ _ilike:$search } } ] }){ id naam email telefoon referral_code created_at notes extra subscriptions_aggregate{ aggregate{ max{ end_date } } } } }`,
};

const KLANTTYPE_OPTIONS = ['Nieuwe klant','Bestaande klant','Referral','Upgrade','Overig'];
const PRODUCT_CATALOG = ['1 Jaar IPTV (Verplicht)','Android TV Box Standaard','Android TV Box Premium','Extra Afstandsbediening','Installatie aan huis','Antenne / Signaalversterker','Maand IPTV','6 Maanden IPTV'];

function parseProductsText(txt){ if(!txt) return {}; const lines=txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean); const map={}; for(const line of lines){ const m=line.match(/[\-•]\s*(.+?):?\s*(\d+)x/i); if(m){ map[m[1].trim()]=parseInt(m[2],10); } else { map[line.replace(/[\-•]\s*/,'')]=1; } } return map; }
function serializeProducts(map){ const out=[]; for(const k of Object.keys(map)){ const v=map[k]; if(!v) continue; out.push(`- ${k}: ${v}x`); } return out.join('\n'); }

function show(el){ el.classList.remove('hidden'); } function hide(el){ el.classList.add('hidden'); }
function setMsg(el,t,k){ el.textContent=t||''; el.className=`msg ${k||''}`; }
function allowedNextStatuses(current){ if(current==='afgerond') return ['afgerond']; if(current==='in_behandeling') return ['in_behandeling','nieuw','afgerond']; return ['nieuw','in_behandeling','afgerond']; }
function formatOrderNo(n){ if(n==null) return ''; try{ const s=String(parseInt(n,10)); return '#'+s.padStart(5,'0'); }catch{ return ''; } }
function formatDateOnly(ts){ try{ const d=new Date(ts); const dd=String(d.getDate()).padStart(2,'0'); const mm=String(d.getMonth()+1).padStart(2,'0'); const yyyy=d.getFullYear(); return `${dd}-${mm}-${yyyy}`; }catch{ return '-'; } }

function renderOrders(list,supportsStatus){ const c=q('#ordersContainer'); if(!list||!list.length){ c.innerHTML='<div class="panel">Geen resultaten</div>'; return; } const groups={nieuw:[],in_behandeling:[],afgerond:[]}; for(const o of list){ const s=(supportsStatus&&o.status)?o.status:(state.statusOverrides[o.id]||'nieuw'); (groups[s]||groups.nieuw).push(o);} const cmp=(a,b)=>new Date(b.created_at)-new Date(a.created_at); for(const k of Object.keys(groups)) groups[k].sort(cmp); function card(o){ const orderNo=o.order_no!=null?formatOrderNo(o.order_no):''; const effectiveStatus=(supportsStatus&&o.status)?o.status:(state.statusOverrides[o.id]||'nieuw'); const statusClass=effectiveStatus?` status-${effectiveStatus}`:''; const opts=allowedNextStatuses(effectiveStatus); const klantComment=(o.opmerkingen&&o.opmerkingen!=='Geen')?o.opmerkingen.trim():''; const commentPreview=klantComment?`<div class="row"><strong>Opmerking:</strong> ${klantComment.length>60?klantComment.slice(0,57)+'…':klantComment}</div>`:''; return `<div class="order-card${statusClass}" data-id="${o.id}"><h3>${orderNo||'(zonder nummer)'}</h3>${effectiveStatus?`<div class="status-corner"><select class="status-select status-${effectiveStatus}" data-order-id="${o.id}">${opts.map(s=>`<option value="${s}" ${effectiveStatus===s?'selected':''}>${s}</option>`).join('')}</select></div>`:''}<div class="row"><strong>Naam:</strong> ${o.naam||'(naam onbekend)'}</div><div class="row"><strong>Telefoon:</strong> ${o.telefoon||'-'}</div><div class="row"><strong>E-mail:</strong> ${o.email||'-'}</div><div class="row"><strong>Datum:</strong> ${formatDateOnly(o.created_at)}</div><div class="row"><strong>Klanttype:</strong> ${o.klanttype||'-'}</div>${commentPreview}<div class="actions" style="margin-top:8px"><button class="btn" data-act="detail">Details</button></div></div>`;} function section(label,arr,key){ if(!arr.length) return ''; return `<section class="group-section" data-group="${key}"><div class="group-header">${label} <span class="count-badge">${arr.length}</span></div><div class="group-grid">${arr.map(card).join('')}</div></section>`;} c.innerHTML=[section('Nieuw',groups.nieuw,'nieuw'),section('In behandeling',groups.in_behandeling,'in_behandeling'),section('Afgerond',groups.afgerond,'afgerond')].join(''); const summary=q('#statusSummary'); const total=list.length; const mkChip=(key,label,arr)=>`<div class="status-chip ${key}" data-target-group="${key}">${label}<span class="count">${arr.length}</span></div>`; summary.innerHTML=`<div class="summary-chips">${[mkChip('nieuw','Nieuw',groups.nieuw),mkChip('in_behandeling','In behandeling',groups.in_behandeling),mkChip('afgerond','Afgerond',groups.afgerond)].join('')}<div style="margin-left:auto;font-size:.65rem;opacity:.7;font-weight:600">Totaal ${total}</div></div>`; summary.classList.remove('hidden'); summary.querySelectorAll('.status-chip').forEach(ch=>{ ch.onclick=()=>{ const g=ch.getAttribute('data-target-group'); const sec=q(`.group-section[data-group="${g}"]`); if(sec) sec.scrollIntoView({behavior:'smooth',block:'start'}); }; }); }

async function openOrderDialog(order){ const dlg=q('#orderDialog'); const num=order.order_no!=null?formatOrderNo(order.order_no):order.id; q('#dlgTitle').textContent=`Bestelling ${num}`; let notes=[]; try{ const n=await gqlRequest(GQL.orderNotes,{ orderId:order.id }); notes=n.order_notes; }catch{} const effectiveStatus=(state.supportsOrderStatus!==false&&order.status)?order.status:(state.statusOverrides[order.id]||'nieuw'); const opts=allowedNextStatuses(effectiveStatus); const contactPref=order.contactvoorkeur||order.contact_preference||'-'; const orderDate=formatDateOnly(order.created_at); q('#dlgBody').innerHTML=`<div style="margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;gap:12px"><div><strong>Status:</strong> <select id="dlgStatusSelect" class="status-select status-${effectiveStatus}">${opts.map(s=>`<option value="${s}" ${effectiveStatus===s?'selected':''}>${s}</option>`).join('')}</select></div><div style="font-size:.75rem;font-weight:600;opacity:.75">Bestelddatum: ${orderDate}</div></div><div id="field-naam"><strong>Naam:</strong> <span class="value">${order.naam||'-'}</span></div><div id="field-telefoon"><strong>Telefoonnummer:</strong> <span class="value">${order.telefoon||'-'}</span></div><div id="field-email"><strong>E-mail:</strong> <span class="value">${order.email||'-'}</span></div><div id="field-adres"><strong>Adres:</strong> <span class="value">${order.adres||'-'}</span></div><div id="field-contactpref"><strong>Contactvoorkeur:</strong> <span class="value">${contactPref}</span></div><div id="field-klanttype"><strong>Klanttype:</strong> <span class="value">${order.klanttype||'-'}</span></div><div id="field-producten"><strong>Producten:</strong> <pre class="value" style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;padding:8px;border-radius:6px;margin:4px 0">${order.producten||'-'}</pre></div><div id="field-opmerkingen"><strong>Klantopmerking:</strong> ${order.opmerkingen?`<pre class=\"value\" style=\"white-space:pre-wrap;background:#fff;border:1px dashed #e2e8f0;padding:8px;border-radius:6px;margin:4px 0\">${order.opmerkingen}</pre>`:'<span class="value">Geen</span>'}</div>${(state.supportsReferrerEmail!==false&&order.referrer_email)?`<div id="field-refemail"><strong>Referral (e-mail):</strong> <span class="value">${order.referrer_email}</span></div>`:''}<hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0"/><div class="note-box"><textarea id="noteInput" rows="3" placeholder="Interne notitie toevoegen..."></textarea><button id="addNoteBtn" class="btn">Toevoegen</button></div><div class="notes-list">${notes.map(n=>`<div class="note-item">${n.note}<div class="timestamp">${new Date(n.created_at).toLocaleString()}</div></div>`).join('')}</div>`; const actions=dlg.querySelector('.dlg-actions'); if(actions){ const staleCancel=actions.querySelector('#cancelEditBtn'); if(staleCancel) staleCancel.remove(); let edit=actions.querySelector('#editOrderBtn'); if(!edit){ edit=document.createElement('button'); edit.id='editOrderBtn'; edit.type='button'; edit.className='btn btn-secondary'; edit.style.fontSize='.7rem'; edit.textContent='Bewerken'; actions.appendChild(edit);} else { edit.textContent='Bewerken'; edit.className='btn btn-secondary'; edit.disabled=false; edit.style.fontSize='.7rem'; } } dlg.classList.remove('dialog-status-nieuw','dialog-status-in_behandeling','dialog-status-afgerond'); if(['nieuw','in_behandeling','afgerond'].includes(effectiveStatus)) dlg.classList.add('dialog-status-'+effectiveStatus); dlg.showModal(); const sel=q('#dlgStatusSelect'); sel?.addEventListener('change', async ev=>{ const next=ev.target.value; try{ await gqlRequest(GQL.updateStatus,{ id:order.id, status:next }); }catch(e){ const msg=e.message||String(e); if(/field ['\"]?updated_at['\"]? not found/i.test(msg)){ await gqlRequest(GQL.updateStatusMin,{ id:order.id, status:next }); } else { alert('Kon status niet wijzigen: '+msg); } } state.statusOverrides[order.id]=next; await loadAndRender(); }); q('#addNoteBtn').onclick=async()=>{ const note=q('#noteInput').value.trim(); if(!note) return; await gqlRequest(GQL.addNote,{ orderId:order.id, note }); dlg.close(); await loadAndRender(); }; const original={ ...order }; const editBtn=q('#editOrderBtn'); let inEdit=false; function enterEdit(){ if(inEdit) return; inEdit=true; editBtn.textContent='Opslaan'; editBtn.classList.remove('btn-secondary'); editBtn.classList.add('btn'); const cancel=document.createElement('button'); cancel.id='cancelEditBtn'; cancel.type='button'; cancel.textContent='Annuleren'; cancel.className='btn btn-secondary'; cancel.style.fontSize='.7rem'; editBtn.after(cancel); makeEditable('field-naam','text',original.naam); makeEditable('field-telefoon','text',original.telefoon); makeEditable('field-email','email',original.email); makeEditable('field-adres','textarea',original.adres); makeEditable('field-contactpref','text',original.contactvoorkeur||original.contact_preference); makeEditable('field-klanttype','text',original.klanttype); makeEditable('field-producten','textarea',original.producten); makeEditable('field-opmerkingen','textarea',original.opmerkingen); cancel.onclick=()=>{ inEdit=false; cancel.remove(); editBtn.textContent='Bewerken'; editBtn.className='btn btn-secondary'; editBtn.disabled=false; openOrderDialog(original); }; }
 function makeEditable(id,kind,value){ const wrap=q('#'+id); if(!wrap) return; const valEl=wrap.querySelector('.value')||wrap.querySelector('pre.value'); let input; if(id==='field-klanttype'){ input=document.createElement('select'); KLANTTYPE_OPTIONS.forEach(opt=>{ const o=document.createElement('option'); o.value=opt; o.textContent=opt; input.appendChild(o); }); input.value=value||KLANTTYPE_OPTIONS[0]; } else if(id==='field-producten'){ const holder=document.createElement('div'); holder.className='producten-editor'; holder.style.display='flex'; holder.style.flexDirection='column'; holder.style.gap='6px'; const currentMap=parseProductsText(value); PRODUCT_CATALOG.forEach(name=>{ if(!(name in currentMap)) currentMap[name]=0; }); for(const name of PRODUCT_CATALOG){ const row=document.createElement('div'); row.className='prod-row'; row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px'; const label=document.createElement('span'); label.textContent=name; label.style.flex='1'; label.style.fontSize='.75rem'; const minus=document.createElement('button'); minus.type='button'; minus.textContent='-'; minus.className='btn btn-secondary'; minus.style.padding='4px 10px'; minus.style.fontSize='.7rem'; const qtySpan=document.createElement('span'); qtySpan.textContent=currentMap[name]; qtySpan.style.minWidth='20px'; qtySpan.style.textAlign='center'; qtySpan.style.fontWeight='600'; qtySpan.style.fontSize='.75rem'; const plus=document.createElement('button'); plus.type='button'; plus.textContent='+'; plus.className='btn'; plus.style.padding='4px 10px'; plus.style.fontSize='.7rem'; function refreshVisibility(){ row.style.display=(parseInt(qtySpan.textContent,10)===0)?'none':'flex'; } minus.onclick=()=>{ let v=parseInt(qtySpan.textContent,10); if(v>0){ v--; qtySpan.textContent=v; currentMap[name]=v; refreshVisibility(); } }; plus.onclick=()=>{ let v=parseInt(qtySpan.textContent,10); v++; qtySpan.textContent=v; currentMap[name]=v; row.style.display='flex'; }; refreshVisibility(); row.append(label,minus,qtySpan,plus); holder.appendChild(row);} const hidden=document.createElement('textarea'); hidden.style.display='none'; hidden.value=serializeProducts(currentMap); holder.appendChild(hidden); holder.addEventListener('click',()=>{ hidden.value=serializeProducts(currentMap); }); if(valEl) valEl.replaceWith(holder); wrap.dataset.editing='1'; return; } else if(kind==='textarea'){ input=document.createElement('textarea'); input.rows=3; } else { input=document.createElement('input'); input.type=kind; } input.value=value||''; input.style.width='100%'; input.style.margin='4px 0'; if(valEl) valEl.replaceWith(input); wrap.dataset.editing='1'; }
 async function saveEdits(){ clearErrors(); const changed={}; const diffs=[]; collectChange('naam','field-naam'); collectChange('telefoon','field-telefoon'); collectChange('email','field-email'); collectChange('adres','field-adres'); collectChange('klanttype','field-klanttype'); collectChange('producten','field-producten'); collectChange('opmerkingen','field-opmerkingen'); function collectChange(field,id){ const wrap=q('#'+id); if(!wrap) return; let input=wrap.querySelector('input,textarea,select'); if(field==='producten') input=wrap.querySelector('.producten-editor textarea'); if(!input) return; const before=(original[field]||'').trim(); const after=(input.value||'').trim(); if(after!==before){ changed[field]=after||null; if(field==='producten'){ const beforeMap=parseProductsText(before); const afterMap=parseProductsText(after); const diffParts=[]; const allNames=new Set([...Object.keys(beforeMap),...Object.keys(afterMap)]); for(const n of allNames){ const b=beforeMap[n]||0; const a=afterMap[n]||0; if(b!==a) diffParts.push(`${n}: ${b}→${a}`); } diffs.push('producten gewijzigd ('+diffParts.join('; ')+')'); } else { diffs.push(`${field}: "${truncate(before)}" → "${truncate(after)}"`); } } } function truncate(v){ if(v==null) return ''; const s=String(v); return s.length>40? s.slice(0,37)+'…': s; } const errors=[]; const naamInput=q('#field-naam input,#field-naam textarea,#field-naam select'); if(naamInput && !naamInput.value.trim()){ errors.push('Naam is verplicht'); markError(naamInput); } const emailInput=q('#field-email input'); if(emailInput && emailInput.value.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailInput.value.trim())){ errors.push('E-mail formaat ongeldig'); markError(emailInput); } const telInput=q('#field-telefoon input'); if(telInput && telInput.value.trim() && !/^0[0-9]{9}$/.test(telInput.value.trim())){ errors.push('Telefoon moet 10 cijfers beginnen met 0'); markError(telInput); } const prodInput=q('#field-producten textarea'); if(prodInput && prodInput.value.trim().length===0){ errors.push('Producten mogen niet leeg zijn'); markError(prodInput); } if(errors.length){ showErrors(errors); return; } if(!Object.keys(changed).length){ editBtn.textContent='Geen wijzigingen'; setTimeout(()=>{ openOrderDialog(original); },800); return; } editBtn.disabled=true; editBtn.textContent='Opslaan…'; const mutation=`mutation UpdateOrder($id: uuid!, $changes: orders_set_input!){ update_orders_by_pk(pk_columns:{id:$id}, _set:$changes){ id naam telefoon email adres klanttype producten opmerkingen status updated_at } }`; try{ await gqlRequest(mutation,{ id:original.id, changes:changed }); }catch(e){ const msg=e.message||''; let removed=false; for(const f of Object.keys(changed)){ if(new RegExp(`field ['\"]?${f}['\"]? not found`,'i').test(msg)){ delete changed[f]; removed=true; } } if(removed && Object.keys(changed).length){ try{ await gqlRequest(mutation,{ id:original.id, changes:changed }); }catch(e2){ alert('Kon wijzigingen niet opslaan: '+(e2.message||e2)); return; } } else { alert('Kon wijzigingen niet opslaan: '+msg); return; } } try{ const noteText='Wijzigingen: '+diffs.join('; '); await gqlRequest(GQL.addNote,{ orderId:original.id, note:noteText.slice(0,1000) }); }catch(e3){ console.warn('Kon notitie niet toevoegen',e3); } dlg.close(); await loadAndRender(); }
 editBtn.onclick=()=>{ if(!inEdit) enterEdit(); else saveEdits(); };
 function markError(el){ el.style.outline='2px solid #dc2626'; }
 function clearErrors(){ const box=q('#editErrorBox'); if(box) box.remove(); $$('input,textarea,select').forEach(e=>{ if(e.style) e.style.outline=''; }); }
 function showErrors(list){ const box=document.createElement('div'); box.id='editErrorBox'; box.style.background='#fee2e2'; box.style.border='1px solid #f8d5d5'; box.style.color='#b91c1c'; box.style.padding='8px 10px'; box.style.borderRadius='8px'; box.style.fontSize='.7rem'; box.style.margin='6px 0'; box.innerHTML='<strong>Validatie fouten:</strong><br>'+list.map(e=>'- '+e).join('<br>'); const body=q('#dlgBody'); const statusRow=body.firstElementChild; body.insertBefore(box,statusRow.nextSibling); }
}

async function loadAndRender(){ try{ const searchRaw=q('#searchInput').value?.trim(); const searchPattern=searchRaw?`%${searchRaw}%`:'%'; if(state.view==='orders'){ const statusVal=q('#statusFilter').value||null; const where={}; if(statusVal) where.status={ _eq:statusVal }; if(searchPattern && searchPattern!=='%'){ where._or=[{ naam:{ _ilike:searchPattern } },{ email:{ _ilike:searchPattern } },{ telefoon:{ _ilike:searchPattern } }]; } let data; const tryStatus=state.supportsOrderStatus!==false; const tryUpdated=state.supportsUpdatedAt!==false; const tryNumber=state.supportsOrderNo!==false; const attemptFull=tryStatus&&tryUpdated&&tryNumber; let usedVariant='full'; try{ if(attemptFull){ const d=await gqlRequest(GQL.listOrders,{ where }); state.supportsOrderStatus=true; state.supportsUpdatedAt=true; state.supportsOrderNo=true; data=d; usedVariant='full'; } else if(tryUpdated && !tryStatus && tryNumber){ const d=await gqlRequest(GQL.listOrdersNoStatus,{ where }); state.supportsUpdatedAt=true; state.supportsOrderNo=true; data=d; usedVariant='noStatus'; } else if(tryUpdated && !tryStatus && !tryNumber){ const d=await gqlRequest(GQL.listOrdersNoStatusNoNumber,{ where }); state.supportsUpdatedAt=true; state.supportsOrderNo=false; data=d; usedVariant='noStatusNoNum'; } else if(!tryUpdated && tryStatus){ const d=tryNumber?await gqlRequest(GQL.listOrdersNoUpdated,{ where }):await gqlRequest(GQL.listOrdersNoUpdatedNoNumber,{ where }); data=d; usedVariant=tryNumber?'noUpdated':'noUpdatedNoNum'; } else { const d=tryNumber?await gqlRequest(GQL.listOrdersBasic,{ where }):await gqlRequest(GQL.listOrdersBasicNoNumber,{ where }); data=d; usedVariant=tryNumber?'basic':'basicNoNum'; } }catch(e){ const msg=e.message||String(e); const missingStatus=/field ['\"]?status['\"]? not found/i.test(msg); const missingUpdated=/field ['\"]?updated_at['\"]? not found/i.test(msg); const missingOrderNo=/field ['\"]?order_no['\"]? not found/i.test(msg); if(missingStatus||missingUpdated||missingOrderNo){ if(missingStatus) state.supportsOrderStatus=false; if(missingUpdated) state.supportsUpdatedAt=false; if(missingOrderNo) state.supportsOrderNo=false; try{ let d; if(state.supportsOrderStatus===false && state.supportsUpdatedAt===false){ d=(state.supportsOrderNo===false)?await gqlRequest(GQL.listOrdersBasicNoNumber,{ where }):await gqlRequest(GQL.listOrdersBasic,{ where }); usedVariant=(state.supportsOrderNo===false)?'basicNoNum':'basic'; } else if(state.supportsOrderStatus===false){ d=(state.supportsOrderNo===false)?await gqlRequest(GQL.listOrdersNoStatusNoNumber,{ where }):await gqlRequest(GQL.listOrdersNoStatus,{ where }); usedVariant=(state.supportsOrderNo===false)?'noStatusNoNum':'noStatus'; } else { d=(state.supportsOrderNo===false)?await gqlRequest(GQL.listOrdersNoUpdatedNoNumber,{ where }):await gqlRequest(GQL.listOrdersNoUpdated,{ where }); usedVariant=(state.supportsOrderNo===false)?'noUpdatedNoNum':'noUpdated'; } data=d; }catch(e2){ throw e2; } } else { throw e; } } const hasStatus=(state.supportsOrderStatus!==false)&&['full','noUpdated','fullNoNum'].includes(usedVariant); renderOrders(data.orders,hasStatus); q('#ordersContainer').classList.remove('hidden'); q('#customersContainer').classList.add('hidden'); } else { const data=await gqlRequest(GQL.listCustomers,{ search:searchPattern }); renderCustomers(data.customers); q('#customersContainer').classList.remove('hidden'); q('#ordersContainer').classList.add('hidden'); } }catch(e){ console.warn('[admin] load failed',e); const target=state.view==='customers'?q('#customersContainer'):q('#ordersContainer'); const msg=e.message||String(e); const missingStatus=msg.includes("field 'status' not found in type: 'orders'")||/field ['\"]?status['\"]? not found/i.test(msg); const missingUpdated=msg.includes("field 'updated_at' not found in type: 'orders'")||/field ['\"]?updated_at['\"]? not found/i.test(msg); const missingOrderNo=msg.includes("field 'order_no' not found in type: 'orders'")||/field ['\"]?order_no['\"]? not found/i.test(msg); if(state.view==='orders' && (missingStatus||missingUpdated||missingOrderNo)){ try{ if(missingStatus) state.supportsOrderStatus=false; if(missingUpdated) state.supportsUpdatedAt=false; if(missingOrderNo) state.supportsOrderNo=false; const searchRaw=q('#searchInput').value?.trim(); const searchPattern=searchRaw?`%${searchRaw}%`:'%'; const statusVal=q('#statusFilter').value||null; const where={}; if(statusVal && state.supportsOrderStatus!==false) where.status={ _eq:statusVal }; if(searchPattern && searchPattern!=='%'){ where._or=[{ naam:{ _ilike:searchPattern } },{ email:{ _ilike:searchPattern } },{ telefoon:{ _ilike:searchPattern } }]; } let d; if(state.supportsOrderStatus===false && state.supportsUpdatedAt===false){ d=(state.supportsOrderNo===false)?await gqlRequest(GQL.listOrdersBasicNoNumber,{ where }):await gqlRequest(GQL.listOrdersBasic,{ where }); renderOrders(d.orders,false); } else if(state.supportsOrderStatus===false){ d=(state.supportsOrderNo===false)?await gqlRequest(GQL.listOrdersNoStatusNoNumber,{ where }):await gqlRequest(GQL.listOrdersNoStatus,{ where }); renderOrders(d.orders,false); } else if(state.supportsUpdatedAt===false){ d=(state.supportsOrderNo===false)?await gqlRequest(GQL.listOrdersNoUpdatedNoNumber,{ where }):await gqlRequest(GQL.listOrdersNoUpdated,{ where }); renderOrders(d.orders,true); } else { d=(state.supportsOrderNo===false)?await gqlRequest(GQL.listOrdersNoNumber,{ where }):await gqlRequest(GQL.listOrdersBasic,{ where }); renderOrders(d.orders,state.supportsOrderStatus!==false); } return; }catch(e2){ console.warn('[admin] fallback after missing status/updated_at failed',e2); } } target.innerHTML=`<div class="panel" style="color:#b91c1c">Fout bij laden: ${msg}</div>`; if(/Sessiesleutel verlopen|invalid-jwt|JWTExpired|Niet geautoriseerd/i.test(msg)){ state.accessToken=null; state.refreshToken=null; state.user=null; saveTokens(); hide(q('#appSection')); show(q('#authSection')); setMsg(q('#authMsg'),'Sessie verlopen. Log opnieuw in.',''); } } }

function wireEvents(){ const doLogin=async()=>{ setMsg(q('#authMsg'),'Aan het inloggen...',''); try{ await signIn(q('#email').value.trim(), q('#password').value); setMsg(q('#authMsg'),'Ingelogd','success'); hide(q('#authSection')); show(q('#appSection')); await loadAndRender(); }catch(e){ setMsg(q('#authMsg'), e.message||String(e),'error'); } }; q('#loginBtn').onclick=e=>{ e.preventDefault(); doLogin(); }; const form=q('#authForm'); form?.addEventListener('submit',e=>{ e.preventDefault(); doLogin(); }); q('#refreshBtn').onclick=loadAndRender; q('#statusFilter').onchange=loadAndRender; q('#searchInput').oninput=()=>{ clearTimeout(window.__t); window.__t=setTimeout(loadAndRender,300); }; q('#logoutBtn').onclick=()=>{ state.accessToken=null; state.refreshToken=null; state.user=null; saveTokens(); hide(q('#appSection')); show(q('#authSection')); setMsg(q('#authMsg'),'Uitgelogd',''); }; q('#ordersContainer').addEventListener('click', async ev=>{ const btn=ev.target.closest('button[data-act]'); if(!btn) return; const card=ev.target.closest('.order-card'); const id=card?.dataset?.id; if(!id) return; let orderRes; try{ const includeRef=state.supportsReferrerEmail===true; if(state.supportsOrderStatus===false){ if(state.supportsOrderNo===false){ orderRes=await gqlRequest(`query($id: uuid!){ orders_by_pk(id:$id){ id naam telefoon email adres producten totaal opmerkingen ${includeRef?'referrer_email':''} created_at updated_at } }`,{ id }); } else { orderRes=await gqlRequest(`query($id: uuid!){ orders_by_pk(id:$id){ order_no id naam telefoon email adres producten totaal opmerkingen ${includeRef?'referrer_email':''} created_at updated_at } }`,{ id }); } state.supportsOrderStatus=false; } else { if(state.supportsOrderNo===false){ orderRes=await gqlRequest(`query($id: uuid!){ orders_by_pk(id:$id){ id naam telefoon email adres producten totaal status opmerkingen ${includeRef?'referrer_email':''} created_at updated_at } }`,{ id }); } else { orderRes=await gqlRequest(`query($id: uuid!){ orders_by_pk(id:$id){ order_no id naam telefoon email adres producten totaal status opmerkingen ${includeRef?'referrer_email':''} created_at updated_at } }`,{ id }); } state.supportsOrderStatus=true; } }catch(e){ const msg=e.message||String(e); const noStatus=/field ['\"]?status['\"]? not found/i.test(msg); const noNumber=/field ['\"]?order_no['\"]? not found/i.test(msg); const noRefEmail=/field ['\"]?referrer_email['\"]? not found/i.test(msg); if(noStatus||noNumber||noRefEmail){ if(noStatus) state.supportsOrderStatus=false; if(noNumber) state.supportsOrderNo=false; if(noRefEmail) state.supportsReferrerEmail=false; const base=state.supportsOrderStatus===false ? (state.supportsOrderNo===false?`query($id: uuid!){ orders_by_pk(id:$id){ id naam telefoon email adres producten totaal opmerkingen created_at updated_at } }`:`query($id: uuid!){ orders_by_pk(id:$id){ order_no id naam telefoon email adres producten totaal opmerkingen created_at updated_at } }`) : (state.supportsOrderNo===false?`query($id: uuid!){ orders_by_pk(id:$id){ id naam telefoon email adres producten totaal status opmerkingen created_at updated_at } }`:`query($id: uuid!){ orders_by_pk(id:$id){ order_no id naam telefoon email adres producten totaal status opmerkingen created_at updated_at } }`); orderRes=await gqlRequest(base,{ id }); } else { throw e; } } const order=orderRes.orders_by_pk; if(!order) return; if(btn.dataset.act==='detail') await openOrderDialog(order); }); q('#ordersContainer').addEventListener('change', async ev=>{ const sel=ev.target.closest('select.status-select'); if(!sel) return; const id=sel.getAttribute('data-order-id'); const next=sel.value; try{ await gqlRequest(GQL.updateStatus,{ id, status:next }); }catch(e){ const msg=e.message||String(e); if(/field ['\"]?updated_at['\"]? not found/i.test(msg)){ await gqlRequest(GQL.updateStatusMin,{ id, status:next }); } else { alert('Kon status niet wijzigen: '+msg); } } state.statusOverrides[id]=next; await loadAndRender(); }); }

(async function main(){ console.info('[admin] build v20251113c initializing'); loadTokens(); wireEvents(); if(state.accessToken){ hide(q('#authSection')); show(q('#appSection')); try{ await loadAndRender(); }catch(e){ console.warn('initial load failed',e); } } })();
console.info('[admin] build v20251113c loaded');

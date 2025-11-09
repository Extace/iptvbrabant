// Small helpers
const ASSET_VERSION = '20251109'; // bump on deploy to bust caches
const safeInt = (v, def = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};

const formatCurrency = (value) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);

let isNewCustomer = false;
let activeTooltip = null;
let activeIcon = null;

// === TOOLTIP SYSTEM (single element used for all icons) ===
const tooltip = document.createElement('div');
tooltip.className = 'tooltip';
document.body.appendChild(tooltip);

function positionTooltipForIcon(icon, text) {
  tooltip.textContent = text;
  tooltip.classList.remove('above', 'below');
  tooltip.classList.add('visible');

  const rect = icon.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;

  let top, left;
  if (spaceBelow >= tooltipRect.height + 20) {
    top = rect.bottom + 10;
    left = rect.left + rect.width / 2;
    tooltip.classList.add('below');
  } else if (spaceAbove >= tooltipRect.height + 20) {
    top = rect.top - tooltipRect.height - 10;
    left = rect.left + rect.width / 2;
    tooltip.classList.add('above');
  } else {
    top = rect.bottom + 10;
    left = rect.left + rect.width / 2;
    tooltip.classList.add('below');
  }

  // Clamp horizontally to keep tooltip on-screen (mobile-safe)
  const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  const margin = 8; // minimal side gap
  const half = tooltipRect.width / 2;
  const minCenter = margin + half;
  const maxCenter = Math.max(minCenter, vw - margin - half);
  const clamped = Math.min(Math.max(left, minCenter), maxCenter);

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${clamped}px`;
  tooltip.style.transform = 'translateX(-50%)';
}

function hideTooltip() {
  tooltip.classList.remove('visible');
  activeTooltip = null;
  activeIcon = null;
}

document.querySelectorAll('.info-icon').forEach(icon => {
  const text = icon.getAttribute('data-tooltip');
  if (!text) return;

  let timeout;

  const open = () => {
    clearTimeout(timeout);
    activeTooltip = tooltip;
    activeIcon = icon;
    positionTooltipForIcon(icon, text);
  };

  icon.addEventListener('mouseenter', open);
  icon.addEventListener('focus', open);

  icon.addEventListener('mouseleave', () => {
    timeout = setTimeout(hideTooltip, 100);
  });

  icon.addEventListener('blur', () => {
    timeout = setTimeout(hideTooltip, 100);
  });

  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    if (tooltip.classList.contains('visible') && activeIcon === icon) {
      hideTooltip();
    } else {
      open();
    }
  });
});

document.addEventListener('click', () => hideTooltip());

// ===================== SIMPLE VIEW ROUTER =====================
// Allow browser back/forward to move between internal screens.
// We treat each screen as a view and sync with history + hash.
const Views = { HOME: 'home', FORM: 'form', SUMMARY: 'summary', SUCCESS: 'success' };

function setView(view, opts = {}) {
  const sel = document.getElementById('selection');
  const form = document.getElementById('orderForm');
  const summary = document.getElementById('summaryScreen');
  const success = document.getElementById('successScreen');
  [sel, form, summary, success].forEach(el => el && el.classList.remove('active'));

  switch (view) {
    case Views.HOME:
      sel?.classList.add('active');
      resetForm();
      initSliders();
      break;
    case Views.FORM: {
      const type = opts.type === 'recurring' ? 'recurring' : 'new';
      isNewCustomer = (type === 'new');
      const fixedIptv = document.getElementById('fixedIptv');
      fixedIptv.classList.toggle('hidden', !isNewCustomer);
      document.getElementById('referredSection').classList.toggle('hidden', !isNewCustomer);
      document.getElementById('newCustomerWarning').classList.toggle('hidden', !isNewCustomer);
      document.getElementById('customerTypeTitle').textContent = isNewCustomer ? 'Nieuwe klant' : 'Bestaande klant';
      if (opts.reset) resetForm(); else { updateAddressRequired(); updateTotal(); }
      form?.classList.add('active');
      break; }
    case Views.SUMMARY:
      summary?.classList.add('active');
      break;
    case Views.SUCCESS:
      success?.classList.add('active');
      break;
  }
}

function pushView(view, extra = {}) {
  const hash = view === Views.FORM ? `#form-${extra.type || 'new'}` : `#${view}`;
  history.pushState({ v: view, ...extra }, '', hash);
}

// Navigation helpers
function goHome() { pushView(Views.HOME); setView(Views.HOME); }

function goBack() { history.back(); }

function backToForm() { history.back(); }

function resetForm() {
  document.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
  document.querySelectorAll('input[type="number"]').forEach(i => i.value = '');
  document.querySelectorAll('.count-input').forEach(d => d.classList.add('hidden'));
  document.getElementById('newCustomerWarning').classList.add('hidden');
  document.getElementById('referredSection').classList.add('hidden');
  updateAddressRequired();
  updateTotal();
  hideTooltip();
}

function showForm(type) { pushView(Views.FORM, { type }); setView(Views.FORM, { type, reset: true }); }

function toggleCount(name) {
  const checkbox = document.querySelector(`input[name="${name}"]`);
  const countDiv = document.getElementById(`count_${name}`);
  const input = document.querySelector(`input[name="count_${name}"]`);
  if (checkbox.checked) {
    countDiv.classList.remove('hidden');
    if (!input.value) input.value = '1';
    if (name === 'extra_connectie' && safeInt(input.value, 0) > 2) input.value = '2';
  } else {
    countDiv.classList.add('hidden');
    if (input) input.value = '';
  }
  updateTotal();
  updateAddressRequired();
}

function showGoogleTvTooltip() {
  const checkbox = document.querySelector('input[name="tv_license"]');
  const icon = checkbox?.closest('.device-item')?.querySelector('.info-icon');
  if (checkbox.checked && icon) {
    positionTooltipForIcon(icon, icon.getAttribute('data-tooltip'));
  }
}

function updateAddressRequired() {
  const hardwareSelected =
    document.querySelector('input[name="android_std"]').checked ||
    document.querySelector('input[name="android_pro"]').checked ||
    document.querySelector('input[name="apple_tv"]').checked;
  const addressField = document.getElementById('addressField');
  const addressLabel = document.getElementById('addressLabel');
  const requiredStar = addressLabel.querySelector('.required-star');
  if (hardwareSelected) {
    addressField.setAttribute('required', 'required');
    if (!requiredStar) {
      const star = document.createElement('span');
      star.className = 'required-star';
      star.textContent = '*';
      addressLabel.appendChild(star);
    }
  } else {
    addressField.removeAttribute('required');
    if (requiredStar) requiredStar.remove();
  }
}

function updateTotal() {
  let total = 0;

  const items = [
    {name: 'android_std', price: 130},
    {name: 'android_pro', price: 210},
    {name: 'apple_tv', price: 260},
    {name: 'mobile_android', price: 20},
    {name: 'mobile_iphone', price: 20},
    {name: 'tv_license', price: 20}
  ];

  let anySelected = false;
  items.forEach(item => {
    const check = document.querySelector(`input[name="${item.name}"]`);
    const countInput = document.querySelector(`input[name="count_${item.name}"]`);
    if (check && check.checked) {
      anySelected = true;
      const count = safeInt(countInput?.value, 1);
      total += count * item.price;
    }
  });

  if (isNewCustomer) total += 90; // fixed iptv fee for new customers

  const extraInput = document.querySelector('input[name="count_extra_connectie"]');
  if (extraInput && extraInput.value) {
    const count = Math.min(Math.max(safeInt(extraInput.value, 0), 0), 2);
    if (count > 0) anySelected = true;
    total += count * 90;
  }

  const totalBox = document.getElementById('total');
  totalBox.textContent = `Totaal: ${formatCurrency(total)}`;
  totalBox.style.display = 'block';

  // update floating cart (if present)
  try { updateBasket(); } catch (e) { /* ignore if basket missing */ }

  // enable or show warning if no product is selected (for new customers)
  const warn = document.getElementById('newCustomerWarning');
  if (isNewCustomer && !anySelected) {
    warn.classList.remove('hidden');
  } else {
    warn.classList.add('hidden');
  }
}

function showSummary() {
  const form = document.getElementById('form');
  const data = new FormData(form);
  const hasProduct =
    data.get('android_std') || data.get('android_pro') || data.get('apple_tv') ||
    data.get('mobile_android') || data.get('mobile_iphone') || data.get('tv_license') ||
    data.get('extra_connectie');
  if (isNewCustomer && !hasProduct) {
    // don't allow accidental orders without products
    alert('Kies minimaal 1 apparaat of applicatie om door te gaan.');
    return;
  }
  const hardwareSelected = data.get('android_std') || data.get('android_pro') || data.get('apple_tv');
  const address = data.get('address') || '';
  if (hardwareSelected && !address.trim()) {
    alert('Vul een adres in voor bezorging van hardware.');
    return;
  }

  let summary = `IPTV Brabant\n────────────────────\nBESTELLING SAMENVATTING\n────────────────────\n\n`;
  summary += `KLANT: ${isNewCustomer ? 'Nieuwe klant' : 'Bestaande klant'}\n`;
  summary += `Naam: ${data.get('firstName') || ''} ${data.get('lastName') || ''}\n`;
  summary += `Telefoon: ${data.get('phone') || ''}\n`;
  summary += `E-mail: ${data.get('email') || ''}\n`;
  if (hardwareSelected) summary += `Adres: ${address}\n`;
  if (isNewCustomer && data.get('referred')) summary += `Doorverwezen door: ${data.get('referred')} → 3 maanden gratis voor de verwijzer!\n`;
  summary += `Contact: ${data.get('contact') === 'call' ? 'Telefonisch' : 'WhatsApp'}\n\n`;
  summary += `GEKOZEN APPARATEN:\n`;
  const names = {
    android_std: 'Android TV Box Standaard',
    android_pro: 'Android TV Box Pro (RetroGaming)',
    apple_tv: 'Apple TV Box 4K',
    mobile_android: 'Applicatie Android',
    mobile_iphone: 'Applicatie iPhone',
    tv_license: 'Applicatie Google TV',
    extra_connectie: 'Extra connectie'
  };
  const selected = [];
  Object.keys(names).forEach(key => {
    if (data.get(key)) selected.push(`• ${names[key]}: ${data.get('count_' + key) || '1'}x`);
  });
  if (isNewCustomer) selected.unshift('• 1 Jaar IPTV (Verplicht): 1x');
  summary += selected.join('\n') + '\n\n';
  summary += `TOTAAL: ${document.getElementById('total').textContent}\n`;
  if (data.get('comments')) summary += `\nOpmerkingen: ${data.get('comments')}`;
  document.getElementById('summaryContent').textContent = summary;
  document.getElementById('orderForm').classList.remove('active');
  document.getElementById('summaryScreen').classList.add('active');
  pushView(Views.SUMMARY);
}

document.getElementById('confirmOrder')?.addEventListener('change', function() {
  document.getElementById('placeOrderBtn').disabled = !this.checked;
});

document.getElementById('placeOrderBtn')?.addEventListener('click', async () => {
  const data = new FormData();
  const formData = new FormData(document.getElementById('form'));
  data.append('Klanttype', isNewCustomer ? 'Nieuwe klant' : 'Bestaande klant');
  data.append('Naam', (formData.get('firstName') || '') + ' ' + (formData.get('lastName') || ''));
  data.append('Telefoon', formData.get('phone') || '');
  data.append('email', formData.get('email') || '');
  if (formData.get('android_std') || formData.get('android_pro') || formData.get('apple_tv')) {
    data.append('Adres', formData.get('address') || '');
  }
  data.append('Doorverwezen door', formData.get('referred') || 'Geen');
  data.append('Contact', formData.get('contact') === 'call' ? 'Telefonisch' : 'WhatsApp');
  data.append('Gekozen apparaten', document.getElementById('summaryContent').textContent.split('GEKOZEN APPARATEN:')[1]?.split('TOTAAL:')[0]?.trim() || '');
  data.append('Totaalbedrag', document.getElementById('total').textContent);
  data.append('Opmerkingen', formData.get('comments') || 'Geen');
  try {
    await fetch('https://usebasin.com/f/cf62f7453e30', { method: 'POST', body: data });
  } catch (e) {
    // ignore network errors silently for now
  }
  document.getElementById('summaryScreen').classList.remove('active');
  document.getElementById('successScreen').classList.add('active');
  pushView(Views.SUCCESS);
});

function initSliders() {
  if (typeof Swiper === 'undefined') return;
  const sliderEls = Array.from(document.querySelectorAll('.logo-slider'));
  if (!sliderEls.length) return;

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  // Restore original mobile behaviour: move both sliders normally (no alternation), multiple logos per view like desktop scaling.
  const instances = sliderEls.map((el) => new Swiper(el, {
    loop: true,
    autoplay: { delay: 2500, disableOnInteraction: false },
    speed: 800,
    slidesPerView: 2,
    spaceBetween: 40,
    grabCursor: true,
    breakpoints: {
      640: { slidesPerView: 3, spaceBetween: 50 },
      768: { slidesPerView: 4, spaceBetween: 60 }
    }
  }));

  // Desktop cascade offset: shift second slider so its logos sit between the first row's logos.
  if (!isMobile && instances.length >= 2) {
    const second = instances[1];
    // Wait one animation frame so slides are laid out
    requestAnimationFrame(() => {
      const firstSlide = second.el.querySelector('.swiper-slide');
      if (firstSlide) {
        const slideWidth = firstSlide.getBoundingClientRect().width;
        const spacing = second.params.spaceBetween;
        // Apply left padding equal to half slide + half spacing to offset between two logos.
        second.el.querySelector('.swiper-wrapper').style.paddingLeft = ((slideWidth + spacing) / 2) + 'px';
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Append version to local image URLs to ensure fresh loads after updates
  try {
    document.querySelectorAll('img[src^="images/"]').forEach(img => {
      const src = img.getAttribute('src');
      if (!src) return;
      if (src.includes('?')) {
        if (!src.includes('v=')) img.setAttribute('src', src + '&v=' + ASSET_VERSION);
      } else {
        img.setAttribute('src', src + '?v=' + ASSET_VERSION);
      }
    });
  } catch (_) { /* safe no-op if DOM not ready */ }

  // Initial view selection from hash
  const raw = (location.hash || '#home').replace('#', '');
  if (raw.startsWith('form-')) {
    const type = raw.split('-')[1] || 'new';
    history.replaceState({ v: Views.FORM, type }, '', `#form-${type}`);
    setView(Views.FORM, { type, reset: true });
  } else if (raw === 'summary') {
    history.replaceState({ v: Views.SUMMARY }, '', '#summary');
    setView(Views.SUMMARY);
  } else if (raw === 'success') {
    history.replaceState({ v: Views.SUCCESS }, '', '#success');
    setView(Views.SUCCESS);
  } else {
    history.replaceState({ v: Views.HOME }, '', '#home');
    setView(Views.HOME);
  }
  initSliders();
  // bind cart button behaviors
  const cartBtn = document.getElementById('cartBtn');
  const cartPanel = document.getElementById('cartPanel');
  if (cartBtn) {
    cartBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // open summary for quick checkout
      showSummary();
    });
    cartBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showSummary();
      }
    });
  }
  // clicking outside should close any panel (handled by global click)
});

// Browser back/forward handler
window.addEventListener('popstate', (e) => {
  const s = e.state || { v: Views.HOME };
  if (s.v === Views.FORM) setView(Views.FORM, { type: s.type, reset: false });
  else setView(s.v || Views.HOME);
});

// update the floating basket display
function updateBasket() {
  const totalBox = document.getElementById('total');
  const cartAmount = document.querySelector('.cart-amount');
  const panelAmount = document.getElementById('cartPanelAmount');
  if (!totalBox) return;
  const text = totalBox.textContent.replace(/^Totaal:\s*/, '') || formatCurrency(0);
  if (cartAmount) cartAmount.textContent = text;
  if (panelAmount) panelAmount.textContent = text;
}

// initial sync
updateTotal();

// Hourfold concept landing page: small, dependency-free interactions.
(function () {
  'use strict';

  // ---------- Mobile navigation ----------
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');

  function setNav(open) {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.sr-only').textContent = open ? 'Close menu' : 'Open menu';
  }

  toggle.addEventListener('click', () => setNav(!nav.classList.contains('is-open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setNav(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNav(false); });

  // ---------- Hero timer (decorative) ----------
  const timerEl = document.getElementById('hero-timer');
  let seconds = 1 * 3600 + 24 * 60 + 36;
  const pad = (n) => String(n).padStart(2, '0');
  setInterval(() => {
    seconds += 1;
    timerEl.textContent = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  }, 1000);

  // ---------- Invoice builder ----------
  const linesEl = document.getElementById('b-lines');
  const clientEl = document.getElementById('b-client');
  const currencyEl = document.getElementById('b-currency');
  const taxEl = document.getElementById('b-tax');
  const pv = {
    client: document.getElementById('pv-client'),
    date: document.getElementById('pv-date'),
    lines: document.getElementById('pv-lines'),
    subtotal: document.getElementById('pv-subtotal'),
    tax: document.getElementById('pv-tax'),
    total: document.getElementById('pv-total'),
  };

  let lines = [
    { desc: 'Landing page design', hours: 12, rate: 35 },
    { desc: 'Front-end development', hours: 9, rate: 35 },
    { desc: 'Revisions', hours: 2, rate: 35 },
  ];

  const toNumber = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const money = () => new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyEl.value });

  pv.date.textContent = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date());

  function renderForm() {
    linesEl.replaceChildren();
    lines.forEach((line, i) => {
      const row = document.createElement('div');
      row.className = 'line';
      row.innerHTML = `
        <label class="cell cell-desc"><span class="cap" aria-hidden="true">Description</span>
          <input type="text" aria-label="Line ${i + 1} description" data-key="desc" placeholder="Description"></label>
        <label class="cell"><span class="cap" aria-hidden="true">Hours</span>
          <input type="number" aria-label="Line ${i + 1} hours" data-key="hours" min="0" step="0.25" inputmode="decimal"></label>
        <label class="cell"><span class="cap" aria-hidden="true">Rate</span>
          <input type="number" aria-label="Line ${i + 1} hourly rate" data-key="rate" min="0" step="1" inputmode="decimal"></label>
        <button type="button" class="line-remove" aria-label="Remove line ${i + 1}">×</button>`;
      row.querySelector('[data-key="desc"]').value = line.desc;
      row.querySelector('[data-key="hours"]').value = line.hours;
      row.querySelector('[data-key="rate"]').value = line.rate;
      row.dataset.index = i;
      linesEl.append(row);
    });
    linesEl.querySelectorAll('.line-remove').forEach((btn) => { btn.disabled = lines.length === 1; });
  }

  function renderPreview() {
    const fmt = money();
    pv.client.textContent = clientEl.value.trim() || 'Your client';
    pv.lines.replaceChildren();

    let subtotal = 0;
    lines.forEach((line) => {
      const amount = toNumber(line.hours) * toNumber(line.rate);
      subtotal += amount;
      const tr = document.createElement('tr');
      const item = document.createElement('td');
      const hours = document.createElement('td');
      const sum = document.createElement('td');
      item.textContent = line.desc.trim() || 'Untitled item';
      hours.textContent = toNumber(line.hours).toLocaleString('en-US', { maximumFractionDigits: 2 });
      sum.textContent = fmt.format(amount);
      tr.append(item, hours, sum);
      pv.lines.append(tr);
    });

    const taxRate = Math.min(toNumber(taxEl.value), 100);
    const tax = subtotal * taxRate / 100;
    pv.subtotal.textContent = fmt.format(subtotal);
    pv.tax.textContent = `${fmt.format(tax)}${taxRate ? ` (${taxRate}%)` : ''}`;
    pv.total.textContent = fmt.format(subtotal + tax);
  }

  linesEl.addEventListener('input', (e) => {
    const row = e.target.closest('.line');
    if (!row) return;
    lines[Number(row.dataset.index)][e.target.dataset.key] = e.target.value;
    renderPreview();
  });

  linesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.line-remove');
    if (!btn || lines.length === 1) return;
    lines.splice(Number(btn.closest('.line').dataset.index), 1);
    renderForm();
    renderPreview();
  });

  document.getElementById('b-add').addEventListener('click', () => {
    lines.push({ desc: '', hours: 1, rate: lines[lines.length - 1]?.rate ?? 35 });
    renderForm();
    renderPreview();
    linesEl.lastElementChild.querySelector('input').focus();
  });

  [clientEl, currencyEl, taxEl].forEach((el) => el.addEventListener('input', renderPreview));
  document.getElementById('b-print').addEventListener('click', () => window.print());

  renderForm();
  renderPreview();

  // ---------- Pricing toggle ----------
  const periodButtons = document.querySelectorAll('.toggle-btn');
  const amounts = document.querySelectorAll('.amount');

  periodButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.period;
      periodButtons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      amounts.forEach((el) => {
        const value = Number(el.dataset[period]);
        el.textContent = `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
      });
    });
  });

  // ---------- Early access form (concept: nothing is sent) ----------
  const form = document.getElementById('signup-form');
  const status = document.getElementById('signup-status');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.email;
    if (!email.value.trim() || !email.checkValidity()) {
      status.textContent = 'Please enter a valid email address.';
      email.focus();
      return;
    }
    status.textContent = 'Thanks! This is a concept site, so no email was sent.';
    form.reset();
  });
})();

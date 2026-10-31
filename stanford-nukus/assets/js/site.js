// Shared page behaviour: header, mobile menu, scroll reveal, lead forms, filters
(() => {
  'use strict';
  const root = document.documentElement;
  const header = document.querySelector('.site-header');

  // ---------- header: solid after scrolling ----------
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 30);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const burger = header.querySelector('.burger');
    const close = () => { root.classList.remove('menu-open'); burger && burger.setAttribute('aria-expanded', 'false'); };
    if (burger) {
      burger.addEventListener('click', () => {
        const open = root.classList.toggle('menu-open');
        burger.setAttribute('aria-expanded', String(open));
        burger.setAttribute('aria-label', open ? (burger.dataset.closeLabel || 'Menyuni yopish') : (burger.dataset.openLabel || 'Menyuni ochish'));
      });
      header.querySelectorAll('.main-nav a').forEach(a => a.addEventListener('click', close));
      addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    }
  }

  // ---------- scroll reveal ----------
  const revealables = document.querySelectorAll('.reveal, [data-stairs]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        // small stagger for cards that appear together
        const siblings = el.parentElement ? [...el.parentElement.children].filter(c => c.classList.contains('reveal')) : [];
        const idx = Math.max(0, siblings.indexOf(el));
        el.style.transitionDelay = Math.min(idx, 5) * 80 + 'ms';
        el.classList.add('in');
        io.unobserve(el);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealables.forEach(el => io.observe(el));
  } else {
    revealables.forEach(el => el.classList.add('in'));
  }

  // ---------- phone input: 90 123 45 67 ----------
  document.querySelectorAll('[data-phone]').forEach(input => {
    input.addEventListener('input', () => {
      const d = input.value.replace(/\D/g, '').slice(0, 9);
      const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
      input.value = parts.join(' ');
    });
  });

  // ---------- lead forms ----------
  // NOTE: demo only, no data is sent anywhere. When the client approves, send the form to their Telegram bot or CRM here.
  document.querySelectorAll('form[data-form="lead"]').forEach(form => {
    const fieldOf = el => el.closest('.field');
    const check = el => {
      let ok = true;
      if (el.name === 'name') ok = el.value.trim().length >= 3;
      if (el.name === 'phone') ok = el.value.replace(/\D/g, '').length === 9;
      fieldOf(el).classList.toggle('invalid', !ok);
      return ok;
    };
    form.querySelectorAll('input[required]').forEach(el => {
      el.addEventListener('input', () => { if (fieldOf(el).classList.contains('invalid')) check(el); });
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fields = [...form.querySelectorAll('input[required]')];
      const results = fields.map(check);
      if (results.includes(false)) { fields[results.indexOf(false)].focus(); return; }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      setTimeout(() => {
        form.querySelector('.form-body').hidden = true;
        form.querySelector('.form-done').hidden = false;
      }, 500);
    });
  });

  // ---------- filter chips (teachers, results) ----------
  document.querySelectorAll('[data-filter-group]').forEach(group => {
    const target = document.querySelector(group.dataset.filterGroup);
    if (!target) return;
    group.addEventListener('click', e => {
      const chip = e.target.closest('[data-filter]');
      if (!chip) return;
      group.querySelectorAll('[data-filter]').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
      const f = chip.dataset.filter;
      target.querySelectorAll('[data-tags]').forEach(card => {
        card.hidden = f !== 'all' && !card.dataset.tags.split(' ').includes(f);
      });
    });
  });

  // ---------- level from the test result, carried into the form ----------
  try {
    const level = sessionStorage.getItem('itLevel');
    if (level) document.querySelectorAll('form[data-form="lead"] select[name="level"]').forEach(sel => {
      const opt = [...sel.options].find(o => o.text.startsWith(level));
      if (opt) sel.value = opt.value || opt.text;
    });
  } catch (e) { /* storage blocked */ }
})();

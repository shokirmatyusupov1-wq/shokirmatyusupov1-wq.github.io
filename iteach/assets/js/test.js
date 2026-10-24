// Level test: 12 questions from A1 to B2, result + course recommendation
(() => {
  'use strict';
  const box = document.querySelector('[data-test]');
  if (!box) return;

  const Q = [
    { l: 'A1', q: 'I ___ a student.', o: ['am', 'is', 'are'], a: 0 },
    { l: 'A1', q: 'She ___ from Tashkent.', o: ['come', 'comes', 'coming'], a: 1 },
    { l: 'A1', q: 'There ___ two books on the table.', o: ['is', 'are', 'be'], a: 1 },
    { l: 'A2', q: 'I ___ to the cinema yesterday.', o: ['go', 'went', 'gone'], a: 1 },
    { l: 'A2', q: 'My brother is ___ than me.', o: ['tall', 'taller', 'tallest'], a: 1 },
    { l: 'A2', q: 'We ___ dinner when you called.', o: ['had', 'were having', 'have'], a: 1 },
    { l: 'B1', q: 'I have lived here ___ 2019.', o: ['for', 'since', 'from'], a: 1 },
    { l: 'B1', q: 'If it rains tomorrow, we ___ at home.', o: ['stay', 'will stay', 'would stay'], a: 1 },
    { l: 'B1', q: 'This book ___ by millions of people.', o: ['has read', 'has been read', 'was reading'], a: 1 },
    { l: 'B2', q: 'I wish I ___ more time to study.', o: ['have', 'had', 'will have'], a: 1 },
    { l: 'B2', q: 'By next June, she ___ her degree.', o: ['will finish', 'will have finished', 'finishes'], a: 1 },
    { l: 'B2', q: 'Hardly ___ the house when it started to rain.', o: ['I had left', 'had I left', 'I left'], a: 1 }
  ];
  const LEVELS = {
    A1: { title: 'Boshlang‘ich daraja', text: 'Siz asosiy so‘z va iboralarni bilasiz. Endi grammatika poydevorini mustahkamlash vaqti.', rec: 'Umumiy ingliz tili — A1 guruhi', recText: 'Noldan tartibli boshlaysiz: grammatika, lug‘at va birinchi suhbatlar.' },
    A2: { title: 'Elementar daraja', text: 'Kundalik mavzularda oddiy gaplar tuza olasiz. Keyingi qadam — erkinroq gapirish.', rec: 'Umumiy ingliz tili — A2 guruhi', recText: 'O‘tgan va kelasi zamonlar, kundalik muloqot va speaking amaliyoti.' },
    B1: { title: 'O‘rta daraja', text: 'Ko‘p mavzularda fikringizni tushuntira olasiz. B2 ga juda yaqinsiz.', rec: 'Umumiy ingliz tili B1 yoki B2 sertifikatiga tayyorlov', recText: 'Murakkab grammatika, ravon nutq va sertifikat imtihoni formatidagi mashqlar.' },
    B2: { title: 'O‘rtadan yuqori daraja', text: 'Siz tilni erkin ishlatasiz. Endi buni sertifikat bilan tasdiqlash mumkin.', rec: 'B2 sertifikatiga tayyorlov', recText: 'Imtihonning 4 qismi bo‘yicha mashqlar va sinov imtihonlari.' }
  };

  const $ = s => box.querySelector(s);
  const start = $('.test-start'), run = $('.test-run'), result = $('.test-result');
  let i = 0, answers = [];

  function show(el) { [start, run, result].forEach(x => { x.hidden = x !== el; }); }

  function render() {
    const item = Q[i];
    $('[data-count]').textContent = `${i + 1} / ${Q.length}`;
    $('[data-qlevel]').textContent = item.l;
    $('[data-bar]').style.width = (i / Q.length * 100) + '%';
    const qEl = $('[data-question]');
    qEl.textContent = item.q;
    const opts = $('[data-options]');
    opts.innerHTML = '';
    item.o.forEach((text, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'option';
      b.innerHTML = `<span>${String.fromCharCode(65 + k)}</span>${text}`;
      b.addEventListener('click', () => choose(k, b));
      opts.appendChild(b);
    });
    run.classList.remove('swap');
    void run.offsetWidth;  // restart the small entrance animation
    run.classList.add('swap');
  }

  let busy = false;
  function choose(k, btn) {
    if (busy) return;
    busy = true;
    answers[i] = k;
    if (btn) btn.classList.add('picked');
    setTimeout(() => {
      busy = false;
      i++;
      if (i < Q.length) render(); else finish();
    }, btn ? 320 : 0);
  }

  function finish() {
    $('[data-bar]').style.width = '100%';
    const correct = Q.reduce((n, item, k) => n + (answers[k] === item.a ? 1 : 0), 0);
    // a level counts when most of its questions and those below it are right
    const perLevel = { A1: 0, A2: 0, B1: 0, B2: 0 };
    Q.forEach((item, k) => { if (answers[k] === item.a) perLevel[item.l]++; });
    let level = 'A1';
    if (perLevel.A1 >= 2 && perLevel.A2 >= 2) level = 'A2';
    if (level === 'A2' && perLevel.B1 >= 2) level = 'B1';
    if (level === 'B1' && perLevel.B2 >= 2) level = 'B2';
    const L = LEVELS[level];
    $('[data-level]').textContent = level;
    $('[data-level-title]').textContent = L.title;
    $('[data-level-text]').textContent = L.text;
    $('[data-rec-title]').textContent = L.rec;
    $('[data-rec-text]').textContent = L.recText;
    $('[data-score]').textContent = `To‘g‘ri javoblar: ${correct} / ${Q.length}`;
    box.querySelectorAll('.level-scale span').forEach(s => s.classList.toggle('on', s.dataset.l <= level));
    show(result);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try { sessionStorage.setItem('itLevel', level); } catch (e) { /* storage blocked */ }
    document.querySelectorAll('form[data-form="lead"] select[name="level"]').forEach(sel => {
      const opt = [...sel.options].find(o => o.text.startsWith(level));
      if (opt) sel.value = opt.value || opt.text;
    });
  }

  $('[data-start]').addEventListener('click', () => { i = 0; answers = []; show(run); render(); });
  $('[data-skip]').addEventListener('click', () => choose(-1, null));
  $('[data-restart]').addEventListener('click', () => { i = 0; answers = []; show(run); render(); });
})();

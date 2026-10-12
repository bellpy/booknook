'use strict';

// -------- constants --------
const INK = '#4A4630';
const EDGE = '#D8CCAA';
const SHELF_EDGE = '#6B5A3C';
const SAGE = '#8FAA6E';
const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer',
  'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
const SHORT_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const AVATARS = ['#F2C9A0', '#BFD3A5', '#BFD8DE', '#EFC4C0', '#CFC3DD', '#F1DFA0'];
const FACT_COLORS = ['#F2E6B8', '#DCE8C8', '#D7E7E4', '#F4DDC8'];
const TYPE_COLORS = { Physical: '#C9A46F', Audiobook: '#7FB0B3' };
const RATING_COLORS = { 1: '#D98B7E', 2: '#E3AE6B', 3: '#E8D27A', 4: '#A9C27F', 5: '#6E9A5B' };
const TAB_DEFS = [['home', 'home'], ['library', 'library'], ['stats', 'stats'], ['shelf', 'bookshelf']];
const STAT_ICONS = ['book', 'pages', 'star', 'leaf'];

// -------- helpers --------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const pad2 = (n) => String(n).padStart(2, '0');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const state = {
  page: 'home',
  books: [],
  goals: {},
  sort: { key: 'date_read', desc: true },
  search: '',
  selectedId: null,
  year: String(new Date().getFullYear()), // defaults to the current year
};
let charts = [];

const currentYear = () => String(new Date().getFullYear());
/** Books in the selected year (or all of them). Used by home, stats and the bookshelf. */
const scoped = () => (state.year === 'all' ? state.books : state.books.filter((b) => b.date_read.startsWith(state.year)));

/** Year picker in the header: every year that has a book, plus the current year, newest first. */
function syncYearSelect() {
  const years = [...new Set([currentYear(), ...state.books.map((b) => b.date_read.slice(0, 4))])].sort().reverse();
  if (state.year !== 'all' && !years.includes(state.year)) state.year = currentYear();
  const sel = $('#year-select');
  sel.innerHTML = '<option value="all">all time</option>' + years.map((y) => `<option value="${y}">${y}</option>`).join('');
  sel.value = state.year;
}

let toastTimer = null;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 5000 : 2800);
}

function confirmBox(title, message, okLabel = 'delete') {
  return new Promise((resolve) => {
    const d = $('#confirm-dialog');
    $('#confirm-title').textContent = title;
    $('#confirm-msg').textContent = message;
    $('#confirm-form button[value="yes"]').textContent = okLabel;
    d.returnValue = 'no';
    d.addEventListener('close', () => resolve(d.returnValue === 'yes'), { once: true });
    d.showModal();
  });
}

// -------- header & tabs --------
function renderDate() {
  const now = new Date();
  $('#date-card').innerHTML =
    `<div class="d1">${now.getDate()} ${SHORT_MONTHS[now.getMonth()]} ${now.getFullYear()}</div>` +
    `<div class="d2">${SEASONS[now.getMonth()]}, ${pad2(now.getHours())}:${pad2(now.getMinutes())}</div>` +
    `<div class="badge">${glyph('tree', { size: 30 })}</div>`;
}

function buildChrome() {
  $('#logo').innerHTML = logoSvg();
  $('#tabs').innerHTML = TAB_DEFS.map(([k, label]) =>
    `<button class="tab" data-page="${k}">${glyph(k, { size: 24 })}<span>${label}</span></button>`).join('');
  $('#add-book').innerHTML = `${glyph('add', { size: 24 })}<span>add book</span>`;
  $$('[data-glyph]').forEach((el) => { el.innerHTML = glyph(el.dataset.glyph, { size: 22 }); });
  $('#tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (t) show(t.dataset.page);
  });
  renderDate();
  setInterval(renderDate, 30000);
}

async function show(page) {
  state.page = page;
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${page}`));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.page === page));
  await refresh();
}

// -------- refresh --------
async function refresh() {
  try {
    state.books = await api.allBooks({});
    state.goals = await api.getGoals();
  } catch (e) {
    toast(e.message, true);
    return;
  }
  syncYearSelect();
  const { cards, facts } = summarize(scoped());
  const who = state.year === 'all' ? "you've" : `in ${state.year} you've`;
  $('#subtitle').textContent = state.books.length
    ? `${who} read ${cards[0][0]} books and turned ${cards[1][0]} pages`
    : 'your nook is waiting for its first book';

  switch (state.page) {
    case 'home': renderHome(facts); break;
    case 'library': await renderLibrary(); break;
    case 'stats': renderStats(); break;
    case 'shelf': renderShelf(); break;
    default: break;
  }
}

// -------- home --------
function renderHome(facts) {
  renderGoals();
  renderRecent();
  $('#facts-body').innerHTML = facts.length
    ? facts.map((f, i) => `<div class="fact" style="background:${FACT_COLORS[i % 4]}">${esc(f)}</div>`).join('')
    : '<div class="empty">facts appear once you add a book</div>';
}

function renderGoals() {
  // goal targets are shared: progress is counted for the selected year (current year when viewing all time)
  const year = state.year === 'all' ? new Date().getFullYear() : +state.year;
  $('#goals-title').textContent = `${year} goals`;
  const rows = goalProgress(state.books, state.goals, year);
  if (!rows.length) {
    $('#goal-rows').innerHTML = '<div class="empty">no goals selected. Click "edit goals" to pick some.</div>';
    return;
  }
  $('#goal-rows').innerHTML = rows.map(([label, icon, value, goal]) => {
    const pct = goal ? Math.min(value / goal, 1) : 0;
    const done = pct >= 1;
    return `<div class="goal${done ? ' done' : ''}">
      <div class="row"><span class="ico">${glyph(icon, { size: 20, inner: 'var(--sage-lt)' })}</span>
        <span class="lbl">${label}${done ? '  ✓' : ''}</span>
        <span class="val">${value.toLocaleString('en-US')} / ${goal.toLocaleString('en-US')}</span></div>
      <div class="track"><div class="fill${pct > 0 ? '' : ' zero'}" style="width:${(pct * 100).toFixed(1)}%"></div></div>
    </div>`;
  }).join('');
}

function renderRecent() {
  const el = $('#recent-body');
  // as many 56px rows as fit, so the list runs all the way down the card (at least 4)
  const fit = Math.max(4, Math.floor(el.clientHeight / 56));
  const recent = [...scoped()].sort((a, b) =>
    a.date_read === b.date_read ? b.id - a.id : (a.date_read < b.date_read ? 1 : -1)).slice(0, fit);
    el.innerHTML = recent.length
    ? recent.map((b) => `<div class="recent-row">
        <span class="tag" style="background:${RATING_COLORS[b.rating]}"></span>
        <div class="txt">
          <div class="l1"><span class="t">${esc(b.title)}</span><span class="stars">${stars(b.rating)}</span></div>
          <div class="l2">${esc(b.author)}, ${fmtDate(b.date_read)}</div>
        </div></div>`).join('')
    : '<div class="empty">nothing here yet</div>';
}

// -------- library --------
const LIB_COLS = [['title', 'title', ''], ['author', 'author', ''], ['date_read', 'date read', 'c'],
  ['pages', 'pages', 'c'], ['rating', 'rating', 'c'], ['type', 'type', 'c']];

async function renderLibrary() {
  $('#lib-head').innerHTML = LIB_COLS.map(([key, label, cls]) => {
    const arrow = state.sort.key === key ? (state.sort.desc ? ' ▾' : ' ▴') : '';
    return `<th data-key="${key}" class="${cls}">${label}${arrow}</th>`;
  }).join('');
  let rows;
  try {
    rows = await api.allBooks({ search: state.search, order: state.sort.key, desc: state.sort.desc });
  } catch (e) { toast(e.message, true); return; }
  if (!rows.some((b) => b.id === state.selectedId)) state.selectedId = null;
  $('#lib-rows').innerHTML = rows.map((b) => `<tr data-id="${b.id}"${b.id === state.selectedId ? ' class="sel"' : ''}>
    <td title="${esc(b.title)}">${esc(b.title)}</td><td title="${esc(b.author)}">${esc(b.author)}</td>
    <td class="c">${fmtDate(b.date_read)}</td><td class="c">${b.pages}</td>
    <td class="c">${stars(b.rating)}</td><td class="c">${b.type.toLowerCase()}</td></tr>`).join('');
}

function selectedBook() {
  const b = state.books.find((x) => x.id === state.selectedId);
  if (!b) toast('Click a book in the list first.');
  return b;
}

async function importCsv() {
  try {
    const n = await api.importCsv();
    if (n === null) return;
    toast(`Imported ${n} books.`);
    await refresh();
  } catch (e) { toast(`Import failed: ${e.message}`, true); }
}

async function exportCsv() {
  try {
    const r = await api.exportCsv();
    if (r) toast(`Saved ${r.count} books to ${r.name}.`);
  } catch (e) { toast(`Export failed: ${e.message}`, true); }
}

async function deleteSelected() {
  const b = selectedBook();
  if (b && await confirmBox('delete book', `Delete '${b.title}'?`)) {
    try { await api.deleteBook(b.id); } catch (e) { toast(e.message, true); }
    await refresh();
  }
}

async function clearLibrary() {
  const n = state.books.length;
  if (!n) { toast('Your library is already empty.'); return; }
  const ok = await confirmBox('clear library',
    `Delete all ${n} book${n !== 1 ? 's' : ''}? This can't be undone, so export a csv first if you want a backup.`, 'clear all');
  if (!ok) return;
  try {
    await api.clearBooks();
    toast('Library cleared.');
  } catch (e) { toast(e.message, true); }
  await refresh();
}

// -------- stats --------
function renderStats() {
  const books = scoped();
  const { cards } = summarize(books);

  $('#tiles').innerHTML = cards.map(([big, small], i) => `<div class="tile">
    <div class="ico" style="background:${AVATARS[i]}">${glyph(STAT_ICONS[i], { size: 34, inner: AVATARS[i] })}</div>
    <div><div class="big">${esc(big)}</div><div class="small">${esc(small)}</div></div></div>`).join('');

  charts.forEach((c) => c.destroy());
  charts = [];
  const empty = !books.length;
  $('#charts-empty').textContent = state.books.length
    ? `no books finished in ${state.year}` : 'add your first book to see the stats';
  $('#charts-empty').hidden = !empty;
  $('#charts-grid').hidden = empty;
  if (empty) return;
  if (typeof Chart === 'undefined') {
    $('#charts-empty').textContent = 'Chart.js is missing. Run "npm install" in the project folder.';
    $('#charts-empty').hidden = false;
    $('#charts-grid').hidden = true;
    return;
  }

  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = INK;
  const title = (text) => ({ display: true, text, color: INK, font: { size: 15, weight: 'bold' }, padding: { bottom: 8 } });
  const base = { responsive: true, maintainAspectRatio: false, animation: { duration: 250 } };
  const grid = { color: '#E5DCBF' };

  // pages per month, stacked by type
  // a single year shows all twelve months: "all time" runs from the first to the last book
  const months = state.year === 'all'
    ? monthRange(books[0].date_read, books[books.length - 1].date_read)
    : Array.from({ length: 12 }, (_, i) => [+state.year, i + 1]);
  const multiYear = months[0][0] !== months[months.length - 1][0];
  const labels = months.map(([y, m]) => SHORT_MONTHS[m - 1] + (multiYear ? ` '${String(y).slice(2)}` : ''));
  charts.push(new Chart($('#ch-months'), {
    type: 'bar',
    data: {
      labels,
      datasets: TYPES.map((t) => ({
        label: t.toLowerCase(),
        backgroundColor: TYPE_COLORS[t], borderColor: SHELF_EDGE, borderWidth: 1.5, stack: 'p',
        data: months.map(([y, m]) => books
          .filter((b) => b.type === t && +b.date_read.slice(0, 4) === y && +b.date_read.slice(5, 7) === m)
          .reduce((s, b) => s + b.pages, 0)),
      })),
    },
    options: { ...base,
      plugins: { title: title('pages per month'), legend: { labels: { boxWidth: 12 } } },
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid } } },
  }));

  // physical vs audiobook donut
  const typeCounts = TYPES.map((t) => [t, books.filter((b) => b.type === t).length]).filter(([, c]) => c > 0);
  charts.push(new Chart($('#ch-types'), {
    type: 'doughnut',
    data: {
      labels: typeCounts.map(([t, c]) => `${t.toLowerCase()} (${c})`),
      datasets: [{ data: typeCounts.map(([, c]) => c), backgroundColor: typeCounts.map(([t]) => TYPE_COLORS[t]),
        borderColor: '#F8F2E1', borderWidth: 3 }],
    },
    options: { ...base, cutout: '58%',
      plugins: { title: title('physical vs. audiobook'), legend: { position: 'bottom', labels: { boxWidth: 12 } } } },
  }));

  // rating histogram
  charts.push(new Chart($('#ch-ratings'), {
    type: 'bar',
    data: {
      labels: [1, 2, 3, 4, 5].map((r) => `${r}★`),
      datasets: [{ data: [1, 2, 3, 4, 5].map((r) => books.filter((b) => b.rating === r).length),
        backgroundColor: [1, 2, 3, 4, 5].map((r) => RATING_COLORS[r]), borderColor: SHELF_EDGE, borderWidth: 1.5 }],
    },
    options: { ...base,
      plugins: { title: title('how you rate books'), legend: { display: false } },
      scales: { x: { grid: { display: false } }, y: { grid, ticks: { precision: 0 }, beginAtZero: true } } },
  }));

  // most-read authors
  const top = topAuthors(books, 6);
  charts.push(new Chart($('#ch-authors'), {
    type: 'bar',
    data: { labels: top.map(([a]) => a),
      datasets: [{ data: top.map(([, c]) => c), backgroundColor: SAGE, borderColor: SHELF_EDGE, borderWidth: 1.5 }] },
    options: { ...base, indexAxis: 'y',
      plugins: { title: title('most-read authors'), legend: { display: false } },
      scales: { x: { grid, ticks: { precision: 0 }, beginAtZero: true }, y: { grid: { display: false } } } },
  }));
}

// -------- bookshelf --------
function renderShelf() {
  const wall = $('#shelf-wall');
  // newest first, oldest last (swap 1 and -1 will flip it)
  const books = [...scoped()].sort((a, b) =>
    (a.date_read === b.date_read ? b.id - a.id : (a.date_read < b.date_read ? 1 : -1)));
  const width = Math.max(wall.clientWidth, 400);
  // The bigger the window, the bigger the books (1.0 up to ~900px wide)
  const k = clamp(width / 900, 1, 2.4);
  const fontPx = Math.max(10, Math.round(10 * k));
  $('#shelf-info').style.fontSize = `${Math.max(14, Math.round(14 * k))}px`;

  if (!books.length) {
    wall.innerHTML = `<div class="empty big">${state.books.length
      ? `no books finished in ${state.year}` : 'your shelf is empty. press “add book” to start'}</div>`;
    return;
  }
  const margin = Math.round(30 * k);
  const gap = Math.round(4 * k);
  const bw = 2; // spine border
  const dims = books.map((b) => ({ b, w: Math.round((16 + b.pages / 18) * k), h: Math.round((96 + b.pages / 6) * k) }));

  const rows = [];
  let cur = [];
  let x = margin;
  for (const d of dims) {
    if (x + d.w > width - margin && cur.length) { rows.push(cur); cur = []; x = margin; }
    cur.push(d);
    x += d.w + gap;
  }
  rows.push(cur);

  const lift = Math.round(10 * k);
  wall.innerHTML = rows.map((row) => {
    // each shelf is only as tall as its tallest book (plus a little headroom)
    const rowH = Math.max(Math.round(200 * k), Math.max(...row.map((d) => d.h)) + Math.round(16 * k));
    return `<div class="shelf-row" style="height:${rowH}px;padding:0 ${margin}px ${lift}px;` +
      `gap:${gap}px;margin-bottom:${Math.round(18 * k)}px">` +
      row.map(({ b, w, h }) => {
        const cap = Math.round(24 * k);
        return `<div class="spine" data-id="${b.id}" style="width:${w}px;height:${h}px;background:${RATING_COLORS[b.rating]};` +
          `border-radius:${Math.round(9 * k)}px;border-width:${k < 1.6 ? bw : 3}px;font-size:${fontPx}px">` +
          `<div class="cap" style="height:${cap}px">${b.type === 'Audiobook' ? '♫' : ''}</div>` +
          `<div class="ttl"><span class="vt">${esc(b.title)}</span></div>` +
          `<div class="cap" style="height:${cap}px;color:var(--card)">${b.rating === 5 ? '♥' : ''}</div></div>`;
      }).join('') +
      `<div class="shelf-board" style="left:${margin - Math.round(14 * k)}px;right:${margin - Math.round(14 * k)}px;` +
      `top:${rowH - lift}px;height:${Math.round(18 * k)}px;border-radius:${Math.round(9 * k)}px"></div></div>`;
  }).join('');
}

function onShelfHover(e) {
  const spine = e.target.closest('.spine');
  if (!spine) return;
  const b = state.books.find((x) => x.id === +spine.dataset.id);
  if (!b) return;
  const info = $('#shelf-info');
  info.style.color = INK;
  info.textContent = `${b.title} by ${b.author}   ${b.pages} pages   ${stars(b.rating)}   ` +
    `${b.type.toLowerCase()}   ${fmtDate(b.date_read)}`;
}

// -------- dialogs --------
let editingId = null;

function openBookDialog(book) {
  editingId = book ? book.id : null;
  const f = $('#book-form');
  const today = new Date();
  $('#book-dialog-title').textContent = book ? 'edit this book' : 'add a book';
  f.author.value = book ? book.author : '';
  f.title.value = book ? book.title : '';
  f.date.value = book ? fmtDate(book.date_read) : `${pad2(today.getDate())}/${pad2(today.getMonth() + 1)}/${today.getFullYear()}`;
  f.pages.value = book ? book.pages : '';
  f.rating.value = book ? String(book.rating) : '4';
  f.type.value = book ? book.type : 'Physical';
  $('#book-error').hidden = true;
  $('#book-dialog').showModal();
  f.author.focus();
}

async function submitBook(e) {
  e.preventDefault();
  const f = e.target;
  const values = { author: f.author.value, title: f.title.value, date: f.date.value,
    pages: f.pages.value, rating: f.rating.value, type: f.type.value };
  try {
    if (editingId === null) await api.addBook(values);
    else await api.updateBook(editingId, values);
  } catch (err) {
    const box = $('#book-error');
    box.textContent = err.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
    box.hidden = false;
    return;
  }
  $('#book-dialog').close();
  await refresh();
}

const GOAL_KEYS = ['books', 'pages', 'audio', 'five'];

function syncGoalInputs() {
  const f = $('#goals-form');
  for (const k of GOAL_KEYS) f[k].disabled = !f[`on_${k}`].checked;
}

function openGoalsDialog() {
  const f = $('#goals-form');
  for (const k of GOAL_KEYS) {
    f[k].value = state.goals[k];
    f[`on_${k}`].checked = state.goals.enabled[k] !== false;
  }
  syncGoalInputs();
  $('#goals-error').hidden = true;
  $('#goals-dialog').showModal();
  f.books.focus();
}

async function submitGoals(e) {
  e.preventDefault();
  const f = e.target;
  const out = { enabled: {} };
  for (const k of GOAL_KEYS) {
    out.enabled[k] = f[`on_${k}`].checked;
    out[k] = Number(f[k].value.trim());
    if (!Number.isInteger(out[k]) || out[k] <= 0) {
      if (out.enabled[k]) {
        const box = $('#goals-error');
        box.textContent = 'Goals must be whole numbers above zero.';
        box.hidden = false;
        return;
      }
      out[k] = state.goals[k];
    }
  }
  try { await api.setGoals(out); } catch (err) { toast(err.message, true); return; }
  $('#goals-dialog').close();
  await refresh();
}

// -------- wiring --------
function wire() {
  $('#add-book').addEventListener('click', () => openBookDialog(null));
  $('#edit-goals').addEventListener('click', openGoalsDialog);
  $('#book-form').addEventListener('submit', submitBook);
  $('#goals-form').addEventListener('submit', submitGoals);
  $('#goals-form').addEventListener('change', syncGoalInputs);
  $$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

  let searchTimer = null;
  $('#search').addEventListener('input', (e) => {
    state.search = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderLibrary, 120);
  });
  $('#lib-head').addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th) return;
    const key = th.dataset.key;
    state.sort = state.sort.key === key ? { key, desc: !state.sort.desc } : { key, desc: false };
    renderLibrary();
  });
  $('#lib-rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    state.selectedId = +tr.dataset.id;
    $$('#lib-rows tr').forEach((r) => r.classList.toggle('sel', r === tr));
  });
  $('#lib-rows').addEventListener('dblclick', (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    state.selectedId = +tr.dataset.id;
    const b = selectedBook();
    if (b) openBookDialog(b);
  });
  $('#btn-edit').addEventListener('click', () => { const b = selectedBook(); if (b) openBookDialog(b); });
  $('#btn-delete').addEventListener('click', deleteSelected);
  $('#btn-import').addEventListener('click', importCsv);
  $('#btn-clear').addEventListener('click', clearLibrary);
  $('#btn-export').addEventListener('click', exportCsv);

  $('#year-select').addEventListener('change', (e) => { state.year = e.target.value; refresh(); });

  $('#shelf-wall').addEventListener('mouseover', onShelfHover);

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); openBookDialog(null); }
    if (e.key === 'Delete' && state.page === 'library' && document.activeElement.tagName !== 'INPUT') deleteSelected();
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.page === 'home') renderRecent();
      if (state.page === 'shelf') renderShelf();
    }, 120);
  });
}

buildChrome();
wire();
show('home');

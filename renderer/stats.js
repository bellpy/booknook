'use strict';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const TYPES = ['Physical', 'Audiobook'];
const MM_PER_PAGE = 0.06; // rough thickness of a page
const STACK_COMPARISONS = [
  [0.10, 'a coffee mug'], [0.30, 'a wine bottle'], [0.60, 'a guitar'], [1.00, 'a toddler'],
  [1.80, 'an adult'], [2.00, 'a door'], [5.00, 'a giraffe'],
  [20.0, 'a blue whale standing on its tail'], [330.0, 'the Eiffel Tower'],
];

const fmtNum = (n) => Math.round(n).toLocaleString('en-US');
const toDay = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const monthLabel = (iso) => `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
const fmtDate = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function splitAuthors(field) {
  return field.split(',').map((a) => a.trim()).filter(Boolean);
}

/** Counts in first-seen order, highest first **/
function countBy(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function topAuthors(books, n) {
  const m = new Map();
  for (const b of books) for (const a of splitAuthors(b.author)) m.set(a, (m.get(a) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** Returns { cards: [[big, caption]...], facts: [string...] } */
function summarize(list) {
  if (!list.length) {
    return { cards: [['0', 'books'], ['0', 'pages'], ['-', 'avg rating'], ['-', 'pages / day']], facts: [] };
  }
  const books = [...list].sort((a, b) => (a.date_read < b.date_read ? -1 : a.date_read > b.date_read ? 1 : 0));
  const n = books.length;
  const pages = books.reduce((s, b) => s + b.pages, 0);
  const avg = books.reduce((s, b) => s + b.rating, 0) / n;
  const span = Math.max(toDay(books[n - 1].date_read) - toDay(books[0].date_read) + 1, 1);
  const perDay = pages / span;

  const cards = [
    [`${n}`, 'books read'],
    [fmtNum(pages), 'pages turned'],
    [`${avg.toFixed(2)} ★`, 'average rating'],
    [`${Math.round(perDay)}`, 'pages per day'],
  ];
  const facts = [];

  const phys = books.filter((b) => b.type === 'Physical').reduce((s, b) => s + b.pages, 0);
  facts.push(`📖 You physically turned ${fmtNum(phys)} pages and 'listened' to ${fmtNum(pages - phys)} more.`);

  const heightM = (pages * MM_PER_PAGE) / 1000;
  const label = heightM < 1 ? `${Math.round(heightM * 100)} cm` : `${heightM.toFixed(1)} m`;
  const comp = STACK_COMPARISONS.filter((c) => c[0] <= heightM).pop();
  const extra = comp ? ` — about ${(heightM / comp[0]).toFixed(1)}× the height of ${comp[1]}` : '';
  facts.push(`📚 Stacked up, your pages would be ${label} tall${extra}.`);

  facts.push(`⏱️ Roughly ${fmtNum(pages / 50)} hours of reading at ~50 pages/hour.`);

  const longest = books.reduce((a, b) => (b.pages > a.pages ? b : a));
  const shortest = books.reduce((a, b) => (b.pages < a.pages ? b : a));
  facts.push(`🏋️ Longest: ${longest.title} (${longest.pages} pages)`);
  facts.push(`🐇 Shortest: ${shortest.title} (${shortest.pages} pages)`);
  facts.push(`📏 Average book: ${Math.round(pages / n)} pages.`);

  // Authors
  const counts = new Map();
  const ratings = new Map();
  for (const b of books) {
    for (const a of splitAuthors(b.author)) {
      counts.set(a, (counts.get(a) || 0) + 1);
      if (!ratings.has(a)) ratings.set(a, []);
      ratings.get(a).push(b.rating);
    }
  }
  const [topAuthor, topN] = [...counts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
  facts.push(`❤️ Most-read author: ${topAuthor} (${topN} books).`);
  let best = null;
  for (const [a, r] of ratings) {
    if (r.length < 2) continue;
    const score = r.reduce((s, x) => s + x, 0) / r.length;
    if (!best || score > best.score || (score === best.score && a > best.a)) best = { score, a, k: r.length };
  }
  if (best) facts.push(`🏆 Best-rated author (2+ books): ${best.a}, avg ${best.score.toFixed(1)} ★ over ${best.k} books.`);

  // Format
  for (const t of TYPES) {
    const sub = books.filter((b) => b.type === t);
    if (sub.length) {
      const a = sub.reduce((s, b) => s + b.rating, 0) / sub.length;
      facts.push(`🎧 ${t}: ${sub.length} books, avg ${a.toFixed(2)} ★`);
    }
  }

  // Ratings
  const fives = books.filter((b) => b.rating === 5).length;
  facts.push(`⭐ ${fives} five-star book${fives !== 1 ? 's' : ''} (${Math.round((fives / n) * 100)}%).`);

  // Months & gaps
  const [busyMonth, busyN] = countBy(books, (b) => monthLabel(b.date_read))[0];
  facts.push(`🔥 Busiest month: ${busyMonth} (${busyN} books).`);
  const pagesByMonth = new Map();
  for (const b of books) {
    const k = monthLabel(b.date_read);
    pagesByMonth.set(k, (pagesByMonth.get(k) || 0) + b.pages);
  }
  const [m2, p2] = [...pagesByMonth.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
  facts.push(`📈 Most pages in a month: ${m2} (${fmtNum(p2)}).`);
  if (n > 1) {
    let g = null;
    for (let i = 0; i < n - 1; i++) {
      const days = toDay(books[i + 1].date_read) - toDay(books[i].date_read);
      if (!g || days > g.days) g = { days, b1: books[i], b2: books[i + 1] };
    }
    facts.push(`🏜️ Longest drought: ${g.days} days between '${g.b1.title}' and '${g.b2.title}'.`);
    facts.push(`🗓️ On average, you finish a book every ${(span / n).toFixed(1)} days.`);
  }
  return { cards, facts };
}

/** Rows for the home page goals card. */
function goalProgress(books, goals, year) {
  const mine = books.filter((b) => b.date_read.startsWith(String(year)));
  return [
    ['books read', 'book', mine.length, goals.books],
    ['pages turned', 'pages', mine.reduce((s, b) => s + b.pages, 0), goals.pages],
    ['audiobooks', 'headphones', mine.filter((b) => b.type === 'Audiobook').length, goals.audio],
    ['five-star reads', 'star', mine.filter((b) => b.rating === 5).length, goals.five],
  ];
}

/** [[year, month(1-12)], ...] from the first to the last month, inclusive. */
function monthRange(firstIso, lastIso) {
  let y = +firstIso.slice(0, 4);
  let m = +firstIso.slice(5, 7);
  const ly = +lastIso.slice(0, 4);
  const lm = +lastIso.slice(5, 7);
  const out = [];
  while (y < ly || (y === ly && m <= lm)) {
    out.push([y, m]);
    m++;
    if (m === 13) { y++; m = 1; }
  }
  return out;
}

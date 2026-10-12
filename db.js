'use strict';
const Database = require('better-sqlite3');

const TYPES = ['Physical', 'Audiobook'];
const GOAL_DEFAULTS = { books: 30, pages: 10000, audio: 6, five: 5 };
const ORDERS = ['author', 'title', 'date_read', 'pages', 'rating', 'type'];

// -------- dates --------
function isoFromParts(y, m, d, original) {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) {
    throw new Error(`Can't read date '${original}' (use DD/MM/YYYY)`);
  }
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Accepts DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY and YYYY-MM-DD. Returns ISO yyyy-mm-dd. */
function parseDate(text) {
  const s = String(text ?? '').trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return isoFromParts(+m[3], +m[2], +m[1], s);
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return isoFromParts(+m[1], +m[2], +m[3], s);
  throw new Error(`Can't read date '${s}' (use DD/MM/YYYY)`);
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// -------- validation --------
/** Turns raw form values into a clean book row, or throws an error */
function validateBook(v) {
  const author = String(v.author ?? '').trim();
  const title = String(v.title ?? '').trim();
  if (!author || !title) throw new Error('Author and title are required.');
  const date_read = parseDate(v.date);
  const pages = Number(String(v.pages ?? '').trim());
  if (!Number.isInteger(pages) || pages <= 0) throw new Error('Pages must be a positive whole number.');
  const rating = Number(v.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Rating must be between 1 and 5.');
  if (!TYPES.includes(v.type)) throw new Error('Type must be Physical or Audiobook.');
  return { author, title, date_read, pages, rating, type: v.type };
}

// -------- csv --------
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function csvCell(v) {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// -------- database --------
class BookDB {
  constructor(file) {
    this.db = new Database(file);
    this.db.exec(`CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author TEXT NOT NULL,
      title TEXT NOT NULL,
      date_read TEXT NOT NULL,
      pages INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      type TEXT NOT NULL
    )`);
    this.db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
  }

  close() { this.db.close(); }

  /** { books, pages, audio, five, enabled: { books: true, ... } } */
  goals() {
    const out = { ...GOAL_DEFAULTS, enabled: {} };
    for (const k of Object.keys(GOAL_DEFAULTS)) out.enabled[k] = true;
    for (const r of this.db.prepare('SELECT key, value FROM settings').all()) {
      if (r.key.startsWith('goal_')) {
        const k = r.key.slice(5);
        const n = parseInt(r.value, 10);
        if (k in GOAL_DEFAULTS && Number.isFinite(n)) out[k] = n;
      } else if (r.key.startsWith('enabled_goal_')) {
        const k = r.key.slice('enabled_goal_'.length);
        if (k in GOAL_DEFAULTS) out.enabled[k] = r.value !== '0';
      }
    }
    return out;
  }

  setGoals(goals) {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const run = this.db.transaction(() => {
      for (const k of Object.keys(GOAL_DEFAULTS)) {
        if (goals[k] !== undefined) {
          const n = Number(goals[k]);
          if (!Number.isInteger(n) || n <= 0) throw new Error('Goals must be whole numbers above zero.');
          stmt.run(`goal_${k}`, String(n));
        }
        if (goals.enabled && k in goals.enabled) stmt.run(`enabled_goal_${k}`, goals.enabled[k] ? '1' : '0');
      }
    });
    run();
  }

  count() { return this.db.prepare('SELECT COUNT(*) AS n FROM books').get().n; }

  all({ search = '', order = 'date_read', desc = false } = {}) {
    if (!ORDERS.includes(order)) order = 'date_read';
    const like = `%${search}%`;
    return this.db
      .prepare(`SELECT * FROM books WHERE author LIKE ? OR title LIKE ? ORDER BY ${order} ${desc ? 'DESC' : 'ASC'}, id`)
      .all(like, like);
  }

  add(raw) {
    const b = validateBook(raw);
    this.db
      .prepare('INSERT INTO books (author,title,date_read,pages,rating,type) VALUES (?,?,?,?,?,?)')
      .run(b.author, b.title, b.date_read, b.pages, b.rating, b.type);
  }

  update(id, raw) {
    const b = validateBook(raw);
    this.db
      .prepare('UPDATE books SET author=?,title=?,date_read=?,pages=?,rating=?,type=? WHERE id=?')
      .run(b.author, b.title, b.date_read, b.pages, b.rating, b.type, id);
  }

  delete(id) { this.db.prepare('DELETE FROM books WHERE id=?').run(id); }

  /** Removes every book. Returns how many were removed. */
  clear() { return this.db.prepare('DELETE FROM books').run().changes; }

  /** CSV with columns Author Name, Title, Date, Pages, Rating, Type. Returns the CSV text. */
  exportCsv() {
    const books = this.all({ order: 'date_read' });
    const lines = [['Author Name', 'Title', 'Date', 'Pages', 'Rating', 'Type']];
    for (const b of books) lines.push([b.author, b.title, fmtDate(b.date_read), b.pages, b.rating, b.type]);
    return { text: '\ufeff' + lines.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n', count: books.length };
  }

  /** Skips title rows above the header and blank rows. All-or-nothing: a bad row cancels the import. */
  importCsv(text) {
    const rows = parseCsv(text);
    const headerIdx = rows.findIndex((r) => r.some((c) => c.trim().toLowerCase() === 'author name'));
    if (headerIdx === -1) throw new Error("Couldn't find a header row with 'Author Name'.");
    const header = rows[headerIdx].map((c) => c.trim().toLowerCase());
    const col = {};
    for (const name of ['author name', 'title', 'date', 'pages', 'rating', 'type']) {
      col[name] = header.indexOf(name);
      if (col[name] === -1) throw new Error(`Missing column '${name}'.`);
    }
    const maxCol = Math.max(...Object.values(col));
    const insert = this.db.prepare(
      'INSERT INTO books (author,title,date_read,pages,rating,type) VALUES (?,?,?,?,?,?)'
    );
    const run = this.db.transaction(() => {
      let added = 0;
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (r.length <= maxCol || !r[col.title].trim()) continue;
        const t = r[col.type].trim();
        const cap = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
        try {
          const b = validateBook({
            author: r[col['author name']], title: r[col.title], date: r[col.date],
            pages: r[col.pages], rating: r[col.rating], type: TYPES.includes(cap) ? cap : 'Physical',
          });
          insert.run(b.author, b.title, b.date_read, b.pages, b.rating, b.type);
          added++;
        } catch (e) {
          throw new Error(`Row ${i + 1}: ${e.message}`);
        }
      }
      return added;
    });
    return run();
  }
}

module.exports = { BookDB, validateBook, parseDate, fmtDate, TYPES };

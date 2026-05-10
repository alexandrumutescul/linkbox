const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'linkbox.db');

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

function normalizeOptional(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeUrl(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function timestamp() {
  return new Date().toISOString();
}

function findBookmark(id) {
  return db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(id) || null;
}

function createBookmark(input) {
  const now = timestamp();
  const bookmark = {
    url: normalizeUrl(input.url),
    title: normalizeOptional(input.title),
    tags: normalizeOptional(input.tags),
    notes: normalizeOptional(input.notes),
    created_at: now,
    updated_at: now,
  };

  const result = db.prepare(`
    INSERT INTO bookmarks (url, title, tags, notes, created_at, updated_at)
    VALUES (@url, @title, @tags, @notes, @created_at, @updated_at)
  `).run(bookmark);

  return findBookmark(result.lastInsertRowid);
}

function listBookmarks(filters = {}) {
  const where = [];
  const params = {};

  if (filters.q) {
    params.q = `%${String(filters.q).trim()}%`;
    where.push('(url LIKE @q OR title LIKE @q OR tags LIKE @q OR notes LIKE @q)');
  }

  if (filters.tag) {
    params.tag = `%${String(filters.tag).trim()}%`;
    where.push('tags LIKE @tag');
  }

  const sql = `
    SELECT * FROM bookmarks
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC, id DESC
  `;

  return db.prepare(sql).all(params);
}

function updateBookmark(id, input) {
  const existing = findBookmark(id);
  if (!existing) return null;

  const updates = [];
  const params = { id, updated_at: timestamp() };

  if (Object.prototype.hasOwnProperty.call(input, 'url')) {
    updates.push('url = @url');
    params.url = normalizeUrl(input.url);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'title')) {
    updates.push('title = @title');
    params.title = normalizeOptional(input.title);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'tags')) {
    updates.push('tags = @tags');
    params.tags = normalizeOptional(input.tags);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'notes')) {
    updates.push('notes = @notes');
    params.notes = normalizeOptional(input.notes);
  }

  if (updates.length === 0) return existing;

  updates.push('updated_at = @updated_at');

  db.prepare(`
    UPDATE bookmarks
    SET ${updates.join(', ')}
    WHERE id = @id
  `).run(params);

  return findBookmark(id);
}

function deleteBookmark(id) {
  const result = db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
  return result.changes > 0;
}

module.exports = {
  db,
  createBookmark,
  listBookmarks,
  findBookmark,
  updateBookmark,
  deleteBookmark,
};

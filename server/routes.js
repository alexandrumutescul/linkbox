const express = require('express');
const {
  createBookmark,
  listBookmarks,
  updateBookmark,
  deleteBookmark,
} = require('./db');

const router = express.Router();
const allowedFields = new Set(['url', 'title', 'tags', 'notes']);

function errorResponse(res, status, message) {
  return res.status(status).json({ error: message });
}

function hasUrl(body) {
  return body && typeof body.url === 'string' && body.url.trim() !== '';
}

router.post('/bookmarks', (req, res) => {
  if (!hasUrl(req.body)) {
    return errorResponse(res, 400, 'url is required');
  }

  const bookmark = createBookmark(req.body);
  return res.status(201).json(bookmark);
});

router.get('/bookmarks', (req, res) => {
  const bookmarks = listBookmarks({
    q: req.query.q,
    tag: req.query.tag,
  });

  return res.json(bookmarks);
});

router.patch('/bookmarks/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return errorResponse(res, 404, 'bookmark not found');
  }

  const updates = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      updates[field] = req.body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'url') && String(updates.url || '').trim() === '') {
    return errorResponse(res, 400, 'url cannot be empty');
  }

  const bookmark = updateBookmark(id, updates);
  if (!bookmark) {
    return errorResponse(res, 404, 'bookmark not found');
  }

  return res.json(bookmark);
});

router.delete('/bookmarks/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return errorResponse(res, 404, 'bookmark not found');
  }

  if (!deleteBookmark(id)) {
    return errorResponse(res, 404, 'bookmark not found');
  }

  return res.json({ success: true });
});

module.exports = router;

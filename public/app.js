const API_BASE = '/api/bookmarks';
const DEBOUNCE_MS = 350;

const elements = {
  form: document.querySelector('#add-bookmark-form'),
  formStatus: document.querySelector('#form-status'),
  list: document.querySelector('#bookmark-list'),
  listStatus: document.querySelector('#list-status'),
  searchInput: document.querySelector('#search-input'),
  tagFilterInput: document.querySelector('#tag-filter-input'),
};

const state = {
  bookmarks: [],
  searchTerm: '',
  tagFilter: '',
  loading: false,
  error: '',
  editingId: null,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeBookmark(bookmark) {
  return {
    id: bookmark.id,
    url: bookmark.url ?? '',
    title: bookmark.title ?? '',
    tags: bookmark.tags ?? '',
    notes: bookmark.notes ?? '',
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function getErrorMessage(payload, fallback) {
  if (payload && typeof payload.error === 'string') {
    return payload.error;
  }
  if (payload && typeof payload.message === 'string') {
    return payload.message;
  }
  return fallback;
}

function setFormStatus(message, isError = false) {
  if (!elements.formStatus) return;
  elements.formStatus.textContent = message;
  elements.formStatus.classList.toggle('error-text', isError);
  elements.formStatus.classList.toggle('success-text', Boolean(message) && !isError);
}

function setListStatus(message, isError = false) {
  if (!elements.listStatus) return;
  elements.listStatus.textContent = message;
  elements.listStatus.classList.toggle('error-text', isError);
}

function buildQueryString() {
  const params = new URLSearchParams();
  if (state.searchTerm) {
    params.set('q', state.searchTerm);
  }
  if (state.tagFilter) {
    params.set('tag', state.tagFilter);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, `Request failed with status ${response.status}`));
  }
  return payload;
}

async function loadBookmarks() {
  state.loading = true;
  state.error = '';
  renderBookmarks();

  try {
    const payload = await requestJson(`${API_BASE}${buildQueryString()}`, { method: 'GET' });
    state.bookmarks = Array.isArray(payload) ? payload.map(normalizeBookmark) : [];
    state.editingId = null;
  } catch (error) {
    state.error = error.message || 'Could not load bookmarks.';
  } finally {
    state.loading = false;
    renderBookmarks();
  }
}

function renderTags(tags) {
  const tagText = String(tags ?? '').trim();
  if (!tagText) {
    return '<span class="muted">No tags</span>';
  }

  return tagText
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`)
    .join('');
}

function renderBookmarkView(bookmark) {
  const title = bookmark.title || bookmark.url;
  return `
    <article class="bookmark-row" data-bookmark-id="${escapeHtml(bookmark.id)}">
      <div class="bookmark-main">
        <h3><a href="${escapeHtml(bookmark.url)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a></h3>
        <p class="bookmark-url">${escapeHtml(bookmark.url)}</p>
        <div class="bookmark-tags">${renderTags(bookmark.tags)}</div>
        <p class="bookmark-notes">${bookmark.notes ? escapeHtml(bookmark.notes) : '<span class="muted">No notes</span>'}</p>
      </div>
      <div class="row-actions">
        <button type="button" class="button button-secondary" data-action="edit" data-bookmark-id="${escapeHtml(bookmark.id)}">Edit</button>
        <button type="button" class="button button-danger" data-action="delete" data-bookmark-id="${escapeHtml(bookmark.id)}">Delete</button>
      </div>
    </article>
  `;
}

function renderBookmarkEdit(bookmark) {
  return `
    <article class="bookmark-row editing" data-bookmark-id="${escapeHtml(bookmark.id)}">
      <div class="edit-grid">
        <label class="field" for="edit-url-${escapeHtml(bookmark.id)}">
          <span>URL</span>
          <input id="edit-url-${escapeHtml(bookmark.id)}" name="url" type="url" value="${escapeHtml(bookmark.url)}" required>
        </label>
        <label class="field" for="edit-title-${escapeHtml(bookmark.id)}">
          <span>Title</span>
          <input id="edit-title-${escapeHtml(bookmark.id)}" name="title" type="text" value="${escapeHtml(bookmark.title)}">
        </label>
        <label class="field" for="edit-tags-${escapeHtml(bookmark.id)}">
          <span>Tags</span>
          <input id="edit-tags-${escapeHtml(bookmark.id)}" name="tags" type="text" value="${escapeHtml(bookmark.tags)}">
        </label>
        <label class="field field-wide" for="edit-notes-${escapeHtml(bookmark.id)}">
          <span>Notes</span>
          <textarea id="edit-notes-${escapeHtml(bookmark.id)}" name="notes" rows="3">${escapeHtml(bookmark.notes)}</textarea>
        </label>
      </div>
      <p class="edit-status error-text" data-edit-status aria-live="polite"></p>
      <div class="row-actions">
        <button type="button" class="button button-primary" data-action="save" data-bookmark-id="${escapeHtml(bookmark.id)}">Save</button>
        <button type="button" class="button button-secondary" data-action="cancel" data-bookmark-id="${escapeHtml(bookmark.id)}">Cancel</button>
      </div>
    </article>
  `;
}

function renderBookmarks() {
  if (!elements.list) return;

  if (state.loading) {
    setListStatus('Loading bookmarks...');
  } else if (state.error) {
    setListStatus(state.error, true);
  } else {
    const count = state.bookmarks.length;
    setListStatus(count === 1 ? '1 bookmark found.' : `${count} bookmarks found.`);
  }

  if (state.loading && state.bookmarks.length === 0) {
    elements.list.innerHTML = '<p class="empty-state">Loading your saved links...</p>';
    return;
  }

  if (!state.loading && state.bookmarks.length === 0) {
    elements.list.innerHTML = '<p class="empty-state">No bookmarks match your current filters.</p>';
    return;
  }

  elements.list.innerHTML = state.bookmarks
    .map((bookmark) => (String(bookmark.id) === String(state.editingId) ? renderBookmarkEdit(bookmark) : renderBookmarkView(bookmark)))
    .join('');
}

function formDataToBookmark(form) {
  const formData = new FormData(form);
  return {
    url: String(formData.get('url') || '').trim(),
    title: String(formData.get('title') || '').trim(),
    tags: String(formData.get('tags') || '').trim(),
    notes: String(formData.get('notes') || '').trim(),
  };
}

async function handleAddSubmit(event) {
  event.preventDefault();
  if (!elements.form) return;

  const bookmark = formDataToBookmark(elements.form);
  setFormStatus('Saving...');

  try {
    const saved = await requestJson(API_BASE, {
      method: 'POST',
      body: JSON.stringify(bookmark),
    });
    elements.form.reset();
    setFormStatus('Bookmark added.');

    if (saved && saved.id) {
      state.bookmarks = [normalizeBookmark(saved), ...state.bookmarks.filter((item) => String(item.id) !== String(saved.id))];
      renderBookmarks();
    }
    await loadBookmarks();
  } catch (error) {
    setFormStatus(error.message || 'Could not add bookmark.', true);
  }
}

function getBookmarkById(id) {
  return state.bookmarks.find((bookmark) => String(bookmark.id) === String(id));
}

function getEditPayload(row) {
  const urlInput = row.querySelector('[name="url"]');
  return {
    url: String(urlInput?.value || '').trim(),
    title: row.querySelector('[name="title"]')?.value.trim() || '',
    tags: row.querySelector('[name="tags"]')?.value.trim() || '',
    notes: row.querySelector('[name="notes"]')?.value.trim() || '',
  };
}

function setEditStatus(row, message) {
  const status = row.querySelector('[data-edit-status]');
  if (!status) return;
  status.textContent = message;
}

async function handleSave(id, row) {
  const payload = getEditPayload(row);

  if (!payload.url) {
    setEditStatus(row, 'URL is required');
    return;
  }

  setEditStatus(row, '');
  setListStatus('Saving bookmark...');

  try {
    const saved = await requestJson(`${API_BASE}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    if (saved && saved.id) {
      state.bookmarks = state.bookmarks.map((bookmark) => (String(bookmark.id) === String(id) ? normalizeBookmark(saved) : bookmark));
    } else {
      await loadBookmarks();
    }
    state.editingId = null;
    renderBookmarks();
  } catch (error) {
    state.error = error.message || 'Could not save bookmark.';
    renderBookmarks();
  }
}

async function handleDelete(id) {
  const bookmark = getBookmarkById(id);
  const label = bookmark?.title || bookmark?.url || 'this bookmark';
  if (!window.confirm(`Delete ${label}?`)) {
    return;
  }

  setListStatus('Deleting bookmark...');

  try {
    await requestJson(`${API_BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    state.bookmarks = state.bookmarks.filter((bookmark) => String(bookmark.id) !== String(id));
    if (String(state.editingId) === String(id)) {
      state.editingId = null;
    }
    renderBookmarks();
  } catch (error) {
    state.error = error.message || 'Could not delete bookmark.';
    renderBookmarks();
  }
}

function handleListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || !elements.list?.contains(button)) {
    return;
  }

  const id = button.dataset.bookmarkId;
  const action = button.dataset.action;
  const row = button.closest('[data-bookmark-id]');

  if (action === 'edit') {
    state.editingId = id;
    state.error = '';
    renderBookmarks();
  } else if (action === 'cancel') {
    state.editingId = null;
    state.error = '';
    renderBookmarks();
  } else if (action === 'save' && row) {
    handleSave(id, row);
  } else if (action === 'delete') {
    handleDelete(id);
  }
}

function debounce(callback, delay) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), delay);
  };
}

const debouncedFilterLoad = debounce(() => {
  state.searchTerm = elements.searchInput?.value.trim() || '';
  state.tagFilter = elements.tagFilterInput?.value.trim() || '';
  loadBookmarks();
}, DEBOUNCE_MS);

function init() {
  elements.form?.addEventListener('submit', handleAddSubmit);
  elements.list?.addEventListener('click', handleListClick);
  elements.searchInput?.addEventListener('input', debouncedFilterLoad);
  elements.tagFilterInput?.addEventListener('input', debouncedFilterLoad);
  loadBookmarks();
}

init();

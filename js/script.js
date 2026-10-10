/* ============================================================
   Life Dashboard — script.js
   Vanilla JS only. All data persisted via localStorage.
   ============================================================ */

'use strict';

/* ── Utility helpers ─────────────────────────────────────── */

/** Show a brief toast message at the bottom of the screen. */
function showToast(message) {
  // Remove any existing toast first
  const old = document.getElementById('liveToast');
  if (old) old.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.id = 'liveToast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast--hide');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 2200);
}

/** Sanitise a string for display (escape HTML). */
function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str).replace(/[&<>"']/g, ch => map[ch]);
}

/** Validate a URL — must start with http:// or https:// */
function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/* ── localStorage helpers ────────────────────────────────── */
const LS_KEYS = {
  name:  'ld_userName',
  theme: 'ld_theme',
  todos: 'ld_todos',
  links: 'ld_links',
};

function lsGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

/* ══════════════════════════════════════════════════════════
   1. GREETING & CLOCK
   ══════════════════════════════════════════════════════════ */
(function initClock() {
  const timeEl     = document.getElementById('clockTime');
  const dateEl     = document.getElementById('clockDate');
  const greetEl    = document.getElementById('greetingText');
  const nameInput  = document.getElementById('nameInput');
  const nameSaveBtn = document.getElementById('nameSaveBtn');

  const DAY_NAMES   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];

  function getGreeting(hour) {
    if (hour < 5)  return 'Good night';
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Good night';
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function tick() {
    const now  = new Date();
    const h    = now.getHours();
    const m    = now.getMinutes();
    const s    = now.getSeconds();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h % 12 || 12;

    timeEl.textContent = `${pad(h12)}:${pad(m)}:${pad(s)} ${ampm}`;
    dateEl.textContent = `${DAY_NAMES[now.getDay()]}, ${MONTH_NAMES[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

    const name = lsGet(LS_KEYS.name, '');
    const greeting = getGreeting(h);
    greetEl.textContent = name ? `${greeting}, ${name}!` : `${greeting}!`;
  }

  function loadName() {
    const saved = lsGet(LS_KEYS.name, '');
    if (saved) nameInput.value = saved;
  }

  function saveName() {
    const name = nameInput.value.trim();
    lsSet(LS_KEYS.name, name);
    tick();
    showToast(name ? `Name saved as "${name}"` : 'Name cleared');
  }

  nameSaveBtn.addEventListener('click', saveName);
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveName(); });

  loadName();
  tick();
  setInterval(tick, 1000);
})();

/* ══════════════════════════════════════════════════════════
   2. FOCUS TIMER (Pomodoro — 25 min)
   ══════════════════════════════════════════════════════════ */
(function initTimer() {
  const display    = document.getElementById('timerDisplay');
  const startBtn   = document.getElementById('timerStart');
  const stopBtn    = document.getElementById('timerStop');
  const resetBtn   = document.getElementById('timerReset');

  const TOTAL_SECONDS = 25 * 60;
  let remaining = TOTAL_SECONDS;
  let intervalId = null;   // null = not running

  function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function render() {
    display.textContent = formatTime(remaining);
  }

  function isRunning() { return intervalId !== null; }

  function start() {
    if (isRunning()) return;           // prevent double-start
    if (remaining === 0) return;       // don't start at zero

    intervalId = setInterval(() => {
      remaining--;
      render();
      if (remaining === 0) {
        stop();
        showToast('⏱ Focus session complete! Take a break.');
      }
    }, 1000);

    startBtn.disabled = true;
    stopBtn.disabled  = false;
  }

  function stop() {
    if (!isRunning()) return;
    clearInterval(intervalId);
    intervalId = null;
    startBtn.disabled = false;
    stopBtn.disabled  = true;
  }

  function reset() {
    stop();
    remaining = TOTAL_SECONDS;
    render();
  }

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click',  stop);
  resetBtn.addEventListener('click', reset);

  // Initial state
  stopBtn.disabled = true;
  render();
})();

/* ══════════════════════════════════════════════════════════
   3. TO-DO LIST
   ══════════════════════════════════════════════════════════ */
(function initTodo() {
  const input    = document.getElementById('todoInput');
  const addBtn   = document.getElementById('todoAddBtn');
  const listEl   = document.getElementById('todoList');
  const emptyEl  = document.getElementById('todoEmpty');

  // Edit modal elements
  const modal        = document.getElementById('editModal');
  const overlay      = document.getElementById('modalOverlay');
  const editInput    = document.getElementById('editInput');
  const editSaveBtn  = document.getElementById('editSaveBtn');
  const editCancelBtn = document.getElementById('editCancelBtn');

  let tasks = lsGet(LS_KEYS.todos, []);   // [{ id, text, done }]
  let editingId = null;

  /* ── persistence ── */
  function saveTasks() { lsSet(LS_KEYS.todos, tasks); }

  /* ── generate unique id ── */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

  /* ── empty state ── */
  function updateEmpty() {
    emptyEl.style.display = tasks.length === 0 ? 'block' : 'none';
  }

  /* ── render ── */
  function render() {
    listEl.innerHTML = '';

    tasks.forEach(task => {
      const li = document.createElement('li');
      li.className = 'todo__item' + (task.done ? ' todo__item--done' : '');
      li.dataset.id = task.id;

      // Checkbox
      const cb = document.createElement('input');
      cb.type    = 'checkbox';
      cb.checked = task.done;
      cb.setAttribute('aria-label', `Mark "${task.text}" as ${task.done ? 'incomplete' : 'complete'}`);
      cb.addEventListener('change', () => toggleTask(task.id));

      // Text
      const span = document.createElement('span');
      span.className   = 'todo__item-text';
      span.textContent = task.text;

      // Action buttons wrapper
      const actions = document.createElement('div');
      actions.className = 'todo__item-actions';

      // Edit button
      const editBtn = document.createElement('button');
      editBtn.className   = 'btn btn--ghost btn--danger';
      editBtn.textContent = '✏️';
      editBtn.setAttribute('aria-label', `Edit task "${task.text}"`);
      editBtn.style.cssText = 'font-size:0.85rem;padding:0.2rem 0.4rem;border:none;background:transparent;';
      editBtn.addEventListener('click', () => openEditModal(task.id));

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.className   = 'btn btn--danger';
      delBtn.textContent = '🗑️';
      delBtn.setAttribute('aria-label', `Delete task "${task.text}"`);
      delBtn.addEventListener('click', () => deleteTask(task.id));

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      li.appendChild(cb);
      li.appendChild(span);
      li.appendChild(actions);
      listEl.appendChild(li);
    });

    updateEmpty();
  }

  /* ── add task ── */
  function addTask() {
    const text = input.value.trim();
    if (!text) { showToast('Please enter a task.'); input.focus(); return; }

    // Duplicate check (case-insensitive)
    const isDuplicate = tasks.some(t => t.text.toLowerCase() === text.toLowerCase());
    if (isDuplicate) { showToast('Task already exists.'); input.select(); return; }

    tasks.push({ id: uid(), text, done: false });
    saveTasks();
    render();
    input.value = '';
    input.focus();
  }

  /* ── toggle done ── */
  function toggleTask(id) {
    tasks = tasks.map(t => t.id === id ? { ...t, done: !t.done } : t);
    saveTasks();
    render();
  }

  /* ── delete task ── */
  function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    render();
  }

  /* ── edit modal ── */
  function openEditModal(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    editingId = id;
    editInput.value = task.text;
    modal.hidden   = false;
    overlay.hidden = false;
    editInput.focus();
    editInput.select();
  }

  function closeEditModal() {
    modal.hidden   = true;
    overlay.hidden = true;
    editingId = null;
  }

  function saveEdit() {
    const newText = editInput.value.trim();
    if (!newText) { showToast('Task cannot be empty.'); editInput.focus(); return; }

    // Duplicate check excluding the task being edited
    const isDuplicate = tasks.some(
      t => t.id !== editingId && t.text.toLowerCase() === newText.toLowerCase()
    );
    if (isDuplicate) { showToast('A task with this name already exists.'); editInput.select(); return; }

    tasks = tasks.map(t => t.id === editingId ? { ...t, text: newText } : t);
    saveTasks();
    render();
    closeEditModal();
  }

  editSaveBtn.addEventListener('click', saveEdit);
  editCancelBtn.addEventListener('click', closeEditModal);
  overlay.addEventListener('click', closeEditModal);
  editInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  saveEdit();
    if (e.key === 'Escape') closeEditModal();
  });

  /* ── add listeners ── */
  addBtn.addEventListener('click', addTask);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

  render();
})();

/* ══════════════════════════════════════════════════════════
   4. QUICK LINKS
   ══════════════════════════════════════════════════════════ */
(function initLinks() {
  const nameInput = document.getElementById('linkName');
  const urlInput  = document.getElementById('linkUrl');
  const addBtn    = document.getElementById('linkAddBtn');
  const listEl    = document.getElementById('linksList');
  const emptyEl   = document.getElementById('linksEmpty');

  let links = lsGet(LS_KEYS.links, []);   // [{ id, name, url }]

  function saveLinks() { lsSet(LS_KEYS.links, links); }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

  function updateEmpty() {
    emptyEl.style.display = links.length === 0 ? 'block' : 'none';
  }

  function render() {
    listEl.innerHTML = '';

    links.forEach(link => {
      const pill = document.createElement('div');
      pill.className = 'link__pill';

      const a = document.createElement('a');
      a.href    = link.url;
      a.target  = '_blank';
      a.rel     = 'noopener noreferrer';   // safe new-tab
      a.textContent = escapeHtml(link.name);

      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.setAttribute('aria-label', `Remove link to ${link.name}`);
      delBtn.addEventListener('click', () => deleteLink(link.id));

      pill.appendChild(a);
      pill.appendChild(delBtn);
      listEl.appendChild(pill);
    });

    updateEmpty();
  }

  function addLink() {
    const name = nameInput.value.trim();
    const rawUrl = urlInput.value.trim();

    if (!name) { showToast('Please enter a site name.'); nameInput.focus(); return; }
    if (!rawUrl) { showToast('Please enter a URL.'); urlInput.focus(); return; }

    // Auto-prepend https:// if the user omitted the scheme
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

    if (!isValidUrl(url)) {
      showToast('Invalid URL. Use format: https://example.com');
      urlInput.focus();
      return;
    }

    // Duplicate URL check
    if (links.some(l => l.url === url)) {
      showToast('This URL is already saved.');
      urlInput.select();
      return;
    }

    links.push({ id: uid(), name, url });
    saveLinks();
    render();
    nameInput.value = '';
    urlInput.value  = '';
    nameInput.focus();
  }

  function deleteLink(id) {
    links = links.filter(l => l.id !== id);
    saveLinks();
    render();
  }

  addBtn.addEventListener('click', addLink);
  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addLink(); });
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') urlInput.focus(); });

  render();
})();

/* ══════════════════════════════════════════════════════════
   5. LIGHT / DARK THEME TOGGLE
   ══════════════════════════════════════════════════════════ */
(function initTheme() {
  const toggleBtn = document.getElementById('themeToggle');
  const html      = document.documentElement;

  const ICON = { light: '🌙', dark: '☀️' };

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    toggleBtn.textContent = ICON[theme];
    toggleBtn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
  }

  function toggle() {
    const current = html.getAttribute('data-theme') || 'light';
    const next    = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    lsSet(LS_KEYS.theme, next);
  }

  // Load saved preference, fallback to system preference
  const saved  = lsGet(LS_KEYS.theme, null);
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved || system);

  toggleBtn.addEventListener('click', toggle);
})();

const STORAGE_KEY = 'taskManagerData';
let state = {
  tasks: [],
  currentView: 'all',
  sortBy: 'createdAt',
  calendarDate: new Date(),
  selectedCalDate: null,
  focusTaskId: null,
  focusTimerInterval: null,
  dragSrcId: null
};

function getDefaultTask(title) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
    title,
    description: '',
    notes: '',
    dueDate: '',
    dueTime: '',
    priority: 'medium',
    status: 'todo',
    createdAt: new Date().toISOString(),
    completedAt: null,
    archived: false,
    recurring: null,
    timeTracked: 0,
    timeStarted: null,
    sortOrder: 0
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.tasks = parsed.tasks || [];
      state.sortBy = parsed.sortBy || 'createdAt';
      state.currentView = parsed.currentView || 'all';
    }
  } catch (e) {
    state.tasks = [];
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    tasks: state.tasks,
    sortBy: state.sortBy,
    currentView: state.currentView
  }));
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getPriorityWeight(p) {
  return { high: 3, medium: 2, low: 1 }[p] || 0;
}

function getStatusOrder(s) {
  return { todo: 0, 'in-progress': 1, done: 2 }[s] || 0;
}

function getFilteredTasks() {
  let tasks = [...state.tasks];

  if (state.currentView === 'archived') {
    tasks = tasks.filter(t => t.archived);
  } else {
    tasks = tasks.filter(t => !t.archived);
  }

  if (state.currentView === 'today') {
    const today = new Date().toISOString().slice(0, 10);
    tasks = tasks.filter(t => t.dueDate === today);
  }

  tasks.sort((a, b) => {
    if (state.sortBy === 'priority') {
      return getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
    }
    if (state.sortBy === 'dueDate') {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate) || (a.dueTime || '').localeCompare(b.dueTime || '');
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  if (state.currentView !== 'archived' && state.sortBy === 'createdAt') {
    tasks.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return tasks;
}

function getTaskById(id) {
  return state.tasks.find(t => t.id === id);
}

function getCompletedCount() {
  return state.tasks.filter(t => t.status === 'done' && !t.archived).length;
}

function getTotalCount() {
  return state.tasks.filter(t => !t.archived).length;
}

function updateStats() {
  document.getElementById('totalCount').textContent = getTotalCount();
  document.getElementById('completedCount').textContent = getCompletedCount();
}

/* --- Task Rendering --- */
function renderTasks() {
  const list = document.getElementById('taskList');
  const empty = document.getElementById('emptyState');
  const tasks = getFilteredTasks();
  const view = state.currentView;

  list.innerHTML = '';

  if (tasks.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tasks.forEach(task => {
    const card = document.createElement('div');
    card.className = `task-card ${task.status === 'done' ? 'completed' : ''}`;
    card.draggable = true;
    card.dataset.id = task.id;

    const isDone = task.status === 'done';

    card.innerHTML = `
      <div class="task-header">
        <button class="task-check ${isDone ? 'done' : ''}" data-id="${task.id}">${isDone ? '✓' : ''}</button>
        <div class="task-content">
          <div class="task-title" data-id="${task.id}">${escapeHtml(task.title)}</div>
          <div class="task-meta">
            ${task.description ? `<span>📝 ${escapeHtml(task.description)}</span>` : ''}
            ${task.dueDate ? `<span>📅 ${formatDate(task.dueDate)}${task.dueTime ? ' ' + task.dueTime : ''}</span>` : ''}
            <span class="badge badge-${task.priority}">${task.priority}</span>
            <span class="badge badge-${task.status}">${formatStatus(task.status)}</span>
            ${task.timeTracked > 0 ? `<span class="time-tracked" data-id="${task.id}">⏱ ${formatTime(task.timeTracked)}</span>` : ''}
            ${task.recurring ? `<span>🔄 ${task.recurring.type}${task.recurring.type === 'custom' ? ' (' + task.recurring.interval + 'd)' : ''}</span>` : ''}
            ${task.notes ? `<span>📋 ${escapeHtml(task.notes)}</span>` : ''}
          </div>
        </div>
        <div class="task-actions">
          ${view !== 'archived' ? `<button class="focus-btn" data-id="${task.id}" title="Focus">🎯</button>` : ''}
          ${view !== 'archived' ? `<button class="archive-btn" data-id="${task.id}" title="Archive">📦</button>` : ''}
          ${view === 'archived' ? `<button class="unarchive-btn" data-id="${task.id}" title="Restore">↩️</button>` : ''}
          <button class="delete-btn" data-id="${task.id}" title="Delete">🗑️</button>
        </div>
      </div>
    `;

    card.addEventListener('dragstart', (e) => {
      state.dragSrcId = task.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.task-card.drag-over').forEach(c => c.classList.remove('drag-over'));
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      if (state.dragSrcId && state.dragSrcId !== task.id && state.currentView !== 'archived') {
        reorderTasks(state.dragSrcId, task.id);
      }
      state.dragSrcId = null;
    });

    list.appendChild(card);
  });

  attachTaskListeners();
}

function reorderTasks(srcId, targetId) {
  const tasks = state.tasks.filter(t => !t.archived).sort((a, b) => a.sortOrder - b.sortOrder);
  const srcIdx = tasks.findIndex(t => t.id === srcId);
  const targetIdx = tasks.findIndex(t => t.id === targetId);
  if (srcIdx === -1 || targetIdx === -1) return;

  const [moved] = tasks.splice(srcIdx, 1);
  tasks.splice(targetIdx, 0, moved);
  tasks.forEach((t, i) => {
    const task = getTaskById(t.id);
    if (task) task.sortOrder = i;
  });
  saveState();
  renderTasks();
  updateStats();
}

function attachTaskListeners() {
  document.querySelectorAll('.task-check').forEach(btn => {
    btn.removeEventListener('click', toggleTaskStatus);
    btn.addEventListener('click', toggleTaskStatus);
  });

  document.querySelectorAll('.task-title').forEach(el => {
    el.removeEventListener('click', openEditModal);
    el.addEventListener('click', openEditModal);
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.removeEventListener('click', deleteTask);
    btn.addEventListener('click', deleteTask);
  });

  document.querySelectorAll('.archive-btn').forEach(btn => {
    btn.removeEventListener('click', archiveTask);
    btn.addEventListener('click', archiveTask);
  });

  document.querySelectorAll('.unarchive-btn').forEach(btn => {
    btn.removeEventListener('click', unarchiveTask);
    btn.addEventListener('click', unarchiveTask);
  });

  document.querySelectorAll('.focus-btn').forEach(btn => {
    btn.removeEventListener('click', startFocusFromTask);
    btn.addEventListener('click', startFocusFromTask);
  });

  document.querySelectorAll('.time-tracked').forEach(el => {
    el.removeEventListener('click', resetTimeTracking);
    el.addEventListener('click', resetTimeTracking);
  });
}

function toggleTaskStatus(e) {
  const id = e.currentTarget.dataset.id;
  const task = getTaskById(id);
  if (!task) return;

  if (task.status === 'done') {
    task.status = 'todo';
    task.completedAt = null;
  } else {
    task.status = 'done';
    task.completedAt = new Date().toISOString();
  }

  saveState();
  checkRecurring(task);
  renderView();
  updateStats();
}

function deleteTask(e) {
  const id = e.currentTarget.dataset.id;
  if (!confirm('Delete this task?')) return;
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveState();
  renderView();
  updateStats();
}

function archiveTask(e) {
  const id = e.currentTarget.dataset.id;
  const task = getTaskById(id);
  if (!task) return;
  task.archived = true;
  saveState();
  renderView();
  updateStats();
}

function unarchiveTask(e) {
  const id = e.currentTarget.dataset.id;
  const task = getTaskById(id);
  if (!task) return;
  task.archived = false;
  saveState();
  renderView();
  updateStats();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatStatus(s) {
  return { todo: 'To Do', 'in-progress': 'In Progress', done: 'Done' }[s] || s;
}

/* --- Modal --- */
function openEditModal(e) {
  const id = e.currentTarget.dataset.id;
  const task = getTaskById(id);
  if (!task) return;

  document.getElementById('modalTaskId').value = task.id;
  document.getElementById('modalTaskTitle').value = task.title;
  document.getElementById('modalTaskDescription').value = task.description;
  document.getElementById('modalTaskNotes').value = task.notes;
  document.getElementById('modalDueDate').value = task.dueDate;
  document.getElementById('modalDueTime').value = task.dueTime;
  document.getElementById('modalPriority').value = task.priority;
  document.getElementById('modalStatus').value = task.status;
  document.getElementById('modalTitle').textContent = 'Edit Task';
  document.getElementById('taskModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('taskModal').classList.add('hidden');
}

function saveModal(e) {
  e.preventDefault();
  const id = document.getElementById('modalTaskId').value;
  const task = getTaskById(id);
  if (!task) return;

  task.title = document.getElementById('modalTaskTitle').value.trim();
  task.description = document.getElementById('modalTaskDescription').value.trim();
  task.notes = document.getElementById('modalTaskNotes').value.trim();
  task.dueDate = document.getElementById('modalDueDate').value;
  task.dueTime = document.getElementById('modalDueTime').value;
  task.priority = document.getElementById('modalPriority').value;
  task.status = document.getElementById('modalStatus').value;

  saveState();
  checkRecurring(task);
  closeModal();
  renderView();
  updateStats();
}

function resetTimeTracking(e) {
  e.stopPropagation();
  const id = e.currentTarget.dataset.id;
  const task = getTaskById(id);
  if (!task) return;
  if (confirm('Reset time tracking for this task?')) {
    task.timeTracked = 0;
    saveState();
    renderView();
  }
}

/* --- Recurring Tasks --- */
function checkRecurring(task) {
  if (task.status !== 'done' || !task.recurring) return;

  const now = new Date();
  let nextDate = new Date();

  if (task.recurring.type === 'daily') {
    nextDate.setDate(nextDate.getDate() + 1);
  } else if (task.recurring.type === 'weekly') {
    nextDate.setDate(nextDate.getDate() + 7);
  } else if (task.recurring.type === 'custom') {
    nextDate.setDate(nextDate.getDate() + (task.recurring.interval || 7));
  }

  const newTask = getDefaultTask(task.title);
  newTask.description = task.description;
  newTask.notes = task.notes;
  newTask.priority = task.priority;
  newTask.dueDate = nextDate.toISOString().slice(0, 10);
  newTask.dueTime = task.dueTime;
  newTask.recurring = task.recurring;
  newTask.sortOrder = state.tasks.length;

  state.tasks.push(newTask);
  saveState();
}

/* --- Focus Mode --- */
function stopExistingFocus() {
  if (state.focusTaskId) {
    const prevTask = getTaskById(state.focusTaskId);
    if (prevTask && prevTask.timeStarted) {
      prevTask.timeTracked = (prevTask.timeTracked || 0) + (Date.now() - prevTask.timeStarted) / 1000;
      prevTask.timeStarted = null;
    }
    clearInterval(state.focusTimerInterval);
    state.focusTaskId = null;
  }
}

function startFocusFromTask(e) {
  const id = e.currentTarget.dataset.id;
  stopExistingFocus();
  state.focusTaskId = id;
  document.getElementById('focusBar').classList.remove('hidden');
  document.getElementById('focusTaskTitle').textContent = getTaskById(id).title;
  document.getElementById('focusStopBtn').onclick = stopFocus;

  const task = getTaskById(id);
  if (task) {
    task.timeStarted = Date.now();
    saveState();
  }

  updateFocusTimer();
  state.focusTimerInterval = setInterval(updateFocusTimer, 1000);
}

function updateFocusTimer() {
  const task = state.focusTaskId ? getTaskById(state.focusTaskId) : null;
  if (!task) {
    document.getElementById('focusTimer').textContent = '00:00:00';
    return;
  }

  let total = task.timeTracked || 0;
  if (task.timeStarted) {
    total += (Date.now() - task.timeStarted) / 1000;
  }
  document.getElementById('focusTimer').textContent = formatTime(total);
}

function stopFocus() {
  const task = state.focusTaskId ? getTaskById(state.focusTaskId) : null;
  if (task && task.timeStarted) {
    task.timeTracked = (task.timeTracked || 0) + (Date.now() - task.timeStarted) / 1000;
    task.timeStarted = null;
    saveState();
  }

  clearInterval(state.focusTimerInterval);
  state.focusTaskId = null;
  document.getElementById('focusBar').classList.add('hidden');
  renderView();
  updateStats();
}

/* --- View Management --- */
function switchView(view) {
  state.currentView = view;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-view="${view}"]`)?.classList.add('active');
  saveState();
  renderView();
}

function renderView() {
  document.querySelectorAll('#viewTitle, #taskList, #emptyState, #taskFormContainer, #calendarView, #focusModeView, #archivedView').forEach(el => {
    if (el.id === 'viewTitle') {
      const titles = { all: 'All Tasks', today: "Today's Tasks", calendar: 'Calendar', focus: 'Focus Mode', archived: 'Archived Tasks' };
      el.textContent = titles[state.currentView] || 'Tasks';
    }
  });

  document.getElementById('taskFormContainer').classList.toggle('hidden', state.currentView === 'calendar' || state.currentView === 'focus' || state.currentView === 'archived');
  document.getElementById('taskList').classList.toggle('hidden', state.currentView === 'calendar' || state.currentView === 'focus' || state.currentView === 'archived');
  document.getElementById('emptyState').classList.toggle('hidden', true);
  document.getElementById('calendarView').classList.toggle('hidden', state.currentView !== 'calendar');
  document.getElementById('focusModeView').classList.toggle('hidden', state.currentView !== 'focus');
  document.getElementById('archivedView').classList.toggle('hidden', state.currentView !== 'archived');

  if (state.currentView === 'all' || state.currentView === 'today') {
    renderTasks();
  } else if (state.currentView === 'calendar') {
    renderCalendar();
  } else if (state.currentView === 'focus') {
    renderFocusView();
  } else if (state.currentView === 'archived') {
    renderArchived();
  }

  updateStats();
}

function renderArchived() {
  const list = document.getElementById('archivedList');
  const archived = state.tasks.filter(t => t.archived);

  list.innerHTML = '';
  if (archived.length === 0) {
    list.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:40px;">No archived tasks.</p>';
    return;
  }

  archived.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  archived.forEach(task => {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.innerHTML = `
      <div class="task-header">
        <div class="task-check done">✓</div>
        <div class="task-content">
          <div class="task-title">${escapeHtml(task.title)}</div>
          <div class="task-meta">
            ${task.dueDate ? `<span>📅 ${formatDate(task.dueDate)}</span>` : ''}
            <span class="badge badge-${task.priority}">${task.priority}</span>
            <span class="badge badge-done">Done</span>
          </div>
        </div>
        <div class="task-actions">
          <button class="unarchive-btn" data-id="${task.id}" title="Restore">↩️</button>
          <button class="delete-btn" data-id="${task.id}" title="Delete">🗑️</button>
        </div>
      </div>
    `;
    list.appendChild(card);
  });

  document.querySelectorAll('#archivedView .delete-btn').forEach(btn => {
    btn.addEventListener('click', deleteTask);
  });
  document.querySelectorAll('#archivedView .unarchive-btn').forEach(btn => {
    btn.addEventListener('click', unarchiveTask);
  });
}

function renderFocusView() {
  const select = document.getElementById('focusTaskSelect');
  const tasks = state.tasks.filter(t => !t.archived && t.status !== 'done');
  select.innerHTML = '<option value="">Select a task...</option>';
  tasks.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.title;
    select.appendChild(opt);
  });
}

/* --- Calendar --- */
function renderCalendar() {
  const date = state.calendarDate;
  const year = date.getFullYear();
  const month = date.getMonth();

  if (!state.selectedCalDate) {
    state.selectedCalDate = new Date().toISOString().slice(0, 10);
  }

  document.getElementById('calMonthYear').textContent =
    new Date(year, month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  days.forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-day-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < firstDay; i++) {
    const div = document.createElement('div');
    div.className = 'cal-day other-month';
    grid.appendChild(div);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const div = document.createElement('div');
    div.className = `cal-day${dateStr === today ? ' today' : ''}${state.selectedCalDate === dateStr ? ' selected' : ''}`;

    const tasksOnDay = state.tasks.filter(t => !t.archived && t.dueDate === dateStr);
    if (tasksOnDay.length > 0) div.classList.add('has-tasks');

    div.textContent = d;
    div.dataset.date = dateStr;
    div.addEventListener('click', () => {
      state.selectedCalDate = dateStr;
      renderCalendar();
      showCalendarTasks(dateStr);
    });

    grid.appendChild(div);
  }

  showCalendarTasks(state.selectedCalDate);
}

function showCalendarTasks(dateStr) {
  const container = document.getElementById('calendarTasks');
  const tasks = state.tasks.filter(t => !t.archived && t.dueDate === dateStr);

  if (tasks.length === 0) {
    container.innerHTML = '<h4>No tasks for this date.</h4>';
    return;
  }

  container.innerHTML = `<h4>Tasks for ${formatDate(dateStr)}</h4>`;
  tasks.forEach(task => {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.innerHTML = `
      <div class="task-header">
        <button class="task-check ${task.status === 'done' ? 'done' : ''}" data-id="${task.id}">${task.status === 'done' ? '✓' : ''}</button>
        <div class="task-content">
          <div class="task-title" data-id="${task.id}">${escapeHtml(task.title)}</div>
          <div class="task-meta">
            <span class="badge badge-${task.priority}">${task.priority}</span>
            <span class="badge badge-${task.status}">${formatStatus(task.status)}</span>
          </div>
        </div>
        <div class="task-actions">
          <button class="archive-btn" data-id="${task.id}" title="Archive">📦</button>
          <button class="delete-btn" data-id="${task.id}" title="Delete">🗑️</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('.task-check').forEach(btn => {
    btn.addEventListener('click', toggleTaskStatus);
  });
  container.querySelectorAll('.task-title').forEach(el => {
    el.addEventListener('click', openEditModal);
  });
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', deleteTask);
  });
  container.querySelectorAll('.archive-btn').forEach(btn => {
    btn.addEventListener('click', archiveTask);
  });
}

/* --- Form --- */
function handleAddTask(e) {
  e.preventDefault();
  const titleInput = document.getElementById('taskTitle');
  const title = titleInput.value.trim();
  if (!title) return;

  const task = getDefaultTask(title);
  task.description = document.getElementById('taskDescription').value.trim();
  task.notes = document.getElementById('taskNotes').value.trim();
  task.dueDate = document.getElementById('taskDueDate').value;
  task.dueTime = document.getElementById('taskDueTime').value;
  task.priority = document.getElementById('taskPriority').value;
  task.sortOrder = state.tasks.length;

  const recurringVal = document.getElementById('taskRecurring').value;
  if (recurringVal !== 'none') {
    if (recurringVal === 'custom') {
      const interval = parseInt(document.getElementById('taskCustomInterval').value) || 7;
      task.recurring = { type: 'custom', interval };
    } else {
      task.recurring = { type: recurringVal, interval: 1 };
    }
  }

  state.tasks.push(task);
  saveState();
  titleInput.value = '';
  document.getElementById('taskDescription').value = '';
  document.getElementById('taskNotes').value = '';
  document.getElementById('taskDueDate').value = '';
  document.getElementById('taskDueTime').value = '';
  document.getElementById('taskPriority').value = 'medium';
  document.getElementById('taskRecurring').value = 'none';
  document.getElementById('customIntervalGroup').style.display = 'none';

  renderView();
  updateStats();
}

/* --- Init --- */
function init() {
  loadState();

  // Theme
  const savedTheme = localStorage.getItem('taskManagerTheme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.getElementById('themeToggle').textContent = savedTheme === 'dark' ? '☀️' : '🌙';

  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('taskManagerTheme', next);
    document.getElementById('themeToggle').textContent = next === 'dark' ? '☀️' : '🌙';
  });

  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Form
  document.getElementById('taskForm').addEventListener('submit', handleAddTask);
  document.getElementById('expandFormBtn').addEventListener('click', () => {
    document.getElementById('formExtras').classList.remove('hidden');
    document.getElementById('expandFormBtn').classList.add('hidden');
  });
  document.getElementById('collapseFormBtn').addEventListener('click', () => {
    document.getElementById('formExtras').classList.add('hidden');
    document.getElementById('expandFormBtn').classList.remove('hidden');
  });

  // Recurring
  document.getElementById('taskRecurring').addEventListener('change', (e) => {
    document.getElementById('customIntervalGroup').style.display = e.target.value === 'custom' ? 'block' : 'none';
  });

  // Sort
  document.getElementById('sortBtn').addEventListener('click', () => {
    document.getElementById('sortMenu').classList.toggle('hidden');
  });
  document.querySelectorAll('#sortMenu button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.sortBy = btn.dataset.sort;
      document.getElementById('sortMenu').classList.add('hidden');
      saveState();
      renderView();
    });
  });

  // Calendar nav
  document.getElementById('calPrevBtn').addEventListener('click', () => {
    state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
    state.selectedCalDate = null;
    renderCalendar();
    document.getElementById('calendarTasks').innerHTML = '';
  });
  document.getElementById('calNextBtn').addEventListener('click', () => {
    state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
    state.selectedCalDate = null;
    renderCalendar();
    document.getElementById('calendarTasks').innerHTML = '';
  });

  // Focus mode
  document.getElementById('focusStartBtn').addEventListener('click', () => {
    const id = document.getElementById('focusTaskSelect').value;
    if (!id) return;
    stopExistingFocus();
    state.focusTaskId = id;
    document.getElementById('focusBar').classList.remove('hidden');
    document.getElementById('focusTaskTitle').textContent = getTaskById(id).title;
    document.getElementById('focusStopBtn').onclick = stopFocus;

    const task = getTaskById(id);
    if (task) {
      task.timeStarted = Date.now();
      saveState();
    }

    updateFocusTimer();
    state.focusTimerInterval = setInterval(updateFocusTimer, 1000);
  });

  // Modal
  document.getElementById('modalForm').addEventListener('submit', saveModal);
  document.querySelector('.modal-close').addEventListener('click', closeModal);
  document.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('taskModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Close sort menu on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.sidebar-footer')) {
      document.getElementById('sortMenu').classList.add('hidden');
    }
  });

  // Restore focus if session was active
  const hasActiveFocus = state.tasks.some(t => t.timeStarted);
  if (hasActiveFocus) {
    const activeTask = state.tasks.find(t => t.timeStarted);
    if (activeTask) {
      state.focusTaskId = activeTask.id;
      document.getElementById('focusBar').classList.remove('hidden');
      document.getElementById('focusTaskTitle').textContent = activeTask.title;
      document.getElementById('focusStopBtn').onclick = stopFocus;
      state.focusTimerInterval = setInterval(updateFocusTimer, 1000);
    }
  }

  // Load active view from saved state
  const activeBtn = document.querySelector(`.nav-btn[data-view="${state.currentView}"]`);
  if (activeBtn) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    activeBtn.classList.add('active');
  }

  renderView();
}

document.addEventListener('DOMContentLoaded', init);

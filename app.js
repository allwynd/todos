const STORAGE_KEY = 'todo-app-tasks';

const todoForm = document.getElementById('todo-form');
const taskInput = document.getElementById('task-input');
const dueDateInput = document.getElementById('due-date-input');
const taskFileInput = document.getElementById('task-file-input');
const loadFileButton = document.getElementById('load-file-button');
const toggleImportButton = document.getElementById('toggle-import-button');

const importRow = document.getElementById('import-row');
const todoList = document.getElementById('todo-list');
const activeTab = document.getElementById('active-tab');
const completedTab = document.getElementById('completed-tab');

let tasks = [];
let currentView = 'active';
let isImportVisible = false;
let editingTaskId = null;

function loadTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    tasks = stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load tasks:', error);
    tasks = [];    
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function parseTaskFileContent(content) {
  try {
    return JSON.parse(content);
  } catch {
    return content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(text => ({ text }));
  }
}

function normalizeImportedTask(raw) {
  const text = raw?.text?.toString().trim();
  if (!text) return null;

  return {
    id: raw?.id ? String(raw.id) : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text,
    dueDate: raw?.dueDate ? String(raw.dueDate).trim() || null : null,
    completed: Boolean(raw?.completed),
    createdAt: raw?.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: raw?.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString()
  };
}

function loadTasksFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const parsed = parseTaskFileContent(content);
      let imported = [];

      if (Array.isArray(parsed)) {
        imported = parsed;
      } else if (parsed && Array.isArray(parsed.tasks)) {
        imported = parsed.tasks;
      }

      if (!Array.isArray(imported)) {
        reject(new Error('Unexpected file format.'));
        return;
      }

      const normalized = imported
        .map(normalizeImportedTask)
        .filter(Boolean);

      if (normalized.length === 0) {
        reject(new Error('No valid tasks found in file.'));
        return;
      }

      resolve(normalized);
    };

    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsText(file);
  });
}

function handleFileLoad() {
  const file = taskFileInput.files?.[0];
  if (!file) {
    alert('Select a JSON or text file containing tasks first.');
    return;
  }

  loadTasksFromFile(file)
    .then(importedTasks => {
      tasks = importedTasks;
      saveTasks();
      setActiveTab(currentView);
      taskFileInput.value = '';
      alert(`Loaded ${importedTasks.length} task${importedTasks.length === 1 ? '' : 's'} from file.`);
    })
    .catch(error => {
      console.error(error);
      alert('Unable to import tasks. Use a JSON array or newline-delimited text file.');
    });
}

function createTaskElement(task) {
  const item = document.createElement('li');
  item.className = 'task-item';
  if (task.completed) item.classList.add('completed');
  if (isTaskExpired(task)) item.classList.add('expired');
  if (isDueToday(task)) item.classList.add('due-today');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = task.completed;
  checkbox.id = `task-checkbox-${task.id}`;
  checkbox.addEventListener('change', () => toggleTaskCompletion(task.id));

  const details = document.createElement('div');
  details.className = 'task-details';
  const isEditing = !task.completed && editingTaskId === task.id;

  if (isEditing) {
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = task.text;
    textInput.className = 'task-edit-text';
    textInput.placeholder = 'Task name';

    const dueInput = document.createElement('input');
    dueInput.type = 'datetime-local';
    dueInput.value = formatInputDateValue(task.dueDate);
    dueInput.className = 'task-edit-due';

    details.append(textInput, dueInput);

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.textContent = 'Save';
    saveButton.addEventListener('click', () => saveTaskEdits(task.id, textInput.value, dueInput.value));

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', cancelTaskEdit);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => removeTask(task.id));

    actions.append(saveButton, cancelButton, deleteButton);
    item.append(checkbox, details, actions);
    return item;
  }

  const label = document.createElement('p');
  label.className = 'task-label';
  label.textContent = task.text;
  if (task.completed) {
    label.title = 'Completed tasks cannot be edited. Reactivate first to change them.';
  } else {
    label.title = 'Click to edit task';
    label.addEventListener('click', () => startTaskEdit(task.id));
  }

  const meta = document.createElement('p');
  meta.className = 'task-meta';
  meta.textContent = formatMetaText(task);

  details.append(label, meta);

  const actions = document.createElement('div');
  actions.className = 'task-actions';

  if (!task.completed) {
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => startTaskEdit(task.id));
    actions.append(editButton);
  }

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', () => removeTask(task.id));
  actions.append(deleteButton);

  item.append(checkbox, details, actions);
  return item;
}

function formatMetaText(task) {
  const parts = [];
  if (task.completed) {
    parts.push('Completed');
  } else {
    parts.push('Active');
  }

  if (task.dueDate) {
    const date = new Date(task.dueDate);
    const dueString = date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    parts.push(`Due ${dueString}`);
  }

  if (isTaskExpired(task) && !task.completed) {
    parts.push('Expired');
  }

  return parts.join(' · ');
}

function formatInputDateValue(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const iso = date.toISOString();
  return iso.slice(0, 16);
}

function isTaskExpired(task) {
  if (!task.dueDate) return false;
  return new Date(task.dueDate) < new Date() && !task.completed;
}

function isDueToday(task) {
  if (!task.dueDate) return false;
  const due = new Date(task.dueDate);
  const now = new Date();
  return due.toDateString() === now.toDateString() && !task.completed;
}

function sortTasksByDate(list, view) {
  return list.sort((a, b) => {
    const aDate = a.dueDate ? new Date(a.dueDate) : null;
    const bDate = b.dueDate ? new Date(b.dueDate) : null;

    if (aDate && bDate) {
      return view === 'active' ? aDate - bDate : bDate - aDate;
    }
    if (aDate) {
      return -1;
    }
    if (bDate) {
      return 1;
    }

    const aCreated = new Date(a.createdAt);
    const bCreated = new Date(b.createdAt);
    return view === 'active' ? aCreated - bCreated : bCreated - aCreated;
  });
}

function renderTasks() {
  todoList.innerHTML = '';
  const filtered = tasks.filter(task => {
    return currentView === 'active' ? !task.completed : task.completed;
  });

  if (filtered.length === 0) {
    const emptyMessage = document.createElement('li');
    emptyMessage.className = 'task-item';
    emptyMessage.textContent = currentView === 'active'
      ? 'No active tasks. Add one above to get started!'
      : 'No completed tasks yet. Complete a task to see it here.';
    todoList.appendChild(emptyMessage);
    return;
  }

  sortTasksByDate(filtered, currentView);
  filtered.forEach(task => todoList.appendChild(createTaskElement(task)));
}

function setActiveTab(tab) {
  currentView = tab;
  activeTab.classList.toggle('active', tab === 'active');
  completedTab.classList.toggle('active', tab === 'completed');
  activeTab.setAttribute('aria-selected', String(tab === 'active'));
  completedTab.setAttribute('aria-selected', String(tab === 'completed'));
  cancelTaskEdit();
  renderTasks();
}

function addTask(text, dueDate) {
  const newTask = {
    id: `${Date.now()}`,
    text: text.trim(),
    dueDate: dueDate || null,
    completed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  tasks.push(newTask);
  saveTasks();
  renderTasks();
}

function removeTask(taskId) {
  tasks = tasks.filter(task => task.id !== taskId);
  saveTasks();
  renderTasks();
}

function toggleTaskCompletion(taskId) {
  const task = tasks.find(item => item.id === taskId);
  if (!task) return;
  task.completed = !task.completed;
  task.updatedAt = new Date().toISOString();
  if (editingTaskId === taskId) {
    editingTaskId = null;
  }
  saveTasks();
  renderTasks();
}

function startTaskEdit(taskId) {
  const task = tasks.find(item => item.id === taskId);
  if (!task) return;
  if (task.completed) {
    alert('Completed tasks cannot be edited. Make the task active first if you want to change it.');
    return;
  }

  editingTaskId = taskId;
  renderTasks();
}

function saveTaskEdits(taskId, text, dueDate) {
  const task = tasks.find(item => item.id === taskId);
  if (!task) return;

  const trimmed = text.trim();
  if (!trimmed) {
    alert('Task text cannot be empty.');
    return;
  }

  task.text = trimmed;
  task.dueDate = dueDate ? dueDate.trim() : null;
  task.updatedAt = new Date().toISOString();
  editingTaskId = null;
  saveTasks();
  renderTasks();
}

function cancelTaskEdit() {
  editingTaskId = null;
  renderTasks();
}

function handleFormSubmit(event) {
  event.preventDefault();

  const text = taskInput.value;
  const dueDate = dueDateInput.value;

  if (!text.trim()) {
    alert('Please enter a task description before adding.');
    return;
  }

  addTask(text, dueDate);
  taskInput.value = '';
  dueDateInput.value = '';
  taskInput.focus();
}

function setImportVisibility(visible) {
  isImportVisible = visible;
  importRow.classList.toggle('hidden', !visible);
  toggleImportButton.setAttribute('aria-expanded', String(visible));
  toggleImportButton.setAttribute('aria-label', visible ? 'Hide file import' : 'Show file import');
  toggleImportButton.querySelector('span').textContent = visible ? '❌' : '📁';
}

function bindEvents() {
  todoForm.addEventListener('submit', handleFormSubmit);
  loadFileButton.addEventListener('click', handleFileLoad);
  toggleImportButton.addEventListener('click', () => setImportVisibility(!isImportVisible));
  activeTab.addEventListener('click', () => setActiveTab('active'));
  completedTab.addEventListener('click', () => setActiveTab('completed'));
}

function init() {
  loadTasks();
  //console.log('Displaying todos as JSON string: ', JSON.stringify(tasks));
  bindEvents();
  setImportVisibility(false);
  setActiveTab(currentView);
}

init();

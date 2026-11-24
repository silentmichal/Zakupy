const get = (id) => document.getElementById(id);
const loginForm = get('login-form');
const addForm = get('add-form');
const password = get('password');
const showPassword = get('show-password');

const profiles = { michal: 'Michał', ola: 'Ola' };
const categories = {
  produce: 'Warzywa i owoce',
  dairy: 'Nabiał i jaja',
  bakery: 'Pieczywo',
  pantry: 'Spożywcze',
  home: 'Do domu',
  other: 'Inne',
};

let profile = null;
let items = [];
let revision = 0;
let busy = false;
let refreshing = false;

async function request(action = null) {
  const response = await fetch('/api/zakupy', action && {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  } || undefined);
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), { status: response.status });
  return result;
}

function errorAt(id, message = '') {
  const element = get(id);
  element.textContent = message;
  element.hidden = !message;
}

function setSync(status) {
  const target = get('sync-state');
  target.dataset.state = status;
  const text = { saved: 'Zsynchronizowano', saving: 'Zapisywanie…', offline: 'Brak połączenia' };
  target.lastChild.textContent = ' ' + text[status];
}

function useAvatar(element, id) {
  element.textContent = profiles[id][0];
  element.classList.toggle('ola', id === 'ola');
}

function showLogin(message = '') {
  profile = null;
  items = [];
  get('loading').hidden = true;
  get('account').hidden = true;
  get('shopping').hidden = true;
  get('todo').replaceChildren();
  get('done').replaceChildren();
  get('login').hidden = false;
  errorAt('login-error', message);
}

function showList(data) {
  const firstView = !profile;
  profile = data.profile;
  get('loading').hidden = true;
  get('login').hidden = true;
  get('account').hidden = false;
  get('shopping').hidden = false;
  get('account-name').textContent = profiles[profile];
  useAvatar(get('account-avatar'), profile);
  if (firstView || JSON.stringify(items) !== JSON.stringify(data.items)) {
    items = data.items;
    renderList();
  }
}

function renderItem(item) {
  const entry = get('item-template').content.firstElementChild.cloneNode(true);
  entry.dataset.id = item.id;
  entry.classList.toggle('is-done', item.done);
  entry.querySelector('.item-name').textContent = item.name;
  const quantity = entry.querySelector('.item-quantity');
  quantity.textContent = item.quantity;
  quantity.hidden = !item.quantity;
  const check = entry.querySelector('.check');
  check.checked = item.done;
  check.setAttribute('aria-label', (item.done ? 'Przywróć: ' : 'Odhacz: ') + item.name);
  check.addEventListener('change', () => {
    const done = check.checked;
    check.checked = item.done;
    change({ action: 'check', id: item.id, done }, done ? 'Produkt odhaczony.' : 'Produkt przywrócony.');
  });
  const avatar = entry.querySelector('.author');
  useAvatar(avatar, item.profile);
  avatar.title = 'Dodano przez: ' + profiles[item.profile];
  avatar.removeAttribute('aria-hidden');
  avatar.setAttribute('aria-label', avatar.title);
  const remove = entry.querySelector('.remove');
  remove.setAttribute('aria-label', 'Usuń: ' + item.name);
  remove.addEventListener('click', () => change({ action: 'remove', id: item.id }, 'Produkt usunięty.'));
  return entry;
}

function renderList() {
  const focusedRow = document.activeElement?.closest('.item');
  const focusedClass = document.activeElement?.classList.contains('check') ? '.check' : '.remove';
  const completed = items.filter((item) => item.done);
  const pending = items.filter((item) => !item.done);
  const todo = get('todo');
  todo.replaceChildren();

  for (const [key, label] of Object.entries(categories)) {
    const group = pending.filter((item) => item.category === key);
    if (!group.length) continue;
    const card = document.createElement('section');
    card.className = 'category';
    const heading = document.createElement('h3');
    heading.textContent = label;
    const list = document.createElement('ul');
    list.className = 'items';
    list.append(...group.map(renderItem));
    card.append(heading, list);
    todo.append(card);
  }

  if (!pending.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = items.length ? 'Wszystko kupione.' : 'Dodaj pierwszy produkt do wspólnej listy.';
    todo.append(empty);
  }

  get('done').replaceChildren(...completed.map(renderItem));
  get('done-section').hidden = !completed.length;
  get('todo-count').textContent = pending.length;
  get('done-count').textContent = completed.length;
  get('progress-copy').textContent = completed.length + ' z ' + items.length + ' kupionych';
  get('progress').max = items.length || 1;
  get('progress').value = completed.length;
  get('summary-copy').textContent = pending.length
    ? 'Sprawdź, co zostało do kupienia.'
    : items.length ? 'Możecie już wracać do domu.' : 'Wspólna lista Michała i Oli.';

  if (focusedRow) {
    const sameRow = [...document.querySelectorAll('.item')].find((row) => row.dataset.id === focusedRow.dataset.id);
    (sameRow?.querySelector(focusedClass) ?? get('item-name')).focus({ preventScroll: true });
  }
}

async function refresh() {
  if (busy || refreshing || document.hidden) return;
  refreshing = true;
  const version = revision;
  try {
    const data = await request();
    if (version !== revision) return;
    showList(data);
    setSync('saved');
  } catch (error) {
    if (version !== revision) return;
    if (error.status === 401) showLogin();
    else if (profile) setSync('offline');
    else showLogin(error.message || 'Nie udało się otworzyć listy.');
  } finally {
    refreshing = false;
  }
}

async function change(action, announcement) {
  if (busy) return false;
  busy = true;
  revision += 1;
  get('add').disabled = true;
  get('shopping').setAttribute('aria-busy', 'true');
  setSync('saving');
  errorAt('list-error');
  try {
    const data = await request(action);
    showList(data);
    setSync('saved');
    get('announcement').textContent = announcement;
    return true;
  } catch (error) {
    if (error.status === 401) showLogin('Sesja wygasła. Zaloguj się ponownie.');
    else errorAt('list-error', error.message || 'Nie udało się zapisać zmiany.');
    setSync('offline');
    return false;
  } finally {
    busy = false;
    get('add').disabled = false;
    get('shopping').setAttribute('aria-busy', 'false');
  }
}

showPassword.addEventListener('click', () => {
  const visible = password.type === 'password';
  password.type = visible ? 'text' : 'password';
  showPassword.textContent = visible ? 'Ukryj' : 'Pokaż';
  showPassword.setAttribute('aria-pressed', visible);
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const data = new FormData(loginForm);
  busy = true;
  revision += 1;
  get('sign-in').disabled = true;
  errorAt('login-error');
  try {
    showList(await request({ action: 'login', profile: data.get('profile'), password: data.get('password') }));
    setSync('saved');
    password.value = '';
    password.type = 'password';
    showPassword.textContent = 'Pokaż';
    showPassword.setAttribute('aria-pressed', 'false');
    get('shopping-title').focus();
  } catch (error) {
    errorAt('login-error', error.message || 'Nie udało się zalogować.');
  } finally {
    busy = false;
    get('sign-in').disabled = false;
  }
});

get('logout').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  revision += 1;
  try {
    await request({ action: 'logout' });
    addForm.reset();
    showLogin();
    get('login-title').focus();
  } catch (error) {
    errorAt('list-error', error.message || 'Nie udało się wylogować.');
  } finally {
    busy = false;
  }
});

addForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(addForm);
  const name = data.get('name').trim();
  if (!name) {
    errorAt('list-error', 'Wpisz nazwę produktu.');
    get('item-name').focus();
    return;
  }
  const action = {
    action: 'add', id: crypto.randomUUID(), name,
    quantity: data.get('quantity'), category: data.get('category'),
  };
  if (await change(action, 'Produkt dodany.')) {
    if (get('item-name').value === data.get('name')) get('item-name').value = '';
    if (get('quantity').value === action.quantity) get('quantity').value = '';
    get('item-name').focus();
  }
});

get('clear').addEventListener('click', () => {
  const ids = items.filter((item) => item.done).map((item) => item.id);
  if (confirm('Usunąć kupione produkty z listy?')) change({ action: 'clear', ids }, 'Usunięto kupione produkty.');
});

document.addEventListener('visibilitychange', () => { if (profile) refresh(); });
window.addEventListener('online', () => { if (profile) refresh(); });
setInterval(() => { if (profile) refresh(); }, 12000);
refresh();

import { suggestRecipes } from './recipes.js';

const get = (id) => document.getElementById(id);
const loginForm = get('login-form');
const addForm = get('add-form');
const catalog = get('catalog');
const nameInput = get('item-name');
const history = get('history');
const password = get('password');
const showPassword = get('show-password');

const defaultProfileNames = { michal: 'Michał', ola: 'Ola' };
let profiles = defaultProfileNames;
const profileDialog = get('profile-dialog');
const profileNameInput = get('profile-name-input');
const categories = {
  produce: 'Warzywa i owoce',
  dairy: 'Nabiał i jaja',
  bakery: 'Pieczywo',
  pantry: 'Spożywcze',
  home: 'Do domu',
  other: 'Inne',
};
const commonProducts = {
  produce: ['Banany', 'Cebula', 'Cytryny', 'Jabłka', 'Marchew', 'Ogórki', 'Papryka', 'Pomarańcze', 'Pomidory', 'Sałata', 'Ziemniaki'],
  dairy: ['Jajka', 'Jogurt', 'Masło', 'Mleko', 'Ser żółty', 'Śmietana', 'Twaróg'],
  bakery: ['Bułki', 'Chleb', 'Chleb tostowy', 'Tortille'],
  pantry: ['Herbata', 'Kawa', 'Kurczak', 'Makaron', 'Mąka', 'Mięso mielone', 'Olej', 'Płatki owsiane', 'Pomidory w puszce', 'Ryż', 'Sól'],
  home: ['Mydło', 'Papier toaletowy', 'Płyn do naczyń', 'Ręczniki papierowe', 'Tabletki do zmywarki', 'Worki na śmieci'],
};

function renderCatalog(customProducts) {
  const selected = catalog.value;
  const groups = Object.fromEntries(Object.entries(categories).map(([category, label]) => {
    const group = document.createElement('optgroup');
    group.label = label;
    return [category, group];
  }));
  const seen = new Set();
  const builtIns = Object.entries(commonProducts).flatMap(([category, names]) => names.map((name) => ({ name, category })));
  for (const { name, category } of [...builtIns, ...customProducts]) {
    const key = name.toLocaleLowerCase('pl');
    if (seen.has(key)) continue;
    seen.add(key);
    const option = new Option(name, name);
    option.dataset.category = category;
    groups[category].append(option);
  }
  catalog.replaceChildren(new Option('Wybierz z katalogu', ''), ...Object.values(groups).filter((group) => group.children.length));
  catalog.value = [...catalog.options].some((option) => option.value === selected) ? selected : '';
}

catalog.addEventListener('change', () => {
  const option = catalog.selectedOptions[0];
  if (!option.value) return;
  nameInput.value = option.value;
  get('category').value = option.dataset.category;
});
nameInput.addEventListener('input', () => {
  if (nameInput.value !== catalog.value) catalog.value = '';
});

let profile = null;
let items = [];
let suggestions = [];
let customProducts = [];
let revision = 0;
let busy = false;
let refreshing = false;
let historyRequest = 0;
const dateTime = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
const tabs = [get('list-tab'), get('products-tab')];

function showShoppingTab(chosen) {
  for (const tab of tabs) {
    const active = tab === chosen;
    tab.setAttribute('aria-selected', active);
    tab.tabIndex = active ? 0 : -1;
    get(tab.getAttribute('aria-controls')).hidden = !active;
  }
}

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    showShoppingTab(tab);
    refreshHistory();
  });
  tab.addEventListener('keydown', (event) => {
    const next = { Home: tabs[0], End: tabs[1], ArrowLeft: tabs[1 - tabs.indexOf(tab)], ArrowRight: tabs[1 - tabs.indexOf(tab)] }[event.key];
    if (!next) return;
    event.preventDefault();
    next.click();
    next.focus();
  });
}

async function request(action = null, query = '') {
  const response = await fetch('/api/zakupy' + query, action && {
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
  const text = { saved: 'Zsynchronizowano', saving: 'Zapisywanie…', offline: 'Brak połączenia', conflict: 'Lista zmieniła się' };
  target.lastChild.textContent = ' ' + text[status];
}

function useAvatar(element, id) {
  element.textContent = Array.from(profiles[id])[0].toLocaleUpperCase('pl');
  element.classList.toggle('ola', id === 'ola');
}

function showLogin(message = '', chooseProfile = false, profileNames = defaultProfileNames) {
  profile = null;
  profiles = profileNames;
  if (profileDialog.open) profileDialog.close();
  items = [];
  suggestions = [];
  customProducts = [];
  get('product-feedback').hidden = true;
  historyRequest += 1;
  history.open = false;
  get('history-content').replaceChildren();
  get('loading').hidden = true;
  get('account').hidden = true;
  get('shopping').hidden = true;
  get('todo').replaceChildren();
  get('done').replaceChildren();
  get('login').hidden = false;
  loginForm.hidden = chooseProfile;
  get('choose-profile').hidden = !chooseProfile;
  if (chooseProfile) {
    for (const button of get('profiles').querySelectorAll('[data-profile]')) {
      const id = button.dataset.profile;
      button.querySelector('.profile-name').textContent = profiles[id];
      useAvatar(button.querySelector('.avatar'), id);
    }
  }
  errorAt('profile-error');
  errorAt('login-error', message);
}

function showList(data) {
  const firstView = !profile;
  profile = data.profile;
  const names = data.profileNames ?? defaultProfileNames;
  const namesChanged = Object.keys(defaultProfileNames).some((id) => profiles[id] !== names[id]);
  profiles = names;
  if (firstView) showShoppingTab(tabs[0]);
  get('loading').hidden = true;
  get('login').hidden = true;
  get('account').hidden = false;
  get('shopping').hidden = false;
  get('account-name').textContent = profiles[profile];
  get('edit-profile').setAttribute('aria-label', profiles[profile] + ', zmień nazwę profilu');
  get('edit-profile').title = 'Zmień nazwę profilu';
  useAvatar(get('account-avatar'), profile);
  const listDate = get('list-date');
  listDate.hidden = !data.startedAt;
  listDate.textContent = data.startedAt ? 'Utworzona ' + dateTime.format(new Date(data.startedAt)) : '';
  const lastAdded = get('last-added');
  lastAdded.hidden = !data.lastAddedAt;
  lastAdded.textContent = data.lastAddedAt ? 'Ostatnio dodano ' + dateTime.format(new Date(data.lastAddedAt)) : '';
  const itemsChanged = firstView || JSON.stringify(items) !== JSON.stringify(data.items);
  if (itemsChanged) {
    items = data.items;
    renderRecipes();
  }
  if (itemsChanged || namesChanged) renderList();
  const nextSuggestions = data.suggestions ?? [];
  if (firstView || JSON.stringify(suggestions) !== JSON.stringify(nextSuggestions)) {
    suggestions = nextSuggestions;
    renderSuggestions();
  }
  const nextCatalog = data.catalog ?? [];
  if (firstView || JSON.stringify(customProducts) !== JSON.stringify(nextCatalog)) {
    customProducts = nextCatalog;
    renderCatalog(customProducts);
  }
}

function renderHistory(rounds) {
  const content = get('history-content');
  if (!rounds.length) {
    content.textContent = 'Historia pojawi się po odhaczeniu pierwszego produktu.';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const round of rounds) {
    const section = document.createElement('section');
    section.className = 'history-round';
    const heading = document.createElement('h3');
    heading.textContent = round.closedAt
      ? 'Lista zakończona ' + dateTime.format(new Date(round.closedAt))
      : 'Bieżąca lista';
    const created = document.createElement('p');
    created.textContent = round.startedAt
      ? 'Utworzona ' + dateTime.format(new Date(round.startedAt))
      : 'Data utworzenia niedostępna';
    section.append(heading, created);
    if (round.bought.length) {
      const list = document.createElement('ul');
      for (const { name, quantity, checkedAt, profile: buyer } of round.bought) {
        const item = document.createElement('li');
        item.textContent = quantity ? name + ' · ' + quantity : name;
        const timestamp = document.createElement('time');
        if (checkedAt) {
          timestamp.dateTime = checkedAt;
          timestamp.textContent = ' · ' + profiles[buyer] + ', ' + dateTime.format(new Date(checkedAt));
        } else {
          timestamp.textContent = ' · data zakupu niedostępna';
        }
        item.append(timestamp);
        list.append(item);
      }
      section.append(list);
    } else {
      const empty = document.createElement('p');
      empty.textContent = 'Brak odhaczonych zakupów.';
      section.append(empty);
    }
    fragment.append(section);
  }
  content.replaceChildren(fragment);
}

async function refreshHistory() {
  if (!history.open || !profile || get('list-panel').hidden) return;
  const version = ++historyRequest;
  const content = get('history-content');
  if (!content.textContent) content.textContent = 'Otwieram historię…';
  try {
    const { rounds } = await request(null, '?history=1');
    if (history.open && version === historyRequest && rounds) renderHistory(rounds);
  } catch {
    if (history.open && version === historyRequest) content.textContent = 'Nie udało się otworzyć historii. Spróbuj ponownie.';
  }
}

history.addEventListener('toggle', refreshHistory);

function renderRecipes() {
  const panel = get('recipe-suggestions');
  const list = get('recipe-links');
  const recipes = suggestRecipes(items);
  list.replaceChildren();
  for (const { name, url, matched } of recipes) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = name;
    const ingredients = document.createElement('span');
    ingredients.textContent = 'Na liście: ' + matched.join(', ');
    item.append(link, ingredients);
    list.append(item);
  }
  panel.hidden = recipes.length === 0;
}

function renderSuggestions() {
  const list = get('frequent-products');
  const hadFocus = list.contains(document.activeElement);
  list.replaceChildren();
  for (const { name, category } of suggestions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-button';
    button.textContent = '+ ' + name;
    button.setAttribute('aria-label', 'Dodaj: ' + name);
    button.addEventListener('click', () => {
      change({ action: 'add', id: crypto.randomUUID(), name, category, quantity: '', suggested: true }, 'Produkt dodany.');
    });
    list.append(button);
  }
  get('frequent').hidden = suggestions.length === 0;
  if (hadFocus) get('products-tab').focus({ preventScroll: true });
}

function renderItem(item) {
  const entry = get('item-template').content.firstElementChild.cloneNode(true);
  entry.dataset.id = item.id;
  entry.classList.toggle('is-done', item.done);
  entry.querySelector('.item-name').textContent = item.name;
  const quantity = entry.querySelector('.item-quantity');
  quantity.textContent = item.quantity;
  quantity.hidden = !item.quantity;
  const added = entry.querySelector('.item-added');
  if (item.addedAt) {
    added.dateTime = item.addedAt;
    added.textContent = 'Dodano ' + dateTime.format(new Date(item.addedAt));
    added.hidden = false;
  }
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
    const category = document.createElement('section');
    category.className = 'category';
    const heading = document.createElement('h3');
    heading.textContent = label;
    const list = document.createElement('ul');
    list.className = 'items';
    list.append(...group.map(renderItem));
    category.append(heading, list);
    todo.append(category);
  }

  if (!pending.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = items.length ? 'Wszystko kupione.' : 'Dodaj pierwszy produkt w zakładce Produkty.';
    todo.append(empty);
  }

  get('done').replaceChildren(...completed.map(renderItem));
  get('done-section').hidden = !completed.length;
  get('list-actions').hidden = !items.length;
  get('todo-count').textContent = pending.length;
  get('done-count').textContent = completed.length;
  get('list-progress').hidden = !items.length;
  get('progress-copy').textContent = completed.length + ' z ' + items.length + ' kupionych';
  get('progress').max = items.length || 1;
  get('progress').value = completed.length;

  if (focusedRow) {
    const sameRow = [...document.querySelectorAll('.item')].find((row) => row.dataset.id === focusedRow.dataset.id);
    (sameRow?.querySelector(focusedClass) ?? get('products-tab')).focus({ preventScroll: true });
  }
}

async function refresh() {
  if (busy || refreshing || document.hidden) return;
  refreshing = true;
  const version = revision;
  try {
    const data = await request();
    if (version !== revision) return;
    if (data.profile) {
      showList(data);
      setSync('saved');
      refreshHistory();
    } else {
      showLogin('', true, data.profileNames);
    }
  } catch (error) {
    if (version !== revision) return;
    if (error.status === 401) showLogin();
    else if (profile) setSync('offline');
    else showLogin(error.message || 'Nie udało się otworzyć listy.');
  } finally {
    refreshing = false;
  }
}

async function change(action, announcement, errorId = 'list-error') {
  if (busy) return false;
  busy = true;
  revision += 1;
  get('add').disabled = true;
  get('save-product').disabled = true;
  get('shopping').setAttribute('aria-busy', 'true');
  setSync('saving');
  errorAt(errorId);
  try {
    const data = await request(action);
    showList(data);
    setSync('saved');
    refreshHistory();
    get('announcement').textContent = announcement;
    return true;
  } catch (error) {
    if (error.status === 401) showLogin('Sesja wygasła. Zaloguj się ponownie.');
    else errorAt(errorId, error.message || 'Nie udało się zapisać zmiany.');
    setSync(error.status === 409 ? 'conflict' : 'offline');
    return false;
  } finally {
    busy = false;
    get('add').disabled = false;
    get('save-product').disabled = false;
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
    const account = await request({ action: 'login', password: data.get('password') });
    password.value = '';
    password.type = 'password';
    showPassword.textContent = 'Pokaż';
    showPassword.setAttribute('aria-pressed', 'false');
    showLogin('', true, account.profileNames);
    get('profile-title').focus();
  } catch (error) {
    errorAt('login-error', error.message || 'Nie udało się zalogować.');
  } finally {
    busy = false;
    get('sign-in').disabled = false;
  }
});

get('profiles').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-profile]');
  if (!button || busy) return;
  busy = true;
  revision += 1;
  button.disabled = true;
  errorAt('profile-error');
  try {
    showList(await request({ action: 'select-profile', profile: button.dataset.profile }));
    setSync('saved');
    get('shopping-title').focus();
  } catch (error) {
    if (error.status === 401) showLogin('Sesja wygasła. Zaloguj się ponownie.');
    else errorAt('profile-error', error.message || 'Nie udało się otworzyć listy.');
  } finally {
    busy = false;
    button.disabled = false;
  }
});

async function logout() {
  if (busy) return;
  busy = true;
  revision += 1;
  try {
    await request({ action: 'logout' });
    addForm.reset();
    showLogin();
    get('login-title').focus();
  } catch (error) {
    errorAt(profile ? 'list-error' : 'profile-error', error.message || 'Nie udało się wylogować.');
  } finally {
    busy = false;
  }
}
get('logout').addEventListener('click', logout);
get('profile-logout').addEventListener('click', logout);

get('edit-profile').addEventListener('click', () => {
  if (!profile || busy) return;
  profileNameInput.value = profiles[profile];
  errorAt('rename-error');
  profileDialog.showModal();
  profileNameInput.select();
});

get('cancel-rename').addEventListener('click', () => profileDialog.close());

get('edit-profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const name = profileNameInput.value.trim();
  if (!name) {
    errorAt('rename-error', 'Wpisz nazwę profilu.');
    profileNameInput.focus();
    return;
  }
  const save = get('save-name');
  save.disabled = true;
  try {
    if (await change({ action: 'rename-profile', name }, 'Zapisano nazwę profilu.', 'rename-error')) {
      profileDialog.close();
    }
  } finally {
    save.disabled = false;
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
  const saving = event.submitter?.id === 'save-product';
  const feedback = get('product-feedback');
  feedback.hidden = true;
  if (saving && [...catalog.options].some((option) => option.value.toLocaleLowerCase('pl') === name.toLocaleLowerCase('pl'))) {
    feedback.textContent = 'Ten produkt jest już w katalogu.';
    feedback.hidden = false;
    return;
  }
  const action = {
    action: saving ? 'save-product' : 'add', id: crypto.randomUUID(), name,
    quantity: data.get('quantity'), category: data.get('category'),
  };
  const message = saving ? 'Zapisano w katalogu: ' + name : 'Dodano do listy: ' + name;
  if (await change(action, message)) {
    feedback.textContent = message;
    feedback.hidden = false;
    if (nameInput.value === data.get('name')) {
      nameInput.value = '';
      catalog.value = '';
    }
    if (!saving && get('quantity').value === action.quantity) get('quantity').value = '';
    get('item-name').focus();
  }
});

get('clear').addEventListener('click', () => {
  const ids = items.filter((item) => item.done).map((item) => item.id);
  if (confirm('Usunąć kupione produkty z listy?')) change({ action: 'clear', ids }, 'Usunięto kupione produkty.');
});

get('clear-all').addEventListener('click', async () => {
  const ids = items.map((item) => item.id);
  if (await change({ action: 'clear-all', ids }, 'Lista wyczyszczona.')) {
    get('products-tab').focus({ preventScroll: true });
  }
});

document.addEventListener('visibilitychange', () => { if (profile) refresh(); });
window.addEventListener('online', () => { if (profile) refresh(); });
setInterval(() => { if (profile) refresh(); }, 12000);
refresh();

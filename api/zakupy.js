import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { BlobError, BlobPreconditionFailedError, get, put } from '@vercel/blob';

const profiles = new Set(['michal', 'ola']);
const awaitingProfile = 'household';
const categories = new Set(['produce', 'dairy', 'bakery', 'pantry', 'home', 'other']);
const pathname = 'zakupy/lista-v1.json';
const sessionMaxAge = 30 * 24 * 60 * 60;
const cookieName = 'zakupy_session';
const itemIdPattern = /^[a-f0-9-]{36}$/i;
const digest = (text) => createHash('sha256').update(text).digest();
const sign = (text, passwordHash) => createHmac('sha256', process.env.SESSION_SECRET)
  .update(passwordHash).update(text).digest('base64url');

function sessionProfile(request, passwordHash) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)zakupy_session=([^;]+)/)?.[1] ?? '';
  const [profile, expiry, signature] = token.split('.');
  if ((!profiles.has(profile) && profile !== awaitingProfile) || !/^\d+$/.test(expiry) ||
      Number(expiry) <= Date.now() || !signature) return null;
  const expected = Buffer.from(sign(profile + '.' + expiry, passwordHash));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received) ? profile : null;
}

function sessionCookie(profile, passwordHash) {
  const maxAge = profile ? sessionMaxAge : 0;
  const payload = profile + '.' + (Date.now() + maxAge * 1000);
  const value = profile ? payload + '.' + sign(payload, passwordHash) : '';
  const secure = process.env.VERCEL ? '; Secure' : '';
  return cookieName + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge + secure;
}

function reply(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });
}

function reject(message, status) {
  return reply({ error: message }, status);
}

async function readList() {
  const result = await get(pathname, { access: 'private', useCache: false });
  const saved = result ? await new Response(result.stream).json() : [];
  const data = Array.isArray(saved) ? { items: saved, purchases: {} } : saved;
  const currentRound = data.currentRound ?? (data.items.length ? {
    startedAt: null,
    bought: data.items.filter((item) => item.done).map(({ id, name, quantity }) => ({
      id, name, quantity, checkedAt: null, profile: null,
    })),
  } : null);
  const state = { ...data, currentRound, pastRounds: data.pastRounds ?? [], catalog: data.catalog ?? [] };
  return { state, etag: result?.blob.etag ?? null };
}

async function updateList(change) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { state, etag } = await readList();
    const next = change(state);
    if (next === state) return state;

    try {
      await put(pathname, JSON.stringify(next), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        ...(etag ? { ifMatch: etag, allowOverwrite: true } : { allowOverwrite: false }),
      });
      return next;
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError || (!etag && error instanceof BlobError && /already exists/i.test(error.message)))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
  throw new Error('Concurrent changes prevented the update');
}

function productKey(name) {
  return name.trim().replace(/\s+/g, ' ').normalize('NFC').toLocaleLowerCase('pl');
}

function setPurchased(state, id, done, profile) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item || item.done === done) return state;

  const purchases = Object.assign(Object.create(null), state.purchases);
  const key = productKey(item.name);
  if (done) {
    purchases[key] = { name: item.name, category: item.category, count: (purchases[key]?.count ?? 0) + 1 };
  } else if (item.purchaseRecorded && purchases[key]) {
    const count = purchases[key].count - 1;
    if (count === 0) delete purchases[key];
    else purchases[key] = { ...purchases[key], count };
  }

  const items = state.items.map((entry) => entry.id === id ? { ...entry, done, purchaseRecorded: done } : entry);
  const { currentRound } = state;
  const bought = done
    ? [...currentRound.bought, { id, name: item.name, quantity: item.quantity, checkedAt: new Date().toISOString(), profile }]
    : currentRound.bought.filter((entry) => entry.id !== id);
  return { ...state, items, purchases, currentRound: { ...currentRound, bought } };
}

function applyListChange(state, change) {
  const items = change(state.items);
  if (items === state.items) return state;
  const { currentRound, pastRounds } = state;
  if (items.length && !state.items.length) {
    return { ...state, items, currentRound: { startedAt: new Date().toISOString(), bought: [] } };
  }
  if (!items.length && currentRound) {
    const round = { ...currentRound, closedAt: new Date().toISOString() };
    return { ...state, items, currentRound: null, pastRounds: [...pastRounds, round] };
  }
  return { ...state, items };
}

function listData(profile, state) {
  const pending = new Set(state.items.filter((item) => !item.done).map((item) => productKey(item.name)));
  const suggestions = Object.entries(state.purchases)
    .filter(([key, product]) => product.count >= 2 && !pending.has(key))
    .sort(([, a], [, b]) => b.count - a.count || a.name.localeCompare(b.name, 'pl'))
    .slice(0, 6)
    .map(([, { name, category }]) => ({ name, category }));
  return {
    profile, items: state.items, suggestions,
    startedAt: state.currentRound?.startedAt ?? null, catalog: state.catalog,
  };
}

function productDetails(input) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 100 || !categories.has(input.category)) return null;
  return { name, category: input.category };
}

function itemChange(input, profile) {
  const { action, id } = input;
  if (action === 'clear' || action === 'clear-all') {
    if (!Array.isArray(input.ids) || input.ids.length > 300) return null;
    const selected = new Set(input.ids);
    return (items) => {
      const remaining = items.filter((item) => !selected.has(item.id) || (action === 'clear' && !item.done));
      return remaining.length === items.length ? items : remaining;
    };
  }

  if (typeof id !== 'string' || !itemIdPattern.test(id)) return null;
  if (action === 'remove') return (items) => items.filter((item) => item.id !== id);
  if (action !== 'add') return null;

  const product = productDetails(input);
  const quantity = typeof input.quantity === 'string' ? input.quantity.trim() : '';
  if (!product || quantity.length > 32) return null;

  const item = { id, ...product, quantity, profile, done: false };
  return (items) => {
    if (items.some((existing) => existing.id === id)) return items;
    if (input.suggested === true && items.some((existing) => !existing.done && productKey(existing.name) === productKey(item.name))) return items;
    if (items.length >= 300) throw new RangeError('Lista ma już 300 pozycji. Usuń kilka produktów i spróbuj ponownie.');
    return [...items, item];
  };
}

export default {
  async fetch(request) {
    const password = process.env.app_password;
    if (!password || (process.env.SESSION_SECRET?.length ?? 0) < 32) {
      return reject('Logowanie nie jest jeszcze skonfigurowane.', 503);
    }

    const passwordHash = digest(password);
    const profile = sessionProfile(request, passwordHash);
    try {
      if (request.method === 'GET') {
        if (!profile) return reject('Zaloguj się, aby otworzyć listę.', 401);
        if (profile === awaitingProfile) return reply({ profile: null });
        const { state } = await readList();
        if (new URL(request.url).searchParams.has('history')) {
          const rounds = state.pastRounds.slice().reverse();
          if (state.currentRound?.bought.length) rounds.unshift(state.currentRound);
          return reply({ rounds });
        }
        return reply(listData(profile, state));
      }
      if (request.method !== 'POST') return reject('Ta metoda jest niedostępna.', 405);
      const host = request.headers.get('host') ?? new URL(request.url).host;
      const origin = request.headers.get('origin');
      if (!origin || new URL(origin).host !== host || request.headers.get('sec-fetch-site') === 'cross-site') {
        return reject('Żądanie musi pochodzić z aplikacji.', 403);
      }

      if (!request.headers.get('content-type')?.startsWith('application/json')) {
        return reject('Nieprawidłowy format żądania.', 400);
      }
      const body = await request.text();
      if (body.length > 16000) return reject('Żądanie jest za duże.', 413);
      let input;
      try {
        input = JSON.parse(body);
      } catch {
        return reject('Nieprawidłowy format żądania.', 400);
      }
      if (!input || typeof input !== 'object') return reject('Nieprawidłowy format żądania.', 400);

      if (input.action === 'login') {
        const valid = typeof input.password === 'string' &&
          timingSafeEqual(digest(input.password), passwordHash);
        if (!valid) return reject('Nieprawidłowe hasło.', 401);
        return reply({ profile: null }, 200, { 'Set-Cookie': sessionCookie(awaitingProfile, passwordHash) });
      }
      if (input.action === 'logout') return reply({}, 200, { 'Set-Cookie': sessionCookie(null) });
      if (!profile) return reject('Zaloguj się ponownie.', 401);
      if (input.action === 'select-profile') {
        if (!profiles.has(input.profile)) return reject('Wybierz Michała lub Olę.', 400);
        const { state } = await readList();
        return reply(listData(input.profile, state), 200, {
          'Set-Cookie': sessionCookie(input.profile, passwordHash),
        });
      }
      if (profile === awaitingProfile) return reject('Wybierz profil, aby otworzyć listę.', 403);

      if (input.action === 'save-product') {
        const product = productDetails(input);
        if (!product) return reject('Sprawdź nazwę i kategorię produktu.', 400);
        const key = productKey(product.name);
        const state = await updateList((current) => {
          if (current.catalog.some((entry) => productKey(entry.name) === key)) return current;
          return { ...current, catalog: [...current.catalog, product] };
        });
        return reply(listData(profile, state));
      }

      if (input.action === 'check') {
        if (typeof input.id !== 'string' || !itemIdPattern.test(input.id) || typeof input.done !== 'boolean') {
          return reject('Sprawdź dane produktu i spróbuj ponownie.', 400);
        }
        const state = await updateList((current) => setPurchased(current, input.id, input.done, profile));
        return reply(listData(profile, state));
      }
      const change = itemChange(input, profile);
      if (!change) return reject('Sprawdź dane produktu i spróbuj ponownie.', 400);
      const state = await updateList((current) => applyListChange(current, change));
      return reply(listData(profile, state));
    } catch (error) {
      if (error instanceof RangeError) return reject(error.message, 400);
      console.error('Shopping list request failed', error.name);
      return reject('Nie udało się połączyć z listą. Spróbuj ponownie.', 503);
    }
  },
};

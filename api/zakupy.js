import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { BlobError, BlobPreconditionFailedError, get, put } from '@vercel/blob';

const profiles = new Set(['michal', 'ola']);
const categories = new Set(['produce', 'dairy', 'bakery', 'pantry', 'home', 'other']);
const pathname = 'zakupy/lista-v1.json';
const sessionMaxAge = 30 * 24 * 60 * 60;
const cookieName = 'zakupy_session';
const digest = (text) => createHash('sha256').update(text).digest();
const sign = (text, passwordHash) => createHmac('sha256', process.env.SESSION_SECRET)
  .update(passwordHash).update(text).digest('base64url');

function sessionProfile(request, passwordHash) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)zakupy_session=([^;]+)/)?.[1] ?? '';
  const [profile, expiry, signature] = token.split('.');
  if (!profiles.has(profile) || !/^\d+$/.test(expiry) || Number(expiry) <= Date.now() || !signature) return null;
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
  if (!result) return { items: [], etag: null };
  return { items: await new Response(result.stream).json(), etag: result.blob.etag };
}

async function updateList(change) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { items, etag } = await readList();
    const next = change(items);
    if (next === items) return items;

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

function itemChange(input, profile) {
  const { action, id } = input;
  if (action === 'clear') {
    if (!Array.isArray(input.ids) || input.ids.length > 300) return null;
    const completed = new Set(input.ids);
    return (items) => items.filter((item) => !item.done || !completed.has(item.id));
  }

  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) return null;
  if (action === 'remove') return (items) => items.filter((item) => item.id !== id);
  if (action === 'check' && typeof input.done === 'boolean') {
    return (items) => items.map((item) => item.id === id ? { ...item, done: input.done } : item);
  }
  if (action !== 'add') return null;

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const quantity = typeof input.quantity === 'string' ? input.quantity.trim() : '';
  const category = input.category;
  if (!name || name.length > 100 || quantity.length > 32 || !categories.has(category)) return null;

  const item = { id, name, quantity, category, profile, done: false };
  return (items) => {
    if (items.some((existing) => existing.id === id)) return items;
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
        return reply({ profile, items: (await readList()).items });
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
        if (!valid || !profiles.has(input.profile)) return reject('Nieprawidłowe hasło.', 401);
        const { items } = await readList();
        return reply({ profile: input.profile, items }, 200, { 'Set-Cookie': sessionCookie(input.profile, passwordHash) });
      }
      if (input.action === 'logout') return reply({}, 200, { 'Set-Cookie': sessionCookie(null) });
      if (!profile) return reject('Zaloguj się ponownie.', 401);

      const change = itemChange(input, profile);
      if (!change) return reject('Sprawdź dane produktu i spróbuj ponownie.', 400);
      return reply({ profile, items: await updateList(change) });
    } catch (error) {
      if (error instanceof RangeError) return reject(error.message, 400);
      console.error('Shopping list request failed', error.name);
      return reject('Nie udało się połączyć z listą. Spróbuj ponownie.', 503);
    }
  },
};

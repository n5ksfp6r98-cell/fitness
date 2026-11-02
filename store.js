// Lokale Datenhaltung (zuerst auf dem Gerät) + Abgleich mit Supabase-Tabelle "records".
// Ein Datensatz: { id, kind, day, data, updated_at, deleted }.
// kinds V1: session, set, week, supp_day, settings, supplements
// kinds V2 (Ernährung, noch nicht gebaut): meal_plan, shopping_list, food_log, body_weight

const KEY = 'fit.v1';
let db = load();
let client = null;
let userId = null;
let syncing = false;
let timer = null;
const listeners = new Set();
export const status = { error: null, syncing: false };

function blank() { return { owner: null, records: {}, dirty: {}, lastPull: null, lastSync: null }; }
function load() {
  try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch { return blank(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { status.error = 'Speicher voll: ' + e.message; }
}
function emit() { listeners.forEach(f => f()); }
export function onChange(f) { listeners.add(f); }

export const uuid = () => crypto.randomUUID();
export const owner = () => db.owner;
export function setOwner(id) {
  if (db.owner && db.owner !== id) db = blank();
  db.owner = id;
  save();
}
export function setClient(c, u) { client = c; userId = u; }
export function clearClient() { client = null; userId = null; }

export function get(id) { const r = db.records[id]; return r && !r.deleted ? r : null; }
export function all(kind) { return Object.values(db.records).filter(r => r.kind === kind && !r.deleted); }

export function put(id, kind, day, data) {
  const rec = { id, kind, day: day || null, data, updated_at: new Date().toISOString(), deleted: false };
  db.records[id] = rec;
  db.dirty[id] = 1;
  save(); emit(); schedule();
  return rec;
}
export function patch(id, part) {
  const r = db.records[id];
  return put(id, r.kind, r.day, { ...r.data, ...part });
}
export function remove(id) {
  const r = db.records[id];
  if (!r) return;
  db.records[id] = { ...r, deleted: true, updated_at: new Date().toISOString() };
  db.dirty[id] = 1;
  save(); emit(); schedule();
}

export const pending = () => Object.keys(db.dirty).length;
export const lastSync = () => db.lastSync;

export function schedule(ms = 800) {
  clearTimeout(timer);
  timer = setTimeout(sync, ms);
}

const t = s => Date.parse(s);

export async function sync() {
  if (!client || !userId || syncing || !navigator.onLine) return;
  syncing = true; status.syncing = true; emit();
  try {
    // 1) Lokale Änderungen hochladen
    const ids = Object.keys(db.dirty);
    for (let i = 0; i < ids.length; i += 200) {
      const rows = ids.slice(i, i + 200).filter(id => db.records[id]).map(id => {
        const r = db.records[id];
        return { user_id: userId, id: r.id, kind: r.kind, day: r.day, data: r.data, updated_at: r.updated_at, deleted: r.deleted };
      });
      const { error } = await client.from('records').upsert(rows, { onConflict: 'user_id,id' });
      if (error) throw error;
      for (const row of rows) if (db.records[row.id]?.updated_at === row.updated_at) delete db.dirty[row.id];
      save();
    }
    // 2) Änderungen anderer Geräte holen
    for (;;) {
      let q = client.from('records').select('id,kind,day,data,updated_at,deleted,server_at').order('server_at', { ascending: true }).limit(1000);
      if (db.lastPull) q = q.gt('server_at', db.lastPull);
      const { data, error } = await q;
      if (error) throw error;
      for (const row of data) {
        const loc = db.records[row.id];
        const upd = new Date(row.updated_at).toISOString();
        if (!loc || !db.dirty[row.id] || t(upd) > t(loc.updated_at)) {
          db.records[row.id] = { id: row.id, kind: row.kind, day: row.day, data: row.data, updated_at: upd, deleted: row.deleted };
          delete db.dirty[row.id];
        }
        db.lastPull = row.server_at;
      }
      save();
      if (data.length < 1000) break;
    }
    db.lastSync = new Date().toISOString();
    status.error = null;
    save();
  } catch (e) {
    status.error = e.message || String(e);
  } finally {
    syncing = false; status.syncing = false; emit();
    if (Object.keys(db.dirty).length && !status.error) schedule(2000);
  }
}

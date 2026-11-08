// Sicherung aller Trainingsdaten aus Supabase als Excel-Tabelle (Training.xlsx) + Rohdaten (JSON).
// Aufruf automatisch: node tools/backup.mjs <Zielordner>
//   Zugangsdaten nur im macOS-Schlüsselbund (nie in Dateien):
//   Dienst "fitness-supabase-url" und "fitness-supabase-backup-key"
// Aufruf von Hand: node tools/backup.mjs <Zielordner> --from <records.json>
//   (records.json = alle Zeilen der Tabelle records, z. B. über die angemeldete App geholt)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { UNITS } from '../plan.js';
import { xlsx } from './xlsx.mjs';

const out = path.resolve(process.argv[2] || 'Backup');
const fromFile = process.argv[3] === '--from' ? process.argv[4] : null;
const secret = s => execFileSync('security', ['find-generic-password', '-s', s, '-w'], { encoding: 'utf8' }).trim();

async function all() {
  if (fromFile) return JSON.parse(fs.readFileSync(fromFile, 'utf8'));
  const url = secret('fitness-supabase-url');
  const key = secret('fitness-supabase-backup-key');
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${url}/rest/v1/records?select=*&order=server_at.asc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` },
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
    const page = await r.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const SHIFT = { frueh: 'Früh', spaet: 'Spät' };
const STATUS = { fertig: 'erledigt', aktiv: 'offen', uebersprungen: 'übersprungen' };
const wd = d => DAYS[new Date(d + 'T12:00:00').getDay()];
const num = v => (v === '' || v == null ? '' : Number(v));
// Erst in Temp-Datei schreiben, dann umbenennen: iCloud sieht nie eine halbe Datei
const write = (name, data) => { const f = path.join(out, name); fs.writeFileSync(f + '.tmp', data); fs.renameSync(f + '.tmp', f); };

const rows = await all();
const live = rows.filter(r => !r.deleted);
const sessions = live.filter(r => r.kind === 'session').sort((a, b) => (a.day + (a.data.startedAt || '')).localeCompare(b.day + (b.data.startedAt || '')));
const sets = live.filter(r => r.kind === 'set');

const training = [['Datum', 'Tag', 'Schicht', 'Einheit', 'Status', 'Übung', 'Satz', 'Gewicht kg', 'Wdh./Sek.', 'Notfall', 'Gefühl']];
for (const s of sessions) {
  const unit = UNITS[s.data.type];
  const status = unit?.kind === 'kampf' && s.data.status === 'uebersprungen' ? 'weggelassen' : STATUS[s.data.status] || s.data.status;
  const base = [s.day, wd(s.day), SHIFT[s.data.shift] || '', unit?.name || s.data.type, status];
  // Reihenfolge wie im Plan: Übung für Übung, darin Satz 1, 2, 3 …
  const pos = n => { const i = unit?.ex?.findIndex(e => e.n === n) ?? -1; return i < 0 ? 99 : i; };
  const own = sets.filter(x => x.data.session === s.id).sort((a, b) => pos(a.data.ex) - pos(b.data.ex) || a.data.no - b.data.no);
  const tail = [s.data.notfall ? 'ja' : 'nein', s.data.feel || ''];
  if (own.length) for (const x of own) training.push([...base, x.data.ex, x.data.no, num(x.data.w), num(x.data.r), ...tail]);
  else training.push([...base, '', '', '', '', ...tail]);
}

const items = live.find(r => r.kind === 'supplements')?.data.items || [];
const supp = [['Datum', 'Tag', ...items.map(i => i.name + (i.off ? ' (abgesetzt)' : ''))]];
for (const d of live.filter(r => r.kind === 'supp_day').sort((a, b) => a.day.localeCompare(b.day)))
  supp.push([d.day, wd(d.day), ...items.map(i => (d.data.checked?.[i.id] ? 'ja' : ''))]);

fs.mkdirSync(path.join(out, 'Verlauf'), { recursive: true });
write('Training.xlsx', xlsx([
  { name: 'Training', rows: training, widths: [12, 5, 8, 26, 13, 26, 6, 11, 10, 8, 8] },
  { name: 'Supplemente', rows: supp, widths: [12, 5, ...items.map(i => Math.max(10, i.name.length + 2))] },
]));
write('Rohdaten.json', JSON.stringify(rows, null, 1));
// Zusätzlich eine Rohdaten-Kopie pro Tag (falls etwas versehentlich gelöscht wird); die letzten 60 bleiben
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(out, 'Verlauf', `Rohdaten_${today}.json`), JSON.stringify(rows));
const old = fs.readdirSync(path.join(out, 'Verlauf')).filter(f => f.startsWith('Rohdaten_')).sort().slice(0, -60);
old.forEach(f => fs.unlinkSync(path.join(out, 'Verlauf', f)));
write('Letzte Sicherung.txt', `Letzte Sicherung: ${new Date().toLocaleString('de-DE')}\nEinheiten: ${sessions.length}, Sätze: ${sets.length}\n`);
console.log(`ok ${new Date().toISOString()} einheiten=${sessions.length} saetze=${sets.length}`);

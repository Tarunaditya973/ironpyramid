import { normalizeMuscles } from './muscles.js';

export function splitCsvLine(line) {
  // Minimal CSV: supports double-quoted fields with commas inside.
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function defaultIncrementKg(name) {
  const n = name.toLowerCase();
  if (/(barbell|bench|squat|deadlift|row|press|thrust)/.test(n) && !/dumbbell|db /.test(n)) {
    return 2.5;
  }
  return 1;
}

export function parseCsvToPlan(csv) {
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows = lines.slice(1).map(splitCsvLine);
  const days = [];
  const byId = new Map();
  for (const r of rows) {
    const [dayLabel, focus, order, name, setType, scheme, primaryRaw, secondaryRaw, , demoUrl, , , , , , , , , notes] = r;
    const dayId = slugify(dayLabel);
    if (!byId.has(dayId)) {
      const day = { dayId, focus, exercises: [] };
      byId.set(dayId, day);
      days.push(day);
    }
    byId.get(dayId).exercises.push({
      exId: slugify(name),
      name,
      order: Number(order) || byId.get(dayId).exercises.length + 1,
      setType,
      scheme,
      primary: normalizeMuscles(primaryRaw),
      secondary: normalizeMuscles(secondaryRaw),
      increment: defaultIncrementKg(name),
      demoUrl,
      notes: notes || '',
    });
  }
  return days;
}

export function serializeBackup(state) {
  return JSON.stringify(state, null, 2);
}

export function parseBackup(json) {
  return JSON.parse(json);
}

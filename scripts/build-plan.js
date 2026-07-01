import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseCsvToPlan } from '../src/csv.js';

const csv = readFileSync(new URL('../seed/gym_workout_tracker.csv', import.meta.url), 'utf8');
const plan = parseCsvToPlan(csv);
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/plan.json', import.meta.url), JSON.stringify(plan, null, 2));
console.log(`Wrote data/plan.json: ${plan.length} days, ${plan.reduce((n, d) => n + d.exercises.length, 0)} exercises`);

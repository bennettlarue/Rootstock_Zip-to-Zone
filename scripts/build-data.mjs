// Builds src/data/zip-zones.json from data/zip_zone.csv and data/geo-data.csv:
//   { "states": { "CA": "California", ... }, "zips": { "90210": ["10b", "CA"], ... } }
// Each zip entry is [zone, stateAbbr | null].
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const zoneInput = new URL('../data/zip_zone.csv', import.meta.url);
const geoInput = new URL('../data/geo-data.csv', import.meta.url);
const output = new URL('../src/data/zip-zones.json', import.meta.url);

// Minimal CSV parser (handles quoted fields) returning an array of row objects keyed by header.
function parseCsv(path, expectedHeader) {
	const lines = readFileSync(path, 'utf8')
		.replace(/^﻿/, '')
		.split(/\r?\n/)
		.filter((line) => line.trim() !== '');
	if (lines[0].trim() !== expectedHeader) {
		throw new Error(`Unexpected CSV header in ${path.pathname}: "${lines[0]}"`);
	}
	const headers = lines[0].split(',');
	return lines.slice(1).map((line, i) => {
		const fields = [];
		let field = '';
		let quoted = false;
		for (let j = 0; j < line.length; j++) {
			const c = line[j];
			if (quoted) {
				if (c === '"' && line[j + 1] === '"') (field += '"'), j++;
				else if (c === '"') quoted = false;
				else field += c;
			} else if (c === '"') quoted = true;
			else if (c === ',') (fields.push(field.trim()), (field = ''));
			else field += c;
		}
		fields.push(field.trim());
		if (fields.length !== headers.length) throw new Error(`${path.pathname} row ${i + 2}: expected ${headers.length} columns, got ${fields.length}`);
		return { ...Object.fromEntries(headers.map((h, k) => [h, fields[k]])), row: i + 2 };
	});
}

// --- State data from geo-data.csv ---
const stateByZip = new Map();
const states = {};
const conflicts = [];
for (const { state, state_abbr, zipcode, row } of parseCsv(geoInput, 'state_fips,state,state_abbr,zipcode,county,city')) {
	if (!/^[A-Z]{2}$/.test(state_abbr)) throw new Error(`geo-data row ${row}: invalid state_abbr "${state_abbr}"`);
	if (states[state_abbr] && states[state_abbr] !== state) throw new Error(`geo-data row ${row}: inconsistent name for ${state_abbr}`);
	states[state_abbr] = state;
	// geo-data also has non-numeric placeholder zips (e.g. "860HH"); we only care about real ones.
	if (!/^\d{5}$/.test(zipcode)) continue;
	const existing = stateByZip.get(zipcode);
	if (existing === undefined) stateByZip.set(zipcode, state_abbr);
	else if (existing !== state_abbr) conflicts.push(`${zipcode}: ${existing} (kept) vs ${state_abbr}`); // border zip: first row wins
}

// Sorted real zips from geo-data, used to infer states for zips it doesn't list.
const knownZips = [...stateByZip.keys()].sort();

// Nearest known zips on each side; if both exist and agree, that's the state. Otherwise null.
function inferState(zip) {
	let lo = 0;
	let hi = knownZips.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (knownZips[mid] < zip) lo = mid + 1;
		else hi = mid;
	}
	const before = knownZips[lo - 1];
	const after = knownZips[lo];
	if (before === undefined || after === undefined) return null;
	const a = stateByZip.get(before);
	return a === stateByZip.get(after) ? a : null;
}

// --- Zone data from zip_zone.csv ---
const zips = {};
let exact = 0;
let inferred = 0;
let unknown = 0;
for (const { zip, zone, row } of parseCsv(zoneInput, 'zip,zone')) {
	if (!/^\d{5}$/.test(zip)) throw new Error(`zip_zone row ${row}: invalid zip "${zip}"`);
	if (!/^(?:[1-9]|1[0-3])[ab]$/.test(zone)) throw new Error(`zip_zone row ${row}: invalid zone "${zone}"`);
	if (zip in zips) throw new Error(`zip_zone row ${row}: duplicate zip "${zip}"`);

	const known = stateByZip.get(zip);
	if (known) {
		zips[zip] = [zone, known];
		exact++;
	} else {
		const guess = inferState(zip);
		zips[zip] = [zone, guess];
		guess ? inferred++ : unknown++;
	}
}

mkdirSync(dirname(output.pathname), { recursive: true });
writeFileSync(output, JSON.stringify({ states, zips }));

console.log(`Wrote ${Object.keys(zips).length} zips to src/data/zip-zones.json`);
console.log(`  state from geo-data: ${exact}, inferred from neighbors: ${inferred}, unknown (null): ${unknown}`);
console.log(`  border zips listed under multiple states (first row kept): ${conflicts.length}`);
for (const c of conflicts) console.log(`    ${c}`);

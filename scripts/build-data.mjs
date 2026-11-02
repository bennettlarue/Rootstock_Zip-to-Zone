// Converts data/zip_zone.csv into src/data/zip-zones.json ({ "90210": "10b", ... }).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const input = new URL('../data/zip_zone.csv', import.meta.url);
const output = new URL('../src/data/zip-zones.json', import.meta.url);

const lines = readFileSync(input, 'utf8').split(/\r?\n/).filter((line) => line.trim() !== '');

if (lines[0].trim() !== 'zip,zone') {
	throw new Error(`Unexpected CSV header: "${lines[0]}"`);
}

const zones = {};
for (const [i, line] of lines.slice(1).entries()) {
	const [zip, zone, ...rest] = line.split(',').map((s) => s.trim());
	const row = i + 2;
	if (rest.length > 0) throw new Error(`Row ${row}: too many columns: "${line}"`);
	if (!/^\d{5}$/.test(zip)) throw new Error(`Row ${row}: invalid zip "${zip}"`);
	if (!/^(?:[1-9]|1[0-3])[ab]$/.test(zone)) throw new Error(`Row ${row}: invalid zone "${zone}"`);
	if (zip in zones) throw new Error(`Row ${row}: duplicate zip "${zip}"`);
	zones[zip] = zone;
}

mkdirSync(dirname(output.pathname), { recursive: true });
writeFileSync(output, JSON.stringify(zones));
console.log(`Wrote ${Object.keys(zones).length} zips to src/data/zip-zones.json`);

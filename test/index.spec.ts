import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const get = (path: string) => SELF.fetch(`https://example.com${path}`);

describe('GET /api/zone/:zip', () => {
	it('returns the zone and parsed parts for a known zip', async () => {
		const response = await get('/api/zone/01002');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ zip: '01002', zone: '6a', zoneNumber: 6, zoneLetter: 'a' });
	});

	it('preserves leading zeros and parses two-digit zones', async () => {
		const response = await get('/api/zone/00501');
		expect(await response.json()).toEqual({ zip: '00501', zone: '7b', zoneNumber: 7, zoneLetter: 'b' });
	});

	it('sets a long public cache on success', async () => {
		const response = await get('/api/zone/01002');
		expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
	});

	it.each(['1234', '123456', 'abcde', '9021o', '90210-1234'])('returns 400 for malformed zip %s', async (zip) => {
		const response = await get(`/api/zone/${zip}`);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Invalid zip' });
	});

	it('returns 404 for a well-formed zip that is not in the data', async () => {
		const response = await get('/api/zone/00000');
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'Zip not found' });
	});
});

describe('CORS', () => {
	it('adds wildcard CORS headers to responses', async () => {
		const response = await get('/api/zone/01002');
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});

	it('answers OPTIONS preflight', async () => {
		const response = await SELF.fetch('https://example.com/api/zone/01002', { method: 'OPTIONS' });
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
	});
});

describe('other routes', () => {
	it('serves health', async () => {
		const response = await get('/api/health');
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ status: 'ok' });
	});

	it('returns 404 for unknown paths', async () => {
		expect((await get('/nope')).status).toBe(404);
	});

	it('returns 405 for non-GET methods', async () => {
		const response = await SELF.fetch('https://example.com/api/zone/01002', { method: 'POST' });
		expect(response.status).toBe(405);
	});
});

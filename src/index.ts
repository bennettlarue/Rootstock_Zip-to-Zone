import zipZones from './data/zip-zones.json';

const zones: Record<string, string> = zipZones;

const ZONE_ROUTE = /^\/api\/zone\/([^/]+)$/;
const ZIP_PATTERN = /^\d{5}$/;

// TODO: Wildcard for now; swap for an origin allowlist later.
const corsHeaders = (_request: Request): Record<string, string> => ({
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Max-Age': '86400',
});

const json = (request: Request, data: unknown, status = 200, cacheControl?: string) =>
	new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...(cacheControl && { 'Cache-Control': cacheControl }),
			...corsHeaders(request),
		},
	});

export default {
	async fetch(request): Promise<Response> {
		const { pathname } = new URL(request.url);

		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: corsHeaders(request) });
		}

		if (request.method !== 'GET') {
			return json(request, { error: 'Method not allowed' }, 405);
		}

		if (pathname === '/api/health') {
			return json(request, { status: 'ok', time: new Date().toISOString() });
		}

		const match = ZONE_ROUTE.exec(pathname);
		if (match) {
			const zip = match[1];
			if (!ZIP_PATTERN.test(zip)) {
				return json(request, { error: 'Invalid zip' }, 400);
			}

			const zone = zones[zip];
			if (!zone) {
				return json(request, { error: 'Zip not found' }, 404, 'public, max-age=3600');
			}

			return json(
				request,
				{ zip, zone, zoneNumber: parseInt(zone, 10), zoneLetter: zone.slice(-1) },
				200,
				'public, max-age=86400',
			);
		}

		return json(request, { error: 'Not found' }, 404);
	},
} satisfies ExportedHandler<Env>;

import { SERIES } from '../lib/market-series.mjs';
export { SERIES };

function csvRows(csv) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') { if (quoted && csv[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if (c === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const header = rows.shift()?.map(v => v.replace(/^\uFEFF/, '')) || [];
  if (!header.includes('TIME_PERIOD') || !header.includes('OBS_VALUE') || !header.includes('KEY')) throw new Error('Unexpected format');
  return rows.map(values => Object.fromEntries(header.map((key, j) => [key, values[j]])));
}
function normalize(rows, min, max) {
  return [...new Map(rows.flatMap(({ date, value, status }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date < min || date > max || typeof value !== 'number' || !Number.isFinite(value) || ['F', 'U', 'M'].includes(status)) return [];
    return [[date, { date, value }]];
  })).values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function createHandler({ fetcher = fetch, now = () => new Date() } = {}) {
  const cache = new Map(), pending = new Map();
  const reply = (body, status = 200) => Response.json(body, { status, headers: status === 200 ? {
    'Cache-Control': 'public, max-age=60',
    'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex', 'Cross-Origin-Resource-Policy':'same-origin',
    'Netlify-CDN-Cache-Control': `public, s-maxage=${body.fallback ? 300 : 3600}, durable`,
  } : { 'Cache-Control': 'no-store', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex' } });
  return async request => {
    if (request.method !== 'GET') return reply({ error: 'Méthode non autorisée.' }, 405);
    const params = new URL(request.url).searchParams, id = params.get('series'), range = params.get('range') || '5y';
    if (params.toString().length>256 || [...params.keys()].length!==new Set(params.keys()).size || !Object.hasOwn(SERIES, id || '') || !['1y', '5y'].includes(range) || [...params.keys()].some(k => !['series', 'range'].includes(k))) return reply({ error: 'Série ou période non autorisée.' }, 400);
    const definition = SERIES[id], key = `${id}:${range}`, today = now(), existing = cache.get(key);
    if (existing?.expires > today.getTime()) return reply(existing.payload);
    if (!pending.has(key)) pending.set(key, (async () => {
      const cutoff = new Date(today); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - (range === '5y' ? 5 : 1));
      const min = cutoff.toISOString().slice(0, 10), max = today.toISOString().slice(0, 10);
      const [, dataset, code] = definition.key.split('/');
      const directUrl = new URL(`https://data-api.ecb.europa.eu/service/data/${dataset}/${code}`);
      directUrl.searchParams.set('format', 'csvdata'); directUrl.searchParams.set('startPeriod', min); directUrl.searchParams.set('endPeriod', max);
      let observations, fallback = false;
      try {
        const response = await fetcher(directUrl, { headers: { Accept: 'text/csv' }, signal: AbortSignal.timeout(12000), redirect: 'error' });
        if (!response.ok) throw new Error('Primary unavailable');
        observations = normalize(csvRows(await response.text()).filter(r => r.KEY === `${dataset}.${code}`).map(r => ({ date: r.TIME_PERIOD, value: r.OBS_VALUE?.trim() ? Number(r.OBS_VALUE) : null, status: r.OBS_STATUS })), min, max);
        if (!observations.length) throw new Error('Empty primary');
      } catch (_) {
        const url = new URL(`https://api.db.nomics.world/v22/series/${definition.key}`); url.searchParams.set('observations', '1');
        const response = await fetcher(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000), redirect: 'error' });
        if (!response.ok) throw new Error('Backup unavailable');
        const body = await response.json(), doc = body.series?.docs?.find(d => d.provider_code === 'ECB' && d.dataset_code === dataset && d.series_code === code);
        if (!Array.isArray(doc?.period) || !Array.isArray(doc?.value)) throw new Error('Invalid backup');
        observations = normalize(doc.period.map((date, j) => ({ date, value: doc.value[j] })), min, max);
        if (!observations.length) throw new Error('Empty backup'); fallback = true;
      }
      const payload = { id, ...definition, source: fallback ? 'BCE · relais DBnomics' : 'BCE · accès direct', sourceUrl: fallback ? `https://db.nomics.world/${definition.key}` : directUrl.href, fallback, retrievedAt: today.toISOString(), observations, latest: observations.at(-1) };
      cache.set(key, { payload, expires: today.getTime() + (fallback ? 300000 : 3600000) }); return payload;
    })().finally(() => pending.delete(key)));
    try { return reply(await pending.get(key)); }
    catch (_) { return reply({ error: 'La BCE et son relais DBnomics sont momentanément indisponibles. Aucun niveau de remplacement n’est utilisé.' }, 502); }
  };
}
export default createHandler();

export const config={rateLimit:{windowLimit:60,windowSize:60,aggregateBy:['ip','domain']}};

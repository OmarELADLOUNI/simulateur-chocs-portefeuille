const BASE = "https://webstat.banque-france.fr/api/explore/v2.1/catalog/datasets/observations/exports/json";
export const SERIES = Object.freeze({
  tec2: { key: "FM.D.FR.EUR.FR2.BB.FRMOYTEC2.HSTA", label: "France · taux d’emprunt à 2 ans", unit: "%", tenor: 2 },
  tec5: { key: "FM.D.FR.EUR.FR2.BB.FRMOYTEC5.HSTA", label: "France · taux d’emprunt à 5 ans", unit: "%", tenor: 5 },
  tec10: { key: "FM.D.FR.EUR.FR2.BB.FRMOYTEC10.HSTA", label: "France · taux d’emprunt à 10 ans", unit: "%", tenor: 10 },
  tec30: { key: "FM.D.FR.EUR.FR2.BB.FRMOYTEC30.HSTA", label: "France · taux d’emprunt à 30 ans", unit: "%", tenor: 30 },
  eurusd: { key: "EXR.D.USD.EUR.SP00.A", label: "EUR/USD · taux de référence", unit: "USD pour 1 EUR" },
  fr10m: { key: "IRS.M.FR.L.L40.CI.0000.EUR.N.Z", label: "France · taux long de convergence", unit: "%", frequency: "monthly" },
  de10m: { key: "IRS.M.DE.L.L40.CI.0000.EUR.N.Z", label: "Allemagne · taux long de convergence", unit: "%", frequency: "monthly" },
  it10m: { key: "IRS.M.IT.L.L40.CI.0000.EUR.N.Z", label: "Italie · taux long de convergence", unit: "%", frequency: "monthly" },
  cac40: { match: "cac40", label: "CAC 40 · série Webstat", unit: "points" },
  stoxx600: { match: "stoxx600", label: "STOXX Europe 600 · série Webstat", unit: "points" },
  sp500: { match: "sp500", label: "S&P 500 · série Webstat", unit: "points" },
});
const PERIODS = { "1m": 31, "3m": 93, "1y": 366, "5y": 1830 };
const TTL = 4 * 60 * 60 * 1000;

// The ECB publishes these IRS series as SDMX CSV, including quoted comma-containing metadata.
export function parseEcbCsv(csv, seriesKey) {
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(field); field = ""; }
    else if (char === '\n' && !quoted) { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const header = rows.shift()?.map(h => h.replace(/^\uFEFF/, ""));
  if (!header?.includes("OBS_VALUE") || !header.includes("TIME_PERIOD")) return [];
  return rows.map(values => Object.fromEntries(header.map((key, j) => [key, values[j]])))
    .filter(r => r.KEY === seriesKey && /^\d{4}-\d{2}$/.test(r.TIME_PERIOD || ""))
    .map(r => ({ series_key: seriesKey, time_period_start: `${r.TIME_PERIOD}-01`, obs_value: r.OBS_VALUE?.trim() ? Number(r.OBS_VALUE) : null, obs_status: r.OBS_STATUS }));
}

// Dependency injection keeps the provider boundary testable without using a real key.
export function createHandler({ fetcher = fetch, getKey = () => process.env.WEBSTAT_API_KEY, now = () => new Date() } = {}) {
  const cache = new Map();
  const pending = new Map();
  let catalogue;
  let cataloguePending;
  async function resolveSeries(definition, secret, today) {
    if (definition.key) return definition;
    if (!catalogue || catalogue.expires < today.getTime()) {
      if (!cataloguePending) cataloguePending = (async () => {
        const url = new URL(BASE.replace("observations/exports/json", "series/exports/json"));
        url.searchParams.set("select", "series_key,title_fr,title_en,unit");
        url.searchParams.set("where", "dataset_id='FM' and series_key like 'FM.D.'");
        const response = await fetcher(url, { headers: { Authorization: `Apikey ${secret}`, Accept: "application/json" }, signal: AbortSignal.timeout(8000), redirect: "error" });
        if (!response.ok) { const e = new Error("Catalogue unavailable"); e.providerStatus = response.status; throw e; }
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error("Invalid catalogue");
        catalogue = { rows, expires: today.getTime() + TTL };
      })().finally(() => { cataloguePending = undefined; });
      await cataloguePending;
    }
    const patterns = { cac40: /cac\s*40/i, stoxx600: /stoxx.*600|600.*stoxx/i, sp500: /s\s*&\s*p\s*500|standard.*poor.*500/i };
    const candidates = catalogue.rows.filter(row => {
      const title = `${row.title_fr || ""} ${row.title_en || ""}`;
      return /^FM\.D\./.test(row.series_key || "") && patterns[definition.match].test(title)
        && !/variation|growth|croissance|volatilit|return|rendement|capitalisation/i.test(title);
    });
    const unique = [...new Map(candidates.map(row => [row.series_key, row])).values()];
    // Never choose an ambiguous or unrelated series merely to fill a market tile.
    if (unique.length !== 1) { const e = new Error("Series not available unambiguously"); e.notAvailable = true; throw e; }
    return { key: unique[0].series_key, label: unique[0].title_fr || definition.label, unit: definition.unit };
  }
  const reply = (body, status = 200, extra = {}) => Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag":"noindex", "Cross-Origin-Resource-Policy":"same-origin", ...extra },
  });

  return async request => {
    if (request.method !== "GET") return reply({ error: "Méthode non autorisée." }, 405, { Allow: "GET" });
    const params = new URL(request.url).searchParams;
    const id = params.get("series") || "tec10";
    const range = params.get("range") || "1y";
    if (params.toString().length>256 || [...params.keys()].length!==new Set(params.keys()).size || !Object.hasOwn(SERIES, id) || !Object.hasOwn(PERIODS, range)
      || [...params.keys()].some(k => !["series", "range"].includes(k))) {
      return reply({ error: "Série ou période non autorisée." }, 400);
    }
    const secret = getKey()?.trim();
    if (!secret) return reply({ error: "La connexion Webstat n’est pas configurée sur cet environnement Netlify.", code: "CONFIGURATION_MISSING" }, 503);
    const today = now();
    const cacheKey = `${id}:${range}`;
    const cached = cache.get(cacheKey);
    if (cached && today.getTime() < cached.expires) return reply(cached.data, 200, cacheHeaders());

    try {
      if (!pending.has(cacheKey)) {
        const task = (async () => {
          const definition = await resolveSeries(SERIES[id], secret, today);
          const from = new Date(today.getTime() - PERIODS[range] * 86400000).toISOString().slice(0, 10);
          const to = today.toISOString().slice(0, 10);
          const url = new URL(BASE);
          url.searchParams.set("select", "series_key,time_period_start,obs_value,obs_status,updated_at");
          url.searchParams.set("where", `series_key='${definition.key}' and time_period_start>=date'${from}' and time_period_start<=date'${to}'`);
          url.searchParams.set("order_by", "time_period_start asc");
          const response = await fetcher(url, {
            headers: { Authorization: `Apikey ${secret}`, Accept: "application/json" },
            signal: AbortSignal.timeout(8000), redirect: "error",
          });
          if (!response.ok) {
            const error = new Error("Provider failure");
            error.providerStatus = response.status;
            throw error;
          }
          let rows = await response.json();
          if (!Array.isArray(rows)) throw new Error("Invalid provider response");
          let source = "Banque de France · Webstat";
          let sourceUrl = "https://webstat.banque-france.fr/";
          if (!rows.length && definition.frequency === "monthly") {
            const ecb = new URL(`https://data-api.ecb.europa.eu/service/data/IRS/${definition.key.slice(4)}`);
            ecb.searchParams.set("format", "csvdata");
            ecb.searchParams.set("startPeriod", from.slice(0, 7));
            ecb.searchParams.set("endPeriod", to.slice(0, 7));
            // Webstat's secret is never sent to the public ECB endpoint.
            const fallback = await fetcher(ecb, { headers: { Accept: "text/csv" }, signal: AbortSignal.timeout(8000), redirect: "error" });
            if (!fallback.ok) throw new Error("ECB source unavailable");
            rows = parseEcbCsv(await fallback.text(), definition.key);
            source = "Banque centrale européenne · IRS";
            sourceUrl = `https://data.ecb.europa.eu/data/datasets/IRS/${definition.key}`;
          }
          const byDate = new Map();
          for (const row of rows) {
            // Do not convert missing values to zero or publish forecast/unreliable values as observations.
            if (row.series_key !== definition.key || typeof row.obs_value !== "number" || !Number.isFinite(row.obs_value)
              || ["M", "F", "U"].includes(row.obs_status) || typeof row.time_period_start !== "string") continue;
            const date = row.time_period_start.slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < from || date > to) continue;
            byDate.set(date, { date, value: row.obs_value, status: row.obs_status || null });
          }
          const observations = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
          if (!observations.length) {
            const error = new Error("No observations");
            error.empty = true;
            throw error;
          }
          const data = {
            id, ...definition, range, frequency: definition.frequency || "daily", source,
            sourceUrl, retrievedAt: today.toISOString(),
            latest: observations.at(-1), observations,
          };
          cache.set(cacheKey, { data, expires: now().getTime() + TTL });
          return data;
        })();
        pending.set(cacheKey, task);
      }
      return reply(await pending.get(cacheKey), 200, cacheHeaders());
    } catch (error) {
      // Never return or log the provider body, headers or key.
      if ([401, 403].includes(error.providerStatus)) return reply({ error: "Webstat refuse l’accès. Vérifiez la clé et ses autorisations dans Netlify.", code: "PROVIDER_AUTH" }, 502);
      if (error.providerStatus === 429) return reply({ error: "Le quota Webstat est temporairement atteint. Réessayez plus tard.", code: "PROVIDER_QUOTA" }, 503, { "Retry-After": "3600" });
      if (error.empty) return reply({ error: "Aucune observation exploitable pour cette série et cette période.", code: "NO_DATA" }, 502);
      if (error.notAvailable) return reply({ error: "Aucune série quotidienne correspondante n’a pu être identifiée sans ambiguïté dans le catalogue Webstat.", code: "SERIES_UNAVAILABLE" }, 404);
      return reply({ error: "Les données Webstat sont momentanément indisponibles. Réessayez plus tard.", code: "PROVIDER_UNAVAILABLE" }, 502);
    } finally {
      pending.delete(cacheKey);
    }
  };
}

function cacheHeaders() {
  return {
    "Cache-Control": "public, max-age=300",
    "Netlify-CDN-Cache-Control": "public, s-maxage=14400, durable",
  };
}

export default createHandler();

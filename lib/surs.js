// lib/surs.js — Statistical Office of the Republic of Slovenia (SURS) helpers.
//
// SURS SiStatData publishes PxWeb 2.0 tables. Most useful for us: the 0861*
// "housing fund" series, which carries municipality × ownership / occupancy
// status. Tables are queried by POSTing a JSON selection; responses come
// back as JSON-stat 2.0.
//
// PxWeb's value array is row-major over its `size` array. With a typical
// 5-dim selection (municipality × measure-A × measure-B × year × meas-unit)
// the layout is values[((iMuni*sB + iA)*sB + iB)*sYr + iYr)*sUnit + iUnit].
// `valueAt(table, indices)` does that compute so call sites stay legible.

const PXWEB_BASE = "https://pxweb.stat.si/SiStatData/api/v1/en/Data";

// Strip the country prefix from an envelope-meta LAU code (eurostat_lau writes
// the GISCO form, e.g. "SI_003"). Returns just the občina id ("003") used by
// SURS, or null if the prefix isn't Slovenia.
export function lauToObcina(giscoId) {
  if (typeof giscoId !== "string") return null;
  if (!giscoId.startsWith("SI_")) return null;
  return giscoId.slice(3);
}

export async function queryPxWeb(tableId, query, { signal } = {}) {
  const url = `${PXWEB_BASE}/${tableId}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, response: { format: "json-stat2" } }),
    signal,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`SURS ${tableId} HTTP ${r.status}: ${body.slice(0, 200)}`);
  }
  return await r.json();
}

// Read a single value out of a JSON-stat 2.0 dataset by dimension-code → value-code.
// Throws if any of the requested values is null in the response (PxWeb encodes
// missing as null in `value` and a "-" entry in `status`). Returns the number
// otherwise.
export function valueAt(table, picks) {
  const dims = table.id; // ordered list of dimension codes
  const sizes = table.size;
  let flat = 0;
  for (let i = 0; i < dims.length; i++) {
    const code = dims[i];
    const want = picks[code];
    if (want == null) throw new Error(`valueAt: missing pick for ${code}`);
    const idx = table.dimension[code]?.category?.index?.[String(want)];
    if (idx == null) throw new Error(`valueAt: value ${want} not in ${code}`);
    flat = flat * sizes[i] + idx;
  }
  const v = table.value[flat];
  if (v == null) {
    const status = table.status?.[flat];
    throw new Error(`valueAt: null at ${JSON.stringify(picks)}${status ? ` (status "${status}")` : ""}`);
  }
  return v;
}

// Display formatting for a metric snapshot (the shape lib/city-detail-view.js
// produces). Mirrors the mockup's formatMetricNumber so the live page reads
// identically. Pure — no React.

export function formatMetricNumber(m) {
  const v = m.value;
  if (v == null) return "—";
  switch (m.unit) {
    case "days":   return String(Math.round(v));
    // `%` values are already percentages (11.8 ⇒ 11.8%); `frac` are 0–1.
    case "%":      return `${Math.round(v)}%`;
    case "frac":   return `${Math.round(v * 100)}%`;
    case "m":      return v < 1000 ? `${Math.round(v)} m` : `${(v / 1000).toFixed(1)} km`;
    case "km²":    return `${v.toFixed(1)} km²`;
    case "°":      return `${v.toFixed(1)}°`;
    case "$":      return `$${(v / 1000).toFixed(0)}k`;
    case "ratio":  return `${v.toFixed(1)}×`;
    case "/km²":   return `${Math.round(v)}/km²`;
    case "/sqmi":  return `${Math.round(v).toLocaleString()}/sq mi`;
    case "count":  return String(Math.round(v));
    case "km":     return `${v.toFixed(1)} km`;
    case "0–100":  return String(Math.round(v));
    case "hr":     return `${v.toFixed(1)} hr`;
    default:       return String(v);
  }
}

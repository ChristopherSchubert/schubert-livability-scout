// Panoramic horizon strip — 360° of visible mountain horizon condensed into
// the "Mountains on the horizon" metric row. Built straight from
// horizon_features (the occlusion-tested OSM peak list), so every ridgeline
// is a real summit the algorithm believes is in line of sight from the
// visit center.
//
// Reading the picture:
//   • The panorama is cut at S, so x=0 is "behind your left shoulder" and
//     x=W is "behind your right." N — what you'd see facing forward —
//     sits dead-center. W is at the left quarter, E at the right quarter.
//   • Each peak contributes a Gaussian bump to a continuous silhouette,
//     so adjacent peaks merge into walls and isolated peaks read as
//     single ridges instead of free-standing triangles.
//   • Three atmospheric layers (far / mid / near) paint back-to-front,
//     using the same near→far palette as the per-peak pinpricks: pale
//     blue-grey for distant ridges → warm slate → dark ink for close
//     mountains. Distance does the same work air does at a real horizon.
//   • Each peak's summit is also marked with a small pinprick colored by
//     its own distance, so a city's near-versus-far peak distribution
//     reads directly. The dominant (highest-angle) peak gets a small
//     marker line above it.
//
// Lives inline inside a MetricRow — no header band, no figcaption beyond
// the dominant peak's name (the metric row already carries the % value).

const W = 320;
const H = 64;
const SKY_TOP_Y = 4;
const HORIZON_Y = H - 12;
const FOREGROUND_H = H - HORIZON_Y;

const MAX_ANGLE = 8;                          // ° — saturation point
const PX_PER_DEG = (HORIZON_Y - SKY_TOP_Y) / MAX_ANGLE;
const SAMPLE_STEP = 1.5;
const SAMPLES = Math.round(360 / SAMPLE_STEP);
const CUT_IDX = Math.round(180 / SAMPLE_STEP); // cut at S so N centers

// Map an azimuth to an x coordinate. Subtracting 180° puts S at x=0 and
// x=W, and N (az=0) at the midpoint — so the reader stands facing N.
const xOf = (az) => (((az - 180 + 360) % 360) / 360) * W;

// Three atmospheric bands for the silhouette layers. The pinpricks use a
// continuous interpolation of the same near→far palette, so the per-peak
// dots match the band they sit in.
const BANDS = [
  { id: "far",  inBand: (km) => km > 40,             fill: "#a9b1bd" },
  { id: "mid",  inBand: (km) => km > 12 && km <= 40, fill: "#6a5f53" },
  { id: "near", inBand: (km) => km <= 12,            fill: "#26201a" },
];

// Continuous near→far color, log-scaled in km so the difference between
// 1 km and 5 km matters more than 50 km vs 70 km — which matches how the
// eye reads atmospheric depth.
function pinColorFor(dist_m) {
  const km = Math.max(0.5, (dist_m ?? 30000) / 1000);
  const t = Math.max(0, Math.min(1, Math.log10(km) / Math.log10(90)));
  const stops = [
    { t: 0,   c: [21, 17, 13] },    // near — dark ink
    { t: 0.5, c: [106, 95, 83] },   // mid  — warm slate
    { t: 1,   c: [169, 177, 189] }, // far  — pale blue-grey
  ];
  const lo = t <= 0.5 ? stops[0] : stops[1];
  const hi = t <= 0.5 ? stops[1] : stops[2];
  const span = (t - lo.t) / (hi.t - lo.t);
  const rgb = [0, 1, 2].map((i) => Math.round(lo.c[i] + (hi.c[i] - lo.c[i]) * span));
  return `rgb(${rgb.join(",")})`;
}

// Apparent angular width of a ridge at the observer scales with proximity:
// a close peak fills more azimuth than a distant one.
function sigmaDeg(dist_m) {
  const km = Math.max(0.5, (dist_m ?? 30000) / 1000);
  return Math.max(3.5, Math.min(20, 18 - 3 * Math.log10(km)));
}

function silhouetteSamples(peaks) {
  const out = new Array(SAMPLES).fill(0);
  for (const p of peaks) {
    if (!Number.isFinite(p.az) || !Number.isFinite(p.angle)) continue;
    const sigma = sigmaDeg(p.dist_m);
    const reach = Math.ceil((3 * sigma) / SAMPLE_STEP);
    const centerIdx = Math.round(p.az / SAMPLE_STEP);
    for (let k = -reach; k <= reach; k++) {
      const idx = ((centerIdx + k) % SAMPLES + SAMPLES) % SAMPLES;
      const az = idx * SAMPLE_STEP;
      let d = Math.abs(az - p.az);
      if (d > 180) d = 360 - d;
      const bump = p.angle * Math.exp(-(d * d) / (2 * sigma * sigma));
      if (bump > out[idx]) out[idx] = bump;
    }
  }
  return out;
}

// Rotate the sample array so the path renders continuously left→right
// starting at S (the cut). Avoids the wrap-around discontinuity at
// az=0/360 that would otherwise leave a visible seam under the N center.
function pathFromSamples(samples) {
  const rot = [...samples.slice(CUT_IDX), ...samples.slice(0, CUT_IDX)];
  const xAt = (i) => (i / rot.length) * W;
  const yAt = (i) => HORIZON_Y - Math.min(MAX_ANGLE, rot[i]) * PX_PER_DEG;
  let d = `M 0 ${HORIZON_Y} L 0 ${yAt(0)}`;
  for (let i = 1; i < rot.length; i++) {
    const px = xAt(i - 1), py = yAt(i - 1);
    const cx = xAt(i),     cy = yAt(i);
    const mx = (px + cx) / 2, my = (py + cy) / 2;
    d += ` Q ${px.toFixed(2)} ${py.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
  }
  d += ` L ${xAt(rot.length - 1).toFixed(2)} ${yAt(rot.length - 1).toFixed(2)}`;
  d += ` L ${W} ${HORIZON_Y} L 0 ${HORIZON_Y} Z`;
  return d;
}

// Just the four primaries — S splits to both edges so a reader can find
// "the W behind me" or "the E behind me" at a glance. We use fractional
// positions instead of azimuths because xOf collapses the wraparound S to a
// single edge (left), and we want labels on BOTH ends.
const CARDINALS = [
  { x: 0.00, label: "S" },
  { x: 0.25, label: "W" },
  { x: 0.50, label: "N" },
  { x: 0.75, label: "E" },
  { x: 1.00, label: "S" },
];

export default function HorizonStrip({ horizon }) {
  if (!horizon) return null;
  const peaks = horizon.peaks || [];
  const isEmpty = peaks.length === 0;

  const dominant = !isEmpty
    ? [...peaks].sort((a, b) => b.angle - a.angle)[0]
    : null;

  const bandData = BANDS.map((band) => {
    const inBand = peaks.filter((p) => band.inBand((p.dist_m ?? 30000) / 1000));
    return { ...band, samples: silhouetteSamples(inBand), peaks: inBand };
  });

  return (
    <div
      className={`horizon-strip${isEmpty ? " is-empty" : ""}`}
      aria-label={
        isEmpty
          ? "Open horizon — no named peaks within 90 km"
          : `Horizon panorama — dominant peak ${dominant?.name}, ${dominant?.angle}° ${dominant?.dir}`
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#dfe5eb" />
            <stop offset="55%" stopColor="#e8e2d4" />
            <stop offset="100%" stopColor="#d8cfb8" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={W} height={HORIZON_Y} fill="url(#hs-sky)" />
        <rect x="0" y={HORIZON_Y} width={W} height={FOREGROUND_H} className="hs-fore" />

        {/* Atmospheric silhouette layers — far → mid → near, painted back to front */}
        {bandData
          .filter((b) => b.peaks.length)
          .map((b) => (
            <path
              key={b.id}
              d={pathFromSamples(b.samples)}
              fill={b.fill}
              stroke={b.fill}
              strokeOpacity="0.5"
              strokeWidth="0.5"
            />
          ))}

        {/* Horizon line — anchors the eye */}
        <line x1="0" y1={HORIZON_Y} x2={W} y2={HORIZON_Y} className="hs-horizon" />

        {/* Cardinal ticks: S | W | N | E | S, inside the strip at the horizon */}
        {CARDINALS.map(({ x, label }, i) => {
          const cx = x * W;
          // First "S" sits flush at the left edge; last "S" flush at the right —
          // anchor differently so the glyph stays inside the SVG.
          const anchor = i === 0 ? "start" : i === CARDINALS.length - 1 ? "end" : "middle";
          return (
            <g key={i} className="hs-card">
              <line x1={cx} y1={HORIZON_Y - 3} x2={cx} y2={HORIZON_Y + 3} />
              <text x={cx} y={H - 3} textAnchor={anchor}>{label}</text>
            </g>
          );
        })}

        {/* Per-peak pinpricks, COLORED BY DISTANCE — darker = closer.
            Dominant peak gets a small marker line above it. */}
        {peaks.map((p, i) => {
          const cx = xOf(p.az);
          const cy = HORIZON_Y - Math.min(MAX_ANGLE, p.angle) * PX_PER_DEG;
          const isDom = p === dominant;
          const color = pinColorFor(p.dist_m);
          return (
            <g key={`pin-${i}`} className={`hs-pin${isDom ? " is-dom" : ""}`}>
              {isDom ? (
                <line
                  x1={cx}
                  y1={cy - 2.5}
                  x2={cx}
                  y2={cy - 7}
                  stroke={color}
                  strokeWidth="0.9"
                />
              ) : null}
              <circle
                cx={cx}
                cy={cy}
                r={isDom ? 2.1 : 1.5}
                fill={color}
                stroke="#fbf6ea"
                strokeWidth={isDom ? 0.6 : 0}
              />
              <title>
                {`${p.name} · ${p.angle}° · ${p.dir} · ${p.ele} m · ${(p.dist_m / 1000).toFixed(1)} km`}
              </title>
            </g>
          );
        })}
      </svg>

      {dominant ? (
        <p className="hs-cap">
          <strong>{dominant.name}</strong>
          <span className="hs-cap-meta">
            {dominant.dir} · {dominant.angle}° · {(dominant.dist_m / 1000).toFixed(1)} km
          </span>
        </p>
      ) : (
        <p className="hs-cap is-empty">No named peaks within 90 km</p>
      )}
    </div>
  );
}

// Panoramic horizon strip — 360° of visible mountain horizon as the viewer
// would see it sweeping their gaze from N around the compass and back. Drawn
// directly from horizon_features (the occlusion-tested OSM peak list), so
// every silhouette is a real summit the algorithm believes is in line of
// sight from the visit center.
//
// Reading the picture:
//   • X axis is bearing 0° (N) → 360° (N again, wrapping). The center is S.
//   • Y axis is elevation angle. A 2°-tall silhouette is a fingertip-at-
//     arm's-length silhouette; a 10°+ ridge looms.
//   • Peak fill darkness scales with proximity — close peaks are solid; the
//     Italian Dolomites at 140 km across the Adriatic are pale.
//   • Empty stretches are honest empty horizon — open water, prairie, or the
//     direction Pittsburgh's Allegheny valley opens.
//
// Same scale across all cities — Bled's wall vs Piran's distant arc vs
// Lawrenceville's lone foothill should be directly comparable.

const W = 960;            // viewBox width (responsive via CSS)
const H = 140;            // viewBox height
const HORIZON_Y = H - 22; // baseline where peaks rise from
const MAX_ANGLE = 12;     // degrees — top of strip; saturates beyond
const PX_PER_DEG = (HORIZON_Y - 8) / MAX_ANGLE;
const COMPASS_CARDINALS = [
  { az: 0, label: "N" }, { az: 45, label: "NE" }, { az: 90, label: "E" },
  { az: 135, label: "SE" }, { az: 180, label: "S" }, { az: 225, label: "SW" },
  { az: 270, label: "W" }, { az: 315, label: "NW" }, { az: 360, label: "N" },
];
const SUBCARDINALS = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];

// Pixel x for an azimuth, with a soft margin so the leftmost N labels don't
// clip the strip edge.
const xOf = (az) => 8 + (az / 360) * (W - 16);

// Opacity by distance. Close peaks (within ~5 km) read as solid black; ~30 km
// fades to mid grey; 100+ km is a thin distant silhouette. Matches what the
// eye does — distance does the atmospheric work for us.
function opacityFor(dist_m) {
  if (dist_m == null) return 0.85;
  const km = dist_m / 1000;
  if (km <= 5) return 0.92;
  if (km <= 15) return 0.78;
  if (km <= 35) return 0.6;
  if (km <= 70) return 0.4;
  return 0.28;
}

export default function HorizonStrip({ horizon }) {
  const peaks = horizon?.peaks || [];
  if (!peaks.length) return null;

  // Labels: only the prominent peaks (angle ≥ 2°) and only one per sector,
  // with a min azimuth gap so adjacent-sector labels don't collide. The
  // distant ridges that fill the horizon (≤ 2°) read better as anonymous
  // silhouettes than as a cloud of overlapping names.
  const labelMinAngle = 2.0;
  const labelMinAzGap = 18; // degrees
  const sorted = [...peaks].sort((a, b) => b.angle - a.angle);
  const labelable = [];
  const usedSectors = new Set();
  for (const p of sorted) {
    if (p.angle < labelMinAngle) continue;
    const k = Math.round(p.az / 22.5) % 16;
    if (usedSectors.has(k)) continue;
    if (labelable.some((q) => {
      const d = Math.min(Math.abs(p.az - q.az), 360 - Math.abs(p.az - q.az));
      return d < labelMinAzGap;
    })) continue;
    labelable.push(p);
    usedSectors.add(k);
  }

  return (
    <figure className="horizon-strip" aria-label="Visible mountain horizon, 360° around the visit center">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f0ebe1" />
            <stop offset="80%" stopColor="#e6dfd1" />
            <stop offset="100%" stopColor="#d9d0bd" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={W} height={HORIZON_Y} fill="url(#hs-sky)" />
        <rect x="0" y={HORIZON_Y} width={W} height={H - HORIZON_Y} fill="#cfc3a8" />

        {/* Cardinal grid */}
        {SUBCARDINALS.map((az) => (
          <line key={`sub-${az}`} x1={xOf(az)} y1={6} x2={xOf(az)} y2={HORIZON_Y}
                stroke="#000" strokeOpacity="0.06" strokeDasharray="2 4" />
        ))}
        {COMPASS_CARDINALS.map(({ az, label }, i) => (
          <g key={`card-${i}`}>
            <line x1={xOf(az)} y1={6} x2={xOf(az)} y2={HORIZON_Y}
                  stroke="#000" strokeOpacity="0.18" />
            <text x={xOf(az)} y={H - 6} textAnchor="middle"
                  fontFamily="Georgia, serif" fontSize="11"
                  fill="#3b3325" letterSpacing="0.08em">{label}</text>
          </g>
        ))}

        {/* Peaks — drawn back-to-front: furthest first, closest on top */}
        {[...peaks].sort((a, b) => (b.dist_m || 0) - (a.dist_m || 0)).map((p, i) => {
          const cx = xOf(p.az);
          const h = Math.min(MAX_ANGLE, p.angle) * PX_PER_DEG;
          const halfBase = 6 + Math.min(10, h * 0.18);
          const y = HORIZON_Y - h;
          const op = opacityFor(p.dist_m);
          const id = `${p.name}-${p.az}-${i}`;
          return (
            <g key={id}>
              <polygon
                points={`${cx - halfBase},${HORIZON_Y} ${cx},${y} ${cx + halfBase},${HORIZON_Y}`}
                fill="#1f1a12" fillOpacity={op}
              />
              <title>{`${p.name} · ${p.angle}° · ${p.dir} · ${p.ele} m · ${(p.dist_m/1000).toFixed(1)} km`}</title>
            </g>
          );
        })}

        {/* Labels for the strongest peak per sector — small, sparing */}
        {labelable.map((p, i) => {
          const cx = xOf(p.az);
          const h = Math.min(MAX_ANGLE, p.angle) * PX_PER_DEG;
          const y = HORIZON_Y - h - 4;
          return (
            <text key={`label-${i}`} x={cx} y={y} textAnchor="middle"
                  fontFamily="Georgia, serif" fontSize="9" fill="#1f1a12" fillOpacity="0.78">
              {p.name}
            </text>
          );
        })}

        {/* Baseline */}
        <line x1="0" y1={HORIZON_Y} x2={W} y2={HORIZON_Y} stroke="#3b3325" strokeOpacity="0.55" />
      </svg>
      <figcaption>
        {`Visible mountain horizon · ${horizon.occupancyPct}% of the ring · ${peaks.length} occlusion-tested peak${peaks.length === 1 ? "" : "s"} shown`}
      </figcaption>
    </figure>
  );
}

import "./globals.css";
import "./workspace.css";
import "./trips.css";
import "./trip-planner.css";
import "./city-detail.css";
import "./journal.css";
import { cookies } from "next/headers";
import AuthGate from "../components/AuthGate";
import { PlannerProvider } from "../components/PlannerProvider";
import { TripProvider } from "../components/TripProvider";

export const metadata = {
  title: "Schubert Atlas",
  description: "Find wonderful places to go, and enjoy them.",
};

// Explicit viewport (was relying on Next's implicit default). The app is used
// on a phone in the field for the felt-score survey, so device-width + a
// user-scalable zoom (accessibility: never disable pinch-zoom) are deliberate.
// See features/mobile.md.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Empty manifest shape the PlannerProvider expects: { images, choices, version }.
// In production, heroes are read from cities.hero_image (Supabase Storage) — the
// legacy manifest.js file is unused. In dev, the /cities/[slug]/images curation
// page writes live updates into PlannerProvider state anyway (no SSR read needed).
const EMPTY_MANIFEST = { images: {}, choices: {}, version: 0 };

export default async function RootLayout({ children }) {
  const initialManifest = EMPTY_MANIFEST;

  // Theme — explicit user choice from a cookie wins; otherwise OS preference
  // (handled in globals.css via @media prefers-color-scheme + :not([data-theme])).
  // The cookie is read server-side so first paint matches the user's choice,
  // no flash. Values: "light" | "dark" | (absent → follow OS).
  const themeCookie = (await cookies()).get("theme")?.value;
  const dataTheme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : undefined;

  return (
    <html lang="en" data-theme={dataTheme}>
      <head>
        {/* Fraunces (display) + Inter Tight (UI) power the magazine city-detail
            page (app/city-detail.css). Loaded by literal family name so the
            variable axes — opsz / SOFT / wght — resolve as the CSS expects. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..900,0..100;1,9..144,300..900,0..100&family=Inter+Tight:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthGate>
          <PlannerProvider initialManifest={initialManifest}>
            <TripProvider>
              {children}
            </TripProvider>
          </PlannerProvider>
        </AuthGate>
      </body>
    </html>
  );
}

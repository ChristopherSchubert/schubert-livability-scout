import "./globals.css";
import "./workspace.css";
import "./trips.css";
import "./trip-planner.css";
import "./city-detail.css";
import AuthGate from "../components/AuthGate";
import { PlannerProvider } from "../components/PlannerProvider";
import { TripProvider } from "../components/TripProvider";
import { readImageManifest } from "../lib/image-manifest";

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

export default async function RootLayout({ children }) {
  const initialManifest = await readImageManifest();

  return (
    <html lang="en">
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

import "./globals.css";
import "./city-detail.css";
import AuthGate from "../components/AuthGate";
import { PlannerProvider } from "../components/PlannerProvider";
import { readImageManifest } from "../lib/image-manifest";

export const metadata = {
  title: "Livability Scout",
  description: "A city-by-city planner for testing walkable, vivid places.",
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
            {children}
          </PlannerProvider>
        </AuthGate>
      </body>
    </html>
  );
}

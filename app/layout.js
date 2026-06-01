import "./globals.css";
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

import { TripProvider } from "../../components/TripProvider";

// /trips runs under its own provider (issue #12 / #15), mounted alongside
// PlannerProvider (root layout) so trip components can also read scout cities.
export default function TripsLayout({ children }) {
  return <TripProvider>{children}</TripProvider>;
}

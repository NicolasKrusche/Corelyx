import { Redirect } from "expo-router";

/**
 * Catch-all for any path that doesn't match a route (e.g. an odd initial
 * deep-link path from Expo Go). Bounce back to the entry redirector, which sends
 * the user to /login or /inbox based on auth — instead of dead-ending on the
 * default "Unmatched Route" screen.
 */
export default function NotFound() {
  return <Redirect href="/" />;
}

/**
 * Source: https://github.com/suryaumapathy2812/aether/issues/10
 * AI tool: Claude Code + Kilo (.kilo/plans directory present in repo)
 *
 * Gap: Auth guard reads localStorage — a client-side value any script can
 * forge. No middleware.ts exists, so server routes are unprotected. API calls
 * never include an Authorization header, so the backend cannot verify the
 * caller even if it wanted to.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * BUG: localStorage is not a security boundary.
 * Any script on the page (XSS, browser extension, dev tools) can run:
 *   localStorage.setItem('aether_token', 'anything')
 * and isLoggedIn() will return true, bypassing the guard entirely.
 */
export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("aether_token");
}

/**
 * BUG: This component protects the React UI tree only.
 * It does nothing to protect:
 *   - API routes (no middleware.ts exists — Next.js never runs server-side auth)
 *   - Direct fetch() calls to /api/* from any HTTP client
 *
 * An attacker with localStorage access sees the dashboard briefly before the
 * redirect fires; more critically, they can hit /api/* directly with no guard.
 *
 * BUG: API calls made by the app (e.g. fetch('/api/notes')) never attach an
 * Authorization header, so even if the server added auth checks later it would
 * reject every legitimate request too.
 */
interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
    }
  }, [router]);

  // Renders children immediately — the redirect is async, so protected
  // content flashes before navigation completes.
  if (!isLoggedIn()) return null;

  return <>{children}</>;
}

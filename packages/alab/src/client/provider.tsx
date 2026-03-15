import { Suspense, type ReactNode } from "react";

interface AlabProviderProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Root provider for Alab apps.
 * Wraps the app in a Suspense boundary for `useServerData` hooks.
 */
export function AlabProvider({ children, fallback = null }: AlabProviderProps) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

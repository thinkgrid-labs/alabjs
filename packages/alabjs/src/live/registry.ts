/**
 * Live component registry.
 *
 * At server startup, `createApp` scans `dist/server/**\/*.live.js`, imports
 * each module, reads the `liveInterval` and `liveTags` exports, and calls
 * `registerLiveComponent()`. The SSE endpoint then looks up entries here.
 */

export interface LiveComponentEntry {
  /** Stable FNV-1a hash of the original source module path (16 hex chars). */
  id: string;
  /** Absolute path to the compiled `.live.js` file in dist/server. */
  modulePath: string;
  /**
   * Re-render interval in milliseconds.
   * Set via `export const liveInterval = 5000` in the live component file.
   * When undefined, the component only updates on tag invalidation.
   */
  liveInterval?: number;
  /**
   * Function that returns cache tags for a given props object.
   * Set via `export const liveTags = (props) => [\`stock:\${props.ticker}\`]`.
   * When undefined, the component is not subscribed to tag broadcasts.
   */
  liveTags?: (props: unknown) => string[];
}

const _registry = new Map<string, LiveComponentEntry>();

export function registerLiveComponent(entry: LiveComponentEntry): void {
  _registry.set(entry.id, entry);
}

export function getLiveComponent(id: string): LiveComponentEntry | undefined {
  return _registry.get(id);
}

/** Return all entries whose `liveTags(props)` includes the given tag. */
export function getLiveComponentsByTag(tag: string): Array<{ entry: LiveComponentEntry; props: unknown }> {
  // This is called by the broadcaster when a tag is invalidated.
  // Each SSE connection registers itself with the tag broadcaster directly,
  // so this function is used only for discovery — not for fan-out.
  const results: Array<{ entry: LiveComponentEntry; props: unknown }> = [];
  for (const entry of _registry.values()) {
    if (entry.liveTags) {
      // We don't know props here — tag matching is handled per-connection
      // in the SSE handler via subscribeToTag.
      results.push({ entry, props: undefined });
    }
  }
  return results;
}

export function registrySize(): number {
  return _registry.size;
}

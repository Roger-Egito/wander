/**
 * Content versions, as the Releases tab holds them ("0.1.3-beta"). The Editor suggests
 * the next one, and the snapshot workflow publishes a release when its version is higher
 * than the one already published.
 *
 * The order is Semantic Versioning's (semver.org): numbers first, then a version with a
 * label comes before the same numbers without one, since "1.0.0-beta" is a pre-release
 * of "1.0.0". Labels are compared as plain text.
 */

/** The first version while Wander is in playtest: 0.x is "still in development" in Semantic Versioning, and the label says it outright. */
export const FIRST_VERSION = '0.1.0-beta';

export interface Version {
  numbers: [number, number, number];
  /** "-beta", or "" for none. */
  label: string;
}

export function parseVersion(text: string): Version | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/.exec(text.trim());
  if (!match) return null;
  return { numbers: [Number(match[1]), Number(match[2]), Number(match[3])], label: match[4] ?? '' };
}

/** Negative when `a` comes before `b`, positive after, 0 when the same. */
export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] - b.numbers[i];
  if (a.label === b.label) return 0;
  if (!a.label) return 1;
  if (!b.label) return -1;
  return a.label < b.label ? -1 : 1;
}

/** The highest valid version among `versions`, or null when none is valid. */
export function latestVersion(versions: string[]): string | null {
  let best: { text: string; version: Version } | null = null;
  for (const text of versions) {
    const version = parseVersion(text);
    if (version && (!best || compareVersions(version, best.version) > 0)) best = { text: text.trim(), version };
  }
  return best?.text ?? null;
}

/**
 * The next content release: a patch bump of the highest version so far, keeping its
 * label ("0.1.3-beta" → "0.1.4-beta"). Leaving beta means typing "1.0.0" once.
 */
export function nextVersion(versions: string[]): string {
  const latest = latestVersion(versions);
  if (!latest) return FIRST_VERSION;
  const { numbers: [major, minor, patch], label } = parseVersion(latest)!;
  return `${major}.${minor}.${patch + 1}${label}`;
}

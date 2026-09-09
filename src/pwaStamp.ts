/** Marker the Vite build rewrites so each deploy changes sw.js bytes. */
export const SW_BUILD_MARKER = "kindling-build";

/**
 * Stamp (or replace) a build id comment at the top of the service worker source.
 * Browsers treat the worker as unchanged until the script bytes change, so an
 * unstamped `public/sw.js` would never update after the first install.
 */
export function stampServiceWorkerSource(source: string, buildId: string): string {
  const id = buildId.trim();
  if (!id) throw new Error("pwa: empty service worker build id");
  const line = `/* ${SW_BUILD_MARKER}: ${id} */`;
  const normalised = source.replace(/\r\n/g, "\n");
  const stamped = new RegExp(`\\/\\* ${SW_BUILD_MARKER}: [^\\n]* \\*\\/\\n?`);
  if (stamped.test(normalised)) return normalised.replace(stamped, `${line}\n`);
  return `${line}\n${normalised}`;
}

export function serviceWorkerBuildId(env: { GITHUB_SHA?: string } = {}, now = Date.now): string {
  const sha = env.GITHUB_SHA?.trim();
  if (sha) return sha.slice(0, 12);
  return `local-${now().toString(36)}`;
}

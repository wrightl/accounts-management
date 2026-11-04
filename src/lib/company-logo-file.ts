/**
 * Picture formats a company logo may be, shared by the upload forms, the
 * upload check and the route that serves it. Never SVG: an SVG is a document
 * that can run script when someone opens its address directly.
 */
export const LOGO_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

/** The `accept` list for logo file inputs. */
export const LOGO_ACCEPT = [...LOGO_CONTENT_TYPES].join(",");

export function isLogoContentType(contentType: string | null | undefined): boolean {
  return contentType != null && LOGO_CONTENT_TYPES.has(contentType);
}

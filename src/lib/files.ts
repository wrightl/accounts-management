/** Safe object-key / Content-Disposition filename from user-supplied names. */
export function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  return cleaned || "file";
}

export function contentDispositionAttachment(filename: string): string {
  const ascii = safeFilename(filename).replace(/"/g, "");
  return `attachment; filename="${ascii}"`;
}

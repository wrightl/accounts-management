export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

import { Card } from "@/components/ui/card";

/**
 * Placeholder for sections that are scaffolded in Phase 0 and implemented in a
 * later phase. Keeps navigation and access control real while the feature is
 * built out.
 */
export function SectionStub({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase?: number;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        {phase !== undefined && (
          <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent">
            Phase {phase}
          </span>
        )}
      </div>
      <p className="mt-2 text-muted">{description}</p>
      <Card className="mt-6 text-sm text-muted">
        This section is scaffolded and access-controlled. Functionality lands in
        Phase {phase ?? "—"}.
      </Card>
    </div>
  );
}

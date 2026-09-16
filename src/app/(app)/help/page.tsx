import { requireUser } from "@/lib/auth";
import { HelpGuide } from "@/components/help/help-guide";

export default async function HelpPage() {
  const user = await requireUser();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">
        How to use this app
      </h1>
      <p className="mt-1 max-w-2xl text-muted">
        A short guide for busy founders — what to do first, how money moves
        through the app, and a simple weekly rhythm. Skip the jargon; follow
        the links into the real screens.
      </p>
      <div className="mt-8">
        <HelpGuide entityType={user.entityType} role={user.role} />
      </div>
    </div>
  );
}

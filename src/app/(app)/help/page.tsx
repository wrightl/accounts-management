import { requireUser } from "@/lib/auth";
import { AccountantHelpGuide } from "@/components/help/accountant-help-guide";
import { HelpGuide } from "@/components/help/help-guide";
import { PageHeader } from "@/components/ui/page-header";

export default async function HelpPage() {
  const user = await requireUser();

  if (user.role === "accountant") {
    return (
      <div>
        <PageHeader
          title="Help for accountants"
          description="How to review your client's records, ask the team questions and get what you need to file."
        />
        <div className="mt-8">
          <AccountantHelpGuide entityType={user.entityType} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="How to use this app"
        description="What to do first, how money moves through the app, and a simple weekly routine. Each part links to the screen it describes."
      />
      <div className="mt-8">
        <HelpGuide entityType={user.entityType} role={user.role} />
      </div>
    </div>
  );
}

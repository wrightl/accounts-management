import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { guardTenantPage } from "@/lib/auth";
import { can } from "@/lib/roles";
import { visibleSettingsPages, type SettingsPage } from "@/components/dashboard/nav";
import { NAV_ICONS } from "@/components/dashboard/nav-icons";

const SECTIONS: { id: SettingsPage["section"]; label: string }[] = [
  { id: "you", label: "You" },
  { id: "business", label: "Business" },
  { id: "team", label: "Team and records" },
];

export default async function SettingsHubPage() {
  const session = await guardTenantPage("accounts:read");
  const pages = visibleSettingsPages((permission) => can(session.role, permission));

  return (
    <div>
      <h1 className="mb-2 font-display text-2xl font-semibold">Settings</h1>
      <p className="mb-8 text-muted">
        Your own preferences, and the details and people behind the business.
      </p>
      <div className="max-w-2xl space-y-8">
        {SECTIONS.map((section) => {
          const items = pages.filter((page) => page.section === section.id);
          if (items.length === 0) return null;
          return (
            <section key={section.id} aria-labelledby={`settings-${section.id}`}>
              <h2
                id={`settings-${section.id}`}
                className="mb-3 font-display text-lg font-semibold"
              >
                {section.label}
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {items.map((page) => {
                  const Icon = NAV_ICONS[page.icon];
                  return (
                    <li key={page.href}>
                      <Link
                        href={page.href}
                        className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-wash"
                      >
                        <Icon className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-foreground">
                            {page.label}
                          </span>
                          <span className="block text-sm text-muted">
                            {page.description}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

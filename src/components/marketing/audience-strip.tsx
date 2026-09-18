import { Building2, Users, Briefcase } from "lucide-react";

const AUDIENCES = [
  {
    icon: Briefcase,
    title: "Consultancies",
    body: "Project work, milestones, and founder expenses without five spreadsheets.",
  },
  {
    icon: Users,
    title: "Studios & agencies",
    body: "Quotes that become orders and invoices — same line items, no retyping.",
  },
  {
    icon: Building2,
    title: "Ltd & sole traders",
    body: "Same day-to-day books. Limited companies also get shareholders and dividends.",
  },
] as const;

export function AudienceStrip() {
  return (
    <section className="border-y border-white/10 bg-navy px-6 py-14 text-white">
      <div className="mx-auto max-w-6xl">
        <p className="text-center text-sm tracking-widest text-brand uppercase">
          Who we built this for
        </p>
        <h2 className="mt-3 text-center font-display text-3xl font-normal tracking-tight md:text-4xl">
          UK consultancies, studios, and small agencies
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-white/70">
          We built Dot + Dash Accounts to get our own books out of spreadsheets,
          Drive folders, and emailed receipts — then opened it for firms like
          ours.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {AUDIENCES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/5 p-6"
            >
              <Icon className="h-6 w-6 text-brand" aria-hidden />
              <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/70">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

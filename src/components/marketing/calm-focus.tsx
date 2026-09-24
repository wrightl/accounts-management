import { Contrast, MousePointerClick, Type } from "lucide-react";

const POINTS = [
  {
    icon: MousePointerClick,
    title: "Quieter by default",
    body: "Plain language, a clear next step on empty screens, and success messages that pause when you hover — or stay until you dismiss them.",
  },
  {
    icon: Type,
    title: "Display you control",
    body: "On your Profile, set larger text, a readable typeface (Atkinson Hyperlegible), stronger contrast, and reduced motion — without changing company settings.",
  },
  {
    icon: Contrast,
    title: "Works with your tools",
    body: "Built to work with VoiceOver, TalkBack, magnification, and dictation on your phone or computer. We do not replace those apps; we stay out of their way.",
  },
] as const;

export function CalmFocusSection() {
  return (
    <section
      id="focus"
      className="scroll-mt-20 border-y border-border bg-white px-6 py-16 md:py-20"
    >
      <div className="mx-auto max-w-6xl">
        <p className="text-center text-sm tracking-widest text-navy/50 uppercase">
          Built for focus
        </p>
        <h2 className="mt-3 text-center font-display text-3xl font-normal tracking-tight md:text-4xl">
          Books without the noise
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted">
          Alfa is for UK founders and small startups — including neurodiverse
          people who want day-to-day books that respect attention, not fight it.
        </p>
        <ul className="mx-auto mt-12 grid max-w-5xl gap-10 md:grid-cols-3">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <Icon className="h-6 w-6 text-navy" aria-hidden />
              <h3 className="mt-4 font-display text-lg font-semibold text-navy">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

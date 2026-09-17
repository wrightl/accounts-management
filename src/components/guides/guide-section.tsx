export function GuideSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="scroll-mt-8">
      <h2
        id={id}
        className="scroll-mt-8 font-display text-2xl font-semibold text-foreground"
      >
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function GuideSubsection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <h3
        id={id}
        className="scroll-mt-8 text-lg font-semibold text-foreground"
      >
        {title}
      </h3>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

export function GuideParagraph({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-foreground/90">{children}</p>;
}

export function GuideBulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 text-sm text-foreground/90">
      {items.map((item, i) => (
        <li key={i} className="leading-relaxed">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function GuideWarning({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-yellow-600/20 bg-yellow-50 p-4">
      <p className="text-sm leading-relaxed text-yellow-900">{children}</p>
    </div>
  );
}

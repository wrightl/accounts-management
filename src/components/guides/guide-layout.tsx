"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Section = {
  id: string;
  title: string;
};

export function GuideLayout({
  title,
  description,
  sections,
  children,
}: {
  title: string;
  description: string;
  sections: Section[];
  children: React.ReactNode;
}) {
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        rootMargin: "-80px 0px -80% 0px",
      }
    );

    sections.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [sections]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-12">
        <div className="max-w-3xl">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            {description}
          </p>

          <div className="mt-10 space-y-12">{children}</div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-8">
            <nav aria-label="Table of contents">
              <h2 className="text-sm font-semibold text-foreground">
                On this page
              </h2>
              <ul className="mt-4 space-y-2">
                {sections.map(({ id, title }) => (
                  <li key={id}>
                    <Link
                      href={`#${id}`}
                      className={cn(
                        "block text-sm transition-colors",
                        activeSection === id
                          ? "font-medium text-navy"
                          : "text-muted hover:text-foreground"
                      )}
                    >
                      {title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>
      </div>
    </div>
  );
}

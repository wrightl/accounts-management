"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

export function ProductVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const play = () => {
    const el = videoRef.current;
    if (!el) return;
    void el.play();
    setPlaying(true);
  };

  return (
    <section id="product" className="scroll-mt-20 bg-white px-6 py-16 md:py-20">
      <div className="mx-auto max-w-5xl text-center">
        <p className="text-sm tracking-widest text-navy/60 uppercase">Product tour</p>
        <h2 className="mt-3 font-display text-3xl font-normal tracking-tight md:text-4xl">
          See the books in motion
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-muted">
          A short look at the dashboard, quote-to-invoice path, and expense
          capture — recorded from the live product with demo data.
        </p>

        <div className="relative mx-auto mt-10 overflow-hidden rounded-2xl border border-border bg-navy shadow-lg">
          {reducedMotion ? (
            <Image
              src="/marketing/poster.png"
              alt="Product tour poster — Accounts dashboard"
              width={1440}
              height={900}
              className="h-auto w-full"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                className="h-auto w-full"
                poster="/marketing/poster.png"
                controls={playing}
                playsInline
                preload="metadata"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              >
                <source src="/marketing/tour.mp4" type="video/mp4" />
                <source src="/marketing/tour.webm" type="video/webm" />
              </video>
              {!playing ? (
                <button
                  type="button"
                  onClick={play}
                  className="absolute inset-0 flex items-center justify-center bg-navy/30 transition hover:bg-navy/40"
                  aria-label="Play product tour"
                >
                  <span
                    className={buttonClasses(
                      "primary",
                      "pointer-events-none gap-2 px-6 py-3 text-base shadow-lg",
                    )}
                  >
                    <Play className="h-5 w-5 fill-current" aria-hidden />
                    Play tour
                  </span>
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

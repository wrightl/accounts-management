"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SIGN_UP_PATH } from "@/lib/marketing-analytics";
import { TrackedSignUpLink } from "@/components/marketing/tracked-sign-up-link";

type PricingAwareSignUpLinkProps = {
  location: "header" | "footer";
  className?: string;
  children: React.ReactNode;
};

export function PricingAwareSignUpLink({
  location,
  className,
  children,
}: PricingAwareSignUpLinkProps) {
  const pathname = usePathname();
  if (pathname === "/pricing") {
    return (
      <TrackedSignUpLink location={location} className={className}>
        {children}
      </TrackedSignUpLink>
    );
  }
  return (
    <Link href={SIGN_UP_PATH} className={className}>
      {children}
    </Link>
  );
}

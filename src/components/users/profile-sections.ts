import type { SettingsSection } from "@/components/settings/settings-section-nav";

/** Sections of the profile page, shared by the app and platform profiles. */
export const PROFILE_SECTIONS: SettingsSection[] = [
  { id: "photo", label: "Profile picture" },
  { id: "details", label: "Name and email" },
  { id: "display", label: "Display and focus" },
  { id: "session", label: "Session" },
];

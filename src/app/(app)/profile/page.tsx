import { requireUser, safeCurrentUser } from "@/lib/auth";
import { findLocalUser } from "@/lib/users";
import { ProfileForm } from "@/components/users/profile-form";
import { ProfilePictureField } from "@/components/users/profile-picture-field";
import { SignOutSection } from "@/components/users/sign-out-section";
import { UiPrefsForm } from "@/components/users/ui-prefs-form";
import {
  SettingsPageHeader,
  SETTINGS_FORM_WIDTH,
} from "@/components/settings/settings-page-header";
import { SettingsWithRail } from "@/components/settings/settings-section-nav";
import { PROFILE_SECTIONS } from "@/components/users/profile-sections";

export default async function ProfilePage() {
  const session = await requireUser();

  const local = await findLocalUser(session.userId);
  if (!local) {
    return (
      <div>
        <SettingsPageHeader
          title="Profile and display"
          description="Your profile could not be loaded."
        />
        <div className={SETTINGS_FORM_WIDTH}>
          <SignOutSection />
        </div>
      </div>
    );
  }

  return (
    <div>
      <SettingsWithRail
        sections={PROFILE_SECTIONS}
        header={
          <SettingsPageHeader
            title="Profile and display"
            description="Your name, photo, and how the app looks, moves, and shows dates."
          />
        }
      >
        <div className="space-y-8">
          <section id="photo" className="scroll-mt-8">
            <ProfilePictureField
              avatarUrl={(await safeCurrentUser())?.imageUrl ?? null}
              userName={session.name ?? local.name}
            />
          </section>
          <section id="details" className="scroll-mt-8">
            <ProfileForm
              email={local.email}
              name={session.name ?? local.name}
              role={local.role}
            />
          </section>
          <section id="display" className="scroll-mt-8">
            <UiPrefsForm prefs={local.uiPrefs} />
          </section>
          <section id="session" className="scroll-mt-8">
            <SignOutSection />
          </section>
        </div>
      </SettingsWithRail>
    </div>
  );
}

import { requireUser, safeCurrentUser } from "@/lib/auth";
import { findLocalUser } from "@/lib/users";
import { ProfileForm } from "@/components/users/profile-form";
import { ProfilePictureField } from "@/components/users/profile-picture-field";
import { SignOutSection } from "@/components/users/sign-out-section";
import { UiPrefsForm } from "@/components/users/ui-prefs-form";
import { SettingsPageHeader, SETTINGS_FORM_WIDTH } from "@/components/settings/settings-page-header";

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
      <SettingsPageHeader
        title="Profile and display"
        description="Your name, photo, and how the app looks and moves."
      />
      <div className={`${SETTINGS_FORM_WIDTH} space-y-8`}>
        <ProfilePictureField
          avatarUrl={(await safeCurrentUser())?.imageUrl ?? null}
          userName={session.name ?? local.name}
        />
        <ProfileForm
          email={local.email}
          name={session.name ?? local.name}
          role={local.role}
        />
        <UiPrefsForm prefs={local.uiPrefs} />
        <SignOutSection />
      </div>
    </div>
  );
}

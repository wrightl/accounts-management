import { requirePlatformAdmin } from "@/lib/platform";
import { safeCurrentUser } from "@/lib/auth";
import { ensureLocalUser, findLocalUser } from "@/lib/users";
import { ProfileForm } from "@/components/users/profile-form";
import { ProfilePictureField } from "@/components/users/profile-picture-field";
import { PasswordSection } from "@/components/users/password-section";
import { SignOutSection } from "@/components/users/sign-out-section";
import { UiPrefsForm } from "@/components/users/ui-prefs-form";
import { hasDatabaseClient } from "@/db";
import { SettingsWithRail } from "@/components/settings/settings-section-nav";
import { PROFILE_SECTIONS } from "@/components/users/profile-sections";
import { PAGE_WIDTH } from "@/components/ui/page-width";

export default async function PlatformProfilePage() {
  const session = await requirePlatformAdmin();

  if (hasDatabaseClient()) {
    await ensureLocalUser(session);
  }

  const local = await findLocalUser(session.userId);
  if (!local) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Profile</h1>
        <p className="mt-2 text-muted">Your profile could not be loaded.</p>
        <div className={`mt-8 ${PAGE_WIDTH.reading}`}>
          <SignOutSection />
        </div>
      </div>
    );
  }

  return (
    <div>
      <SettingsWithRail
        sections={PROFILE_SECTIONS}
        headerBackground="bg-wash"
        header={<h1 className="mb-6 font-display text-2xl font-semibold">Profile</h1>}
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
              roleDisplay="Platform operator"
            />
          </section>
          <section id="password" className="scroll-mt-8">
            <PasswordSection />
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

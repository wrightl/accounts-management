import { requireUser, safeCurrentUser } from "@/lib/auth";
import { findLocalUser } from "@/lib/users";
import { ProfileForm } from "@/components/users/profile-form";
import { ProfilePictureField } from "@/components/users/profile-picture-field";
import { SignOutSection } from "@/components/users/sign-out-section";
import { UiPrefsForm } from "@/components/users/ui-prefs-form";

export default async function ProfilePage() {
  const session = await requireUser();

  const local = await findLocalUser(session.userId);
  if (!local) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Profile</h1>
        <p className="mt-2 text-muted">Your profile could not be loaded.</p>
        <div className="mx-auto mt-8 max-w-xl">
          <SignOutSection />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-semibold">Profile</h1>
      <div className="mx-auto max-w-xl space-y-8">
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

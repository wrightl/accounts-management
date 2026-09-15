import { requireUser } from "@/lib/auth";
import { findLocalUser } from "@/lib/users";
import { ProfileForm } from "@/components/users/profile-form";
import { ProfilePictureField } from "@/components/users/profile-picture-field";
import { SignOutSection } from "@/components/users/sign-out-section";
import { isAuthConfigured, isDatabaseConfigured } from "@/env";
import { currentUser } from "@clerk/nextjs/server";

export default async function ProfilePage() {
  const session = await requireUser();
  const showSignOut = isAuthConfigured();

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Profile</h1>
        <p className="mt-2 text-muted">Connect a database to edit your profile.</p>
        {showSignOut ? (
          <div className="mx-auto mt-8 max-w-xl">
            <SignOutSection />
          </div>
        ) : null}
      </div>
    );
  }

  const local = await findLocalUser(session.userId);
  if (!local) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Profile</h1>
        <p className="mt-2 text-muted">Your profile could not be loaded.</p>
        {showSignOut ? (
          <div className="mx-auto mt-8 max-w-xl">
            <SignOutSection />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-semibold">Profile</h1>
      <div className="mx-auto max-w-xl space-y-8">
        <ProfilePictureField
          avatarUrl={(await currentUser())?.imageUrl ?? null}
          userName={session.name ?? local.name}
          clerkConfigured={isAuthConfigured()}
        />
        <ProfileForm
          email={local.email}
          name={session.name ?? local.name}
          role={local.role}
        />
        {showSignOut ? <SignOutSection /> : null}
      </div>
    </div>
  );
}

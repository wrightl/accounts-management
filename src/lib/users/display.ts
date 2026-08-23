export type UserStatus = "invited" | "active";

export function userStatus(clerkUserId: string | null): UserStatus {
  return clerkUserId ? "active" : "invited";
}

export function userStatusLabel(status: UserStatus): string {
  return status === "active" ? "Active" : "Invited";
}

import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { listUsers } from "@/lib/users";
import { userStatus, userStatusLabel } from "@/lib/users/display";
import { isDatabaseConfigured } from "@/env";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { RevokeInviteButton } from "@/components/users/revoke-invite-button";
import { DeleteUserButton } from "@/components/users/delete-user-button";
import { roleLabel } from "@/lib/roles";
import { buttonClasses } from "@/components/ui/button";

export default async function UsersPage() {
    const session = await guardTenantPage('users:manage');

    if (!isDatabaseConfigured()) {
        return (
            <div>
                <h1 className="font-display text-2xl font-semibold">Users</h1>
                <p className="mt-2 text-muted">
                    Connect a database to manage roles.
                </p>
            </div>
        );
    }

    const rows = await listUsers(session.companyId);

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-display text-2xl font-semibold">Users</h1>
                <Link href="/dashboard/users/new" className={buttonClasses("primary")}>
                    Invite user
                </Link>
            </div>

            <div className="mt-6">
                {rows.length === 0 ? (
                    <p className="text-sm text-muted">
                        No users yet. Invite someone to get started.
                    </p>
                ) : (
                    <Table>
                        <THead>
                            <TR>
                                <TH>Name</TH>
                                <TH>Email</TH>
                                <TH>Status</TH>
                                <TH>Role</TH>
                                <TH>Actions</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {rows.map((u) => (
                                <TR key={u.id}>
                                    <TD className="font-medium">
                                        {u.name ?? '—'}
                                    </TD>
                                    <TD className="text-muted">{u.email}</TD>
                                    <TD className="text-muted">
                                        {userStatusLabel(userStatus(u.clerkUserId))}
                                    </TD>
                                    <TD className="text-muted">
                                        {roleLabel(u.role)}
                                        {u.clerkUserId === session.userId
                                            ? " (you)"
                                            : ""}
                                    </TD>
                                    <TD>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <Link
                                                href={`/dashboard/users/${u.id}/edit`}
                                                className="text-sm text-brand hover:underline"
                                            >
                                                Edit
                                            </Link>
                                            {!u.clerkUserId ? (
                                                <RevokeInviteButton
                                                    userId={u.id}
                                                    email={u.email}
                                                    appearance="link"
                                                />
                                            ) : u.clerkUserId !== session.userId ? (
                                                <DeleteUserButton
                                                    userId={u.id}
                                                    email={u.email}
                                                    appearance="link"
                                                />
                                            ) : null}
                                        </div>
                                    </TD>
                                </TR>
                            ))}
                        </TBody>
                    </Table>
                )}
            </div>
        </div>
    );
}

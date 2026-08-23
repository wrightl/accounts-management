import { guardPage } from '@/lib/auth';
import { listUsers } from '@/lib/users';
import { isDatabaseConfigured } from '@/env';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { UserRoleForm } from '@/components/users/role-form';
import { roleLabel } from '@/lib/roles';

export default async function UsersPage() {
    const session = await guardPage('users:manage');

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

    const rows = await listUsers();

    return (
        <div>
            <h1 className="font-display text-2xl font-semibold">Users</h1>

            <div className="mt-6">
                {rows.length === 0 ? (
                    <p className="text-sm text-muted">
                        No users have signed in yet.
                    </p>
                ) : (
                    <Table>
                        <THead>
                            <TR>
                                <TH>Name</TH>
                                <TH>Email</TH>
                                <TH>Role</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {rows.map((u) => (
                                <TR key={u.id}>
                                    <TD className="font-medium">
                                        {u.name ?? '—'}
                                    </TD>
                                    <TD className="text-muted">{u.email}</TD>
                                    <TD>
                                        <UserRoleForm
                                            userId={u.id}
                                            role={u.role}
                                            roleLabel={roleLabel(u.role)}
                                            isSelf={
                                                u.clerkUserId === session.userId
                                            }
                                        />
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

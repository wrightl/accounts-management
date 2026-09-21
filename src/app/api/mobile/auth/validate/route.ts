import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
    countCompanyMembers,
    getEntitlements,
} from '@/lib/billing/entitlements';
import { ensureCompanyBilling } from '@/lib/billing/company-billing';

export async function POST() {
    try {
        const user = await getCurrentUser();

        if (!user) {
            return NextResponse.json(
                { ok: false, error: 'Unauthorized' },
                { status: 401 },
            );
        }

        if (!user.companyId) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'No company associated with this user',
                    code: 'no_company',
                },
                { status: 403 },
            );
        }

        let billing = null;
        try {
            await ensureCompanyBilling(user.companyId);
            const entitlements = await getEntitlements(user.companyId);
            const userCount = await countCompanyMembers(user.companyId);
            billing = {
                plan: entitlements.plan,
                status: entitlements.status,
                readOnly: entitlements.readOnly,
                trialEndsAt: entitlements.trialEndsAt?.toISOString() ?? null,
                maxUsers: entitlements.maxUsers,
                userCount,
                vatExport: entitlements.vatExport,
                complimentary: entitlements.complimentary,
                reason: entitlements.reason,
            };
        } catch (err) {
            console.warn(
                JSON.stringify({
                    level: 'warn',
                    msg: 'mobile_billing_payload_failed',
                    error: err instanceof Error ? err.message : String(err),
                }),
            );
        }

        return NextResponse.json({
            success: true,
            user: {
                id: user.localUserId ?? user.userId,
                clerkUserId: user.userId,
                email: user.email ?? '',
                name: user.name ?? '',
                role: user.role,
                companyId: user.companyId,
                entityType: user.entityType,
                billing,
            },
        });
    } catch (error) {
        console.error('Auth validation error:', error);
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 },
        );
    }
}

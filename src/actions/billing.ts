'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { companyBilling } from '@/db/schema';
import type { ActionResult } from '@/actions/result';
import { appBaseUrl, getStripe } from '@/lib/billing/stripe';
import { isStripeConfigured, stripePriceId } from '@/lib/billing/catalog';
import { ensureCompanyBilling } from '@/lib/billing/company-billing';
import { applySubscriptionToCompany } from '@/lib/billing/sync';
import {
    shouldUpdateExistingSubscription,
    startCheckoutSession,
    startSignupCheckout,
    updateExistingSubscription,
} from '@/lib/billing/subscription-checkout';

const planSelectSchema = z.object({
    plan: z.enum(['essentials', 'premium']),
    interval: z.enum(['month', 'year']),
});

/**
 * Choose or change Essentials/Premium × month/year.
 * Active subscribers update in-place (prorated); others go through Checkout.
 */
export async function selectBillingPlan(
    formData: FormData,
): Promise<ActionResult> {
    const parsed = planSelectSchema.safeParse({
        plan: formData.get('plan'),
        interval: formData.get('interval'),
    });
    if (!parsed.success) {
        return {
            ok: false,
            error: 'Choose a valid plan and billing interval.',
        };
    }
    if (!(await isStripeConfigured())) {
        return {
            ok: false,
            error: 'Billing is not configured yet. Contact support.',
        };
    }

    const { requireActionPermission } = await import('@/lib/auth');
    const authz = await requireActionPermission('settings:manage');
    if (!authz.ok) return authz;
    if (!authz.user.companyId) {
        return { ok: false, error: 'Complete onboarding first.' };
    }

    const companyId = authz.user.companyId;
    await ensureCompanyBilling(companyId);

    const db = getDb();
    const [billing] = await db
        .select()
        .from(companyBilling)
        .where(eq(companyBilling.companyId, companyId))
        .limit(1);

    if (billing?.access === 'complimentary_unlimited') {
        const now = new Date();
        if (
            !billing.complimentaryExpiresAt ||
            billing.complimentaryExpiresAt.getTime() > now.getTime()
        ) {
            return {
                ok: false,
                error: 'Complimentary access cannot be changed here.',
            };
        }
    }

    const price = await stripePriceId(parsed.data.plan, parsed.data.interval);

    if (shouldUpdateExistingSubscription(billing)) {
        return updateExistingSubscription({
            companyId,
            subscriptionId: billing!.stripeSubscriptionId!,
            priceId: price,
            plan: parsed.data.plan,
        });
    }

    return startCheckoutSession({
        companyId,
        billing,
        plan: parsed.data,
        priceId: price,
        actorEmail: authz.user.email,
    });
}

/** @deprecated Prefer {@link selectBillingPlan}. */
export async function createCheckoutSession(
    formData: FormData,
): Promise<ActionResult> {
    return selectBillingPlan(formData);
}

/**
 * The signed-in admin's company, for the subscribe gate. Paying for the
 * company or moving it to a trial is a billing decision, so it needs the
 * same permission as the rest of billing.
 */
async function requireSubscribeGateCompany(): Promise<
    { ok: true; companyId: string; email: string | null } | { ok: false; error: string }
> {
    const { requireActionPermission } = await import('@/lib/auth');
    const authz = await requireActionPermission('settings:manage');
    if (!authz.ok) return authz;
    if (!authz.user.companyId) {
        return { ok: false, error: 'Complete onboarding first.' };
    }
    return { ok: true, companyId: authz.user.companyId, email: authz.user.email };
}

/** Retry Checkout from the subscribe gate for unpaid companies. */
export async function retrySignupCheckout(): Promise<ActionResult> {
    if (!(await isStripeConfigured())) {
        return {
            ok: false,
            error: 'Billing is not configured yet. Contact support.',
        };
    }

    const gate = await requireSubscribeGateCompany();
    if (!gate.ok) return gate;
    const { companyId } = gate;

    const db = getDb();
    const [billing] = await db
        .select()
        .from(companyBilling)
        .where(eq(companyBilling.companyId, companyId))
        .limit(1);

    if (!billing || billing.status !== 'unpaid') {
        return { ok: false, error: 'No unpaid subscription to complete.' };
    }
    if (billing.plan !== 'essentials' && billing.plan !== 'premium') {
        return {
            ok: false,
            error: 'Choose Essentials or Premium to continue.',
        };
    }
    const interval = billing.billingInterval === 'year' ? 'year' : 'month';

    return startSignupCheckout({
        companyId,
        plan: billing.plan,
        interval,
        actorEmail: gate.email,
    });
}

export async function switchSignupToTrial(): Promise<ActionResult> {
    const gate = await requireSubscribeGateCompany();
    if (!gate.ok) return gate;
    const { companyId } = gate;

    const { switchUnpaidCompanyToTrial } =
        await import('@/lib/billing/company-billing');
    const result = await switchUnpaidCompanyToTrial(companyId);
    if (!result.ok) return result;

    try {
        const { sendBillingEmail } = await import('@/lib/billing/emails');
        await sendBillingEmail(
            companyId,
            'trial_welcome',
            `welcome_${companyId}`,
        );
    } catch {
        /* best-effort */
    }

    redirect('/dashboard');
}

async function requireCompanyBillingAuth(): Promise<
    { ok: true; companyId: string } | { ok: false; error: string }
> {
    if (!(await isStripeConfigured())) {
        return {
            ok: false,
            error: 'Billing is not configured yet. Contact support.',
        };
    }
    const { requireActionPermission } = await import('@/lib/auth');
    const authz = await requireActionPermission('settings:manage');
    if (!authz.ok) return authz;
    if (!authz.user.companyId) {
        return { ok: false, error: 'Complete onboarding first.' };
    }
    return { ok: true, companyId: authz.user.companyId };
}

async function loadCompanyBillingRow(companyId: string) {
    await ensureCompanyBilling(companyId);
    const db = getDb();
    const [billing] = await db
        .select()
        .from(companyBilling)
        .where(eq(companyBilling.companyId, companyId))
        .limit(1);
    return billing;
}

export async function createPaymentMethodPortalSession(): Promise<ActionResult> {
    const auth = await requireCompanyBillingAuth();
    if (!auth.ok) return auth;

    const billing = await loadCompanyBillingRow(auth.companyId);
    if (!billing?.stripeCustomerId) {
        return {
            ok: false,
            error: 'No billing account yet. Choose a plan first.',
        };
    }

    const stripe = getStripe();
    const base = appBaseUrl();
    const portal = await stripe.billingPortal.sessions.create({
        customer: billing.stripeCustomerId,
        return_url: `${base}/settings/billing`,
        flow_data: {
            type: 'payment_method_update',
        },
    });
    if (!portal.url) {
        return {
            ok: false,
            error: 'Could not open Stripe to update your card.',
        };
    }
    redirect(portal.url);
}

export async function cancelSubscriptionAtPeriodEnd(): Promise<ActionResult> {
    const auth = await requireCompanyBillingAuth();
    if (!auth.ok) return auth;

    const billing = await loadCompanyBillingRow(auth.companyId);
    if (!billing?.stripeSubscriptionId) {
        return { ok: false, error: 'No active subscription to cancel.' };
    }
    if (billing.status === 'canceled' || billing.status === 'unpaid') {
        return { ok: false, error: 'Subscription is already inactive.' };
    }
    if (billing.cancelAtPeriodEnd) {
        return { ok: false, error: 'Cancellation is already scheduled.' };
    }

    try {
        const stripe = getStripe();
        const updated = await stripe.subscriptions.update(
            billing.stripeSubscriptionId,
            { cancel_at_period_end: true },
        );
        await applySubscriptionToCompany(auth.companyId, updated);
        return { ok: true, id: updated.id };
    } catch (err) {
        return {
            ok: false,
            error:
                err instanceof Error
                    ? err.message
                    : 'Could not schedule cancellation.',
        };
    }
}

export async function resumeSubscription(): Promise<ActionResult> {
    const auth = await requireCompanyBillingAuth();
    if (!auth.ok) return auth;

    const billing = await loadCompanyBillingRow(auth.companyId);
    if (!billing?.stripeSubscriptionId) {
        return { ok: false, error: 'No subscription to resume.' };
    }
    if (!billing.cancelAtPeriodEnd) {
        return { ok: false, error: 'Subscription is not scheduled to cancel.' };
    }

    try {
        const stripe = getStripe();
        const updated = await stripe.subscriptions.update(
            billing.stripeSubscriptionId,
            { cancel_at_period_end: false },
        );
        await applySubscriptionToCompany(auth.companyId, updated);
        return { ok: true, id: updated.id };
    } catch (err) {
        return {
            ok: false,
            error:
                err instanceof Error
                    ? err.message
                    : 'Could not resume subscription.',
        };
    }
}

'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { companies, companyBilling, type CompanyBilling } from '@/db/schema';
import type { ActionResult } from '@/actions/result';
import {
    appBaseUrl,
    checkoutIntegrationId,
    getStripe,
    stripeTaxEnabled,
} from '@/lib/billing/stripe';
import { isStripeConfigured, stripePriceId } from '@/lib/billing/catalog';
import { ensureCompanyBilling } from '@/lib/billing/company-billing';
import { TRIAL_DAYS } from '@/lib/billing/constants';
import { applySubscriptionToCompany } from '@/lib/billing/sync';

const planSelectSchema = z.object({
    plan: z.enum(['essentials', 'premium']),
    interval: z.enum(['month', 'year']),
});

type PlanSelect = z.infer<typeof planSelectSchema>;

/** True when we should update the existing Stripe subscription instead of Checkout. */
function shouldUpdateExistingSubscription(
    billing: CompanyBilling | undefined,
): boolean {
    if (!billing?.stripeSubscriptionId) return false;
    return billing.status !== 'canceled' && billing.status !== 'unpaid';
}

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
 * Start Checkout for a company that chose a paid plan at sign-up.
 * Collects a card now; Stripe subscription includes a 30-day trial
 * before the first charge.
 */
export async function startSignupCheckout(args: {
    companyId: string;
    plan: 'essentials' | 'premium';
    interval: 'month' | 'year';
    actorEmail: string | null | undefined;
}): Promise<ActionResult> {
    if (!(await isStripeConfigured())) {
        return {
            ok: false,
            error: 'Billing is not configured yet. Contact support.',
        };
    }

    const db = getDb();
    const [billing] = await db
        .select()
        .from(companyBilling)
        .where(eq(companyBilling.companyId, args.companyId))
        .limit(1);

    const price = await stripePriceId(args.plan, args.interval);
    const base = appBaseUrl();

    return startCheckoutSession({
        companyId: args.companyId,
        billing,
        plan: { plan: args.plan, interval: args.interval },
        priceId: price,
        actorEmail: args.actorEmail,
        trialPeriodDays: TRIAL_DAYS,
        successUrl: `${base}/subscribe/return?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${base}/subscribe?checkout=cancel`,
    });
}

/** Retry Checkout from the subscribe gate for unpaid companies. */
export async function retrySignupCheckout(): Promise<ActionResult> {
    if (!(await isStripeConfigured())) {
        return {
            ok: false,
            error: 'Billing is not configured yet. Contact support.',
        };
    }

    const { requireUser } = await import('@/lib/auth');
    const { findLocalUser, ensureLocalUser } = await import('@/lib/users');
    const session = await requireUser();
    await ensureLocalUser(session);
    const local = await findLocalUser(session.userId);
    const companyId = local?.companyId ?? session.companyId;
    if (!companyId) {
        return { ok: false, error: 'Complete onboarding first.' };
    }

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
        actorEmail: session.email,
    });
}

export async function switchSignupToTrial(): Promise<ActionResult> {
    const { requireUser } = await import('@/lib/auth');
    const { findLocalUser, ensureLocalUser } = await import('@/lib/users');
    const session = await requireUser();
    await ensureLocalUser(session);
    const local = await findLocalUser(session.userId);
    const companyId = local?.companyId ?? session.companyId;
    if (!companyId) {
        return { ok: false, error: 'Complete onboarding first.' };
    }

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

async function updateExistingSubscription(args: {
    companyId: string;
    subscriptionId: string;
    priceId: string;
    plan: 'essentials' | 'premium';
}): Promise<ActionResult> {
    const stripe = getStripe();
    let sub;
    try {
        sub = await stripe.subscriptions.retrieve(args.subscriptionId);
    } catch {
        return {
            ok: false,
            error: 'Could not load your subscription. Contact support.',
        };
    }

    if (sub.status === 'canceled') {
        return {
            ok: false,
            error: 'That subscription is canceled. Choose a plan to start a new one.',
        };
    }

    const item = sub.items?.data?.[0];
    if (!item?.id) {
        return { ok: false, error: 'Subscription has no billable item.' };
    }

    const currentPriceId =
        typeof item.price === 'string' ? item.price : item.price?.id;
    if (currentPriceId === args.priceId) {
        return { ok: false, error: 'You are already on this plan.' };
    }

    try {
        const updated = await stripe.subscriptions.update(args.subscriptionId, {
            items: [{ id: item.id, price: args.priceId }],
            proration_behavior: 'create_prorations',
            cancel_at_period_end: false,
            metadata: {
                ...sub.metadata,
                companyId: args.companyId,
                plan: args.plan,
            },
        });
        await applySubscriptionToCompany(args.companyId, updated);
        return { ok: true, id: updated.id };
    } catch (err) {
        const message =
            err instanceof Error ? err.message : 'Could not update your plan.';
        return { ok: false, error: message };
    }
}

async function startCheckoutSession(args: {
    companyId: string;
    billing: CompanyBilling | undefined;
    plan: PlanSelect;
    priceId: string;
    actorEmail: string | null | undefined;
    /**
     * Explicit trial length for Checkout (e.g. paid sign-up).
     * When omitted, remaining app trial days are used if status is trialing.
     */
    trialPeriodDays?: number;
    successUrl?: string;
    cancelUrl?: string;
}): Promise<ActionResult> {
    if (shouldUpdateExistingSubscription(args.billing)) {
        return {
            ok: false,
            error: 'Use Change plan to switch tiers on your current subscription.',
        };
    }

    const db = getDb();
    const [company] = await db
        .select({
            name: companies.name,
            email: companies.email,
            vatNumber: companies.vatNumber,
        })
        .from(companies)
        .where(eq(companies.id, args.companyId))
        .limit(1);

    const stripe = getStripe();
    let customerId = args.billing?.stripeCustomerId ?? null;
    if (!customerId) {
        const customer = await stripe.customers.create({
            email: company?.email ?? args.actorEmail ?? undefined,
            name: company?.name ?? undefined,
            metadata: { companyId: args.companyId },
        });
        customerId = customer.id;
        if (company?.vatNumber) {
            try {
                await stripe.customers.createTaxId(customerId, {
                    type: 'gb_vat',
                    value: company.vatNumber,
                });
            } catch {
                // Invalid VAT on file — Checkout still works without it.
            }
        }
        await db
            .update(companyBilling)
            .set({ stripeCustomerId: customerId, updatedAt: new Date() })
            .where(eq(companyBilling.companyId, args.companyId));
    }

    const base = appBaseUrl();

    let trialDays: number | undefined;
    if (typeof args.trialPeriodDays === 'number' && args.trialPeriodDays > 0) {
        trialDays = Math.min(args.trialPeriodDays, 30);
    } else if (
        args.billing?.status === 'trialing' &&
        args.billing.trialEndsAt
    ) {
        const remainingMs = args.billing.trialEndsAt.getTime() - Date.now();
        const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
        if (days > 0) trialDays = Math.min(days, 30);
    }

    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] =
        {
            mode: 'subscription',
            customer: customerId,
            line_items: [{ price: args.priceId, quantity: 1 }],
            success_url:
                args.successUrl ?? `${base}/settings/billing?checkout=success`,
            cancel_url:
                args.cancelUrl ?? `${base}/settings/billing?checkout=cancel`,
            client_reference_id: args.companyId,
            metadata: { companyId: args.companyId, plan: args.plan.plan },
            subscription_data: {
                metadata: { companyId: args.companyId, plan: args.plan.plan },
                ...(trialDays ? { trial_period_days: trialDays } : {}),
            },
            allow_promotion_codes: false,
            billing_address_collection: 'required',
            tax_id_collection: { enabled: true },
            customer_update: {
                address: 'auto' as const,
                name: 'auto' as const,
            },
            ...(stripeTaxEnabled() ? { automatic_tax: { enabled: true } } : {}),
        };
    (sessionParams as Record<string, unknown>).integration_identifier =
        checkoutIntegrationId('billing_checkout');

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
        return { ok: false, error: 'Could not start Checkout. Try again.' };
    }
    redirect(session.url);
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

'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Textarea } from '@/components/ui/form';
import { scheduleFocusFirstFieldError } from '@/components/ui/focus-first-field-error';
import { preventResetSubmit } from '@/components/ui/prevent-reset-submit';
import { useFieldErrors } from '@/components/ui/use-field-errors';
import {
    addCompanySupportNote,
    platformInviteCompanyAdmin,
    suspendCompany,
    unsuspendCompany,
} from '@/actions/platform';
import { toast } from '@/components/ui/toast';
import {
    companyInviteAdminRawFromFormData,
    parseCompanyInviteAdminInput,
    parseCompanySupportNoteInput,
    parseSuspendCompanyInput,
} from '@/lib/platform/schema';

export function CompanySuspendForm({
    companyId,
    suspended,
}: {
    companyId: string;
    suspended: boolean;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const {
        fieldErrors,
        error,
        clearAll,
        clearField,
        applyFail,
        applyActionResult,
    } = useFieldErrors();
    const containerRef = useRef<HTMLDivElement>(null);
    const [reason, setReason] = useState('');

    return (
        <div
            ref={containerRef}
            className="rounded-2xl border border-border bg-white p-5"
        >
            <h2 className="font-display text-lg font-semibold">
                {suspended ? 'Unsuspend company' : 'Suspend company'}
            </h2>
            <p className="mt-1 text-sm text-muted">
                Suspended companies cannot write data or send outbound email via
                cron.
            </p>
            {!suspended ? (
                <div className="mt-3">
                    <Label htmlFor="suspendReason">Reason (optional)</Label>
                    <Input
                        id="suspendReason"
                        value={reason}
                        onChange={(e) => {
                            setReason(e.target.value);
                            clearField('reason');
                        }}
                        disabled={pending}
                        aria-invalid={Boolean(fieldErrors.reason)}
                        aria-describedby={
                            fieldErrors.reason
                                ? 'suspendReason-error'
                                : undefined
                        }
                    />
                    <FieldError id="suspendReason-error">
                        {fieldErrors.reason}
                    </FieldError>
                </div>
            ) : null}
            <FieldError>{error}</FieldError>
            <Button
                type="button"
                variant={suspended ? 'primary' : 'destructive'}
                className="mt-4"
                disabled={pending}
                onClick={() => {
                    clearAll();
                    if (!suspended) {
                        const clientParsed = parseSuspendCompanyInput({
                            companyId,
                            reason,
                        });
                        if (!clientParsed.ok) {
                            applyFail(clientParsed);
                            scheduleFocusFirstFieldError(
                                containerRef.current,
                                clientParsed.fieldErrors,
                            );
                            return;
                        }
                    }
                    start(async () => {
                        const result = suspended
                            ? await unsuspendCompany(companyId)
                            : await suspendCompany(companyId, reason);
                        if (applyActionResult(result)) {
                            router.refresh();
                        } else if (!result.ok) {
                            scheduleFocusFirstFieldError(
                                containerRef.current,
                                result.fieldErrors,
                            );
                        }
                    });
                }}
            >
                {suspended ? 'Unsuspend' : 'Suspend'}
            </Button>
        </div>
    );
}

export function CompanySupportNoteForm({ companyId }: { companyId: string }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const {
        fieldErrors,
        error,
        clearAll,
        clearField,
        applyFail,
        applyActionResult,
    } = useFieldErrors();
    const formRef = useRef<HTMLFormElement>(null);
    const [body, setBody] = useState('');

    return (
        <form
            ref={formRef}
            noValidate
            className="mt-3 space-y-2"
            onSubmit={preventResetSubmit(() => {
                clearAll();
                const clientParsed = parseCompanySupportNoteInput({
                    companyId,
                    body,
                });
                if (!clientParsed.ok) {
                    applyFail(clientParsed);
                    scheduleFocusFirstFieldError(
                        formRef.current,
                        clientParsed.fieldErrors,
                    );
                    return;
                }
                start(async () => {
                    const result = await addCompanySupportNote(companyId, body);
                    if (applyActionResult(result)) {
                        setBody('');
                        router.refresh();
                    } else if (!result.ok) {
                        scheduleFocusFirstFieldError(
                            formRef.current,
                            result.fieldErrors,
                        );
                    }
                });
            })}
        >
            <Label htmlFor="supportNoteBody" required>
                Support note
            </Label>
            <Textarea
                id="supportNoteBody"
                value={body}
                onChange={(e) => {
                    setBody(e.target.value);
                    clearField('body');
                }}
                rows={3}
                required
                placeholder="Add a support note…"
                disabled={pending}
                aria-invalid={Boolean(fieldErrors.body)}
                aria-describedby={
                    fieldErrors.body ? 'supportNoteBody-error' : undefined
                }
            />
            <FieldError id="supportNoteBody-error">
                {fieldErrors.body}
            </FieldError>
            <FieldError>{error}</FieldError>
            <Button type="submit" className="mt-2" disabled={pending}>
                Add note
            </Button>
        </form>
    );
}

export function CompanyInviteAdminForm({ companyId }: { companyId: string }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const {
        fieldErrors,
        error,
        clearAll,
        clearField,
        applyFail,
        applyActionResult,
    } = useFieldErrors();
    const formRef = useRef<HTMLFormElement>(null);

    return (
        <form
            ref={formRef}
            noValidate
            className="mt-3 space-y-3"
            onSubmit={preventResetSubmit((formData, form) => {
                clearAll();
                formData.set('companyId', companyId);
                const clientParsed = parseCompanyInviteAdminInput(
                    companyInviteAdminRawFromFormData(formData),
                );
                if (!clientParsed.ok) {
                    applyFail(clientParsed);
                    scheduleFocusFirstFieldError(
                        formRef.current,
                        clientParsed.fieldErrors,
                    );
                    return;
                }
                start(async () => {
                    const result = await platformInviteCompanyAdmin(formData);
                    if (applyActionResult(result)) {
                        toast('Invitation sent.');
                        form.reset();
                        router.refresh();
                    } else if (!result.ok) {
                        scheduleFocusFirstFieldError(
                            formRef.current,
                            result.fieldErrors,
                        );
                    }
                });
            })}
        >
            <input type="hidden" name="companyId" value={companyId} />
            <div>
                <Label htmlFor="companyInviteEmail" required>
                    Email
                </Label>
                <Input
                    id="companyInviteEmail"
                    name="email"
                    type="email"
                    required
                    disabled={pending}
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={
                        fieldErrors.email
                            ? 'companyInviteEmail-error'
                            : undefined
                    }
                    onChange={() => clearField('email')}
                />
                <FieldError id="companyInviteEmail-error">
                    {fieldErrors.email}
                </FieldError>
            </div>
            <div>
                <Label htmlFor="companyInviteName">Name (optional)</Label>
                <Input
                    id="companyInviteName"
                    name="name"
                    type="text"
                    disabled={pending}
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={
                        fieldErrors.name ? 'companyInviteName-error' : undefined
                    }
                    onChange={() => clearField('name')}
                />
                <FieldError id="companyInviteName-error">
                    {fieldErrors.name}
                </FieldError>
            </div>
            <FieldError>{error}</FieldError>
            <Button type="submit" disabled={pending}>
                Invite admin
            </Button>
        </form>
    );
}

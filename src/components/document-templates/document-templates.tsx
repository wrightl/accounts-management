"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRightLeft, Check, Copy, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import {
  convertDocumentTemplate,
  createDocumentTemplate,
  deleteDocumentTemplate,
  duplicateDocumentTemplate,
  selectDocumentTemplate,
} from "@/actions/document-templates";
import { DesignThumbnail } from "@/components/invoice-designer/design-thumbnail";
import { useAlert } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import type { DesignData } from "@/lib/pdf/designer/fields";
import type { TemplateDesign } from "@/lib/pdf/designer/schema";
import { DESIGN_STARTERS, type DesignStarterKey } from "@/lib/pdf/designer/starters";
import {
  DOCUMENT_KIND_LABELS,
  TEMPLATES,
  templateThumbnail,
  type DocumentKind,
  type TemplateKey,
} from "@/lib/pdf/templates/registry";
import { cn } from "@/lib/utils";

/** Tabs in the order the documents are raised: an invoice, a quote, then a credit note. */
const TABS: DocumentKind[] = ["invoice", "quote", "credit-note"];

const TAB_LABELS: Record<DocumentKind, string> = {
  invoice: "Invoices",
  quote: "Quotes",
  "credit-note": "Credit notes",
};

/** What a kind of document is drawn in: a standard template or one of the company's own. */
export type TemplateSelection =
  | { type: "standard"; key: TemplateKey }
  | { type: "custom"; id: string };

export interface CustomTemplate {
  id: string;
  name: string;
  kind: DocumentKind;
  design: TemplateDesign;
}

function sameSelection(a: TemplateSelection, b: TemplateSelection): boolean {
  return a.type === "standard"
    ? b.type === "standard" && a.key === b.key
    : b.type === "custom" && a.id === b.id;
}

const cardClasses = (checked: boolean, disabled: boolean) =>
  cn(
    "block flex-1 rounded-xl border p-3 transition-colors",
    checked ? "border-navy ring-2 ring-navy" : "border-border hover:border-navy/50",
    disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
  );

const iconAction =
  "inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-wash hover:text-foreground disabled:opacity-40";

/**
 * Every template a company can use, by kind of document: the standard ones
 * and its own designs together. Choosing one saves straight away.
 */
export function DocumentTemplates({
  initialKind,
  selections,
  customTemplates,
  sampleData,
  hasLogo,
  canUseLibrary,
  canUseDesigner,
}: {
  initialKind: DocumentKind;
  /** What each kind of document uses now. */
  selections: Record<DocumentKind, TemplateSelection>;
  customTemplates: CustomTemplate[];
  /** A made-up document of each kind with the company's details, for the pictures. */
  sampleData: Record<DocumentKind, DesignData>;
  hasLogo: boolean;
  canUseLibrary: boolean;
  canUseDesigner: boolean;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [kind, setKind] = useState<DocumentKind>(initialKind);
  // Shown at once when a card is chosen; put back if the save fails.
  const [chosen, setChosen] = useState(selections);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [converting, setConverting] = useState<CustomTemplate | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = chosen[kind];
  const label = DOCUMENT_KIND_LABELS[kind].toLowerCase();
  const own = customTemplates.filter((template) => template.kind === kind);

  const showKind = (next: DocumentKind) => {
    setKind(next);
    setError(null);
    window.history.replaceState(null, "", `?type=${next}`);
  };

  const choose = (selection: TemplateSelection) => {
    const previous = chosen[kind];
    if (pending || sameSelection(previous, selection)) return;
    const savedKind = kind;
    setError(null);
    setChosen((current) => ({ ...current, [savedKind]: selection }));
    startTransition(async () => {
      const result = await selectDocumentTemplate(
        selection.type === "standard"
          ? { kind: savedKind, templateKey: selection.key }
          : { kind: savedKind, customTemplateId: selection.id },
      );
      if (!result.ok) {
        setChosen((current) => ({ ...current, [savedKind]: previous }));
        setError(result.error);
        return;
      }
      toast(`${DOCUMENT_KIND_LABELS[savedKind]} template saved`);
      router.refresh();
    });
  };

  const duplicate = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await duplicateDocumentTemplate(id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  };

  const remove = async (template: CustomTemplate) => {
    const inUse = selected.type === "custom" && selected.id === template.id;
    const ok = await confirm({
      title: `Delete "${template.name}"?`,
      message: inUse
        ? `Your ${label}s use this template. New ${label}s will go back to the standard template. Documents already sent are not changed.`
        : "This template will be removed. Documents already sent are not changed.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteDocumentTemplate(template.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (inUse) {
        // The server falls back to the standard template kept on the company.
        setChosen((current) => ({ ...current, [template.kind]: selections[template.kind] }));
      }
      router.refresh();
    });
  };

  return (
    <div>
      <div role="tablist" aria-label="Kind of document" className="inline-flex rounded-full border border-border p-0.5">
        {TABS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            id={`templates-tab-${option}`}
            aria-selected={kind === option}
            aria-controls="templates-panel"
            onClick={() => showKind(option)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              kind === option ? "bg-navy text-white" : "text-muted hover:text-foreground",
            )}
          >
            {TAB_LABELS[option]}
          </button>
        ))}
      </div>

      <div id="templates-panel" role="tabpanel" aria-labelledby={`templates-tab-${kind}`} className="mt-5">
        <p className="text-sm text-muted">
          Choose the template your {label}s use. Your choice is saved straight away.{" "}
          {kind === "credit-note"
            ? "Credit notes are drawn in the current template each time they are downloaded."
            : `${TAB_LABELS[kind]} you have already sent keep the look they were sent with.`}
        </p>

        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <fieldset className="mt-4" disabled={pending}>
          <legend className="sr-only">Template for {label}s</legend>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((template) => {
              const checked = selected.type === "standard" && selected.key === template.key;
              const disabled = !canUseLibrary && !checked;
              return (
                <li key={template.key} className="flex flex-col">
                  <label className={cardClasses(checked, disabled)}>
                    <input
                      type="radio"
                      name={`template-${kind}`}
                      value={template.key}
                      checked={checked}
                      disabled={disabled}
                      onChange={() => choose({ type: "standard", key: template.key })}
                      className="sr-only"
                    />
                    <span className="block overflow-hidden rounded-lg border border-border bg-white">
                      <Image
                        src={templateThumbnail(template.key, kind)}
                        alt={`${template.name} ${label} with sample details`}
                        width={595}
                        height={842}
                        sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 100vw"
                        className="h-auto w-full"
                      />
                    </span>
                    <CardCaption name={template.name} checked={checked} note={template.description} />
                  </label>
                  <div className="mt-1 flex h-8 items-center px-1">
                    <a
                      href={`/api/document-templates/preview?template=${template.key}&kind=${kind}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm underline"
                      aria-label={`Preview ${template.name} ${label} as a PDF`}
                    >
                      Preview PDF
                    </a>
                  </div>
                </li>
              );
            })}

            {own.map((template) => {
              const checked = selected.type === "custom" && selected.id === template.id;
              return (
                <li key={template.id} className="flex flex-col">
                  <label className={cardClasses(checked, !canUseDesigner)}>
                    <input
                      type="radio"
                      name={`template-${kind}`}
                      value={template.id}
                      checked={checked}
                      disabled={!canUseDesigner}
                      onChange={() => choose({ type: "custom", id: template.id })}
                      className="sr-only"
                    />
                    <span className="block overflow-hidden rounded-lg border border-border bg-white">
                      <DesignThumbnail
                        design={template.design}
                        data={sampleData[kind]}
                        hasLogo={hasLogo}
                      />
                    </span>
                    <CardCaption name={template.name} checked={checked} note="Your own template" />
                  </label>
                  <div className="mt-1 flex h-8 items-center gap-1 px-1">
                    {canUseDesigner ? (
                      <>
                        <Link
                          href={`/settings/document-templates/${template.id}`}
                          className={iconAction}
                          aria-label={`Edit ${template.name}`}
                          title="Edit in the template designer"
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Link>
                        <button
                          type="button"
                          className={iconAction}
                          aria-label={`Duplicate ${template.name}`}
                          title="Duplicate"
                          onClick={() => duplicate(template.id)}
                        >
                          <Copy className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className={iconAction}
                          aria-label={`Convert ${template.name} to another type`}
                          title="Convert to another type"
                          onClick={() => setConverting(template)}
                        >
                          <ArrowRightLeft className="h-4 w-4" aria-hidden />
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className={iconAction}
                      aria-label={`Delete ${template.name}`}
                      title="Delete"
                      onClick={() => void remove(template)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                    {canUseDesigner ? (
                      <a
                        href={`/api/document-templates/preview?design=${template.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto text-sm underline"
                        aria-label={`Preview ${template.name} as a PDF`}
                      >
                        Preview PDF
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}

            <li>
              {canUseDesigner ? (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex aspect-[595/842] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-navy/40 p-4 text-center transition-colors hover:border-navy hover:bg-wash"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border border-navy/40">
                    <Plus className="h-6 w-6" aria-hidden />
                  </span>
                  <span className="font-medium">New {label} template</span>
                  <span className="text-sm text-muted">Design your own with drag and drop.</span>
                </button>
              ) : (
                <Link
                  href="/settings/billing"
                  className="flex aspect-[595/842] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-4 text-center transition-colors hover:border-navy/50 hover:bg-wash"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border text-muted">
                    <Plus className="h-6 w-6" aria-hidden />
                  </span>
                  <span className="font-medium">Design your own {label} template</span>
                  <span className="inline-flex items-center gap-1 text-sm text-muted">
                    <Lock className="h-3.5 w-3.5" aria-hidden /> Included in Premium. See plans.
                  </span>
                </Link>
              )}
            </li>
          </ul>
        </fieldset>
      </div>

      {creating ? <NewTemplateDialog kind={kind} onClose={() => setCreating(false)} /> : null}
      {converting ? (
        <ConvertTemplateDialog
          template={converting}
          onClose={() => setConverting(null)}
          onConverted={(target) => {
            setConverting(null);
            showKind(target);
            toast(`${DOCUMENT_KIND_LABELS[target]} template created`);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function CardCaption({ name, checked, note }: { name: string; checked: boolean; note: string }) {
  return (
    <>
      <span className="mt-3 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-medium">{name}</span>
        {checked ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-sm text-foreground">
            <Check className="h-4 w-4" aria-hidden />
            In use
          </span>
        ) : null}
      </span>
      <span className="mt-1 block text-sm text-muted">{note}</span>
    </>
  );
}

/** Copy one of the company's templates as a template for another kind of document. */
function ConvertTemplateDialog({
  template,
  onClose,
  onConverted,
}: {
  template: CustomTemplate;
  onClose: () => void;
  onConverted: (kind: DocumentKind) => void;
}) {
  const targets = TABS.filter((option) => option !== template.kind);
  const [target, setTarget] = useState<DocumentKind>(targets[0]);
  const [name, setName] = useState(template.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const from = DOCUMENT_KIND_LABELS[template.kind].toLowerCase();

  const convert = () => {
    setError(null);
    startTransition(async () => {
      const result = await convertDocumentTemplate(template.id, { kind: target, name });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onConverted(target);
    });
  };

  return (
    <Dialog open onClose={onClose} title={`Convert "${template.name}"`}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          convert();
        }}
      >
        <fieldset disabled={pending}>
          <legend className="mb-2 text-sm font-medium">Convert this {from} template to</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {targets.map((option) => (
              <label
                key={option}
                className={cn(
                  "cursor-pointer rounded-xl border p-3 text-sm",
                  target === option
                    ? "border-navy ring-2 ring-navy"
                    : "border-border hover:border-navy/50",
                )}
              >
                <input
                  type="radio"
                  name="convert-to"
                  value={option}
                  checked={target === option}
                  onChange={() => setTarget(option)}
                  className="sr-only"
                />
                <span className="block font-medium">{DOCUMENT_KIND_LABELS[option]}</span>
                <span className="mt-1 block text-muted">
                  A new {DOCUMENT_KIND_LABELS[option].toLowerCase()} template with the same look.
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4">
          <Label htmlFor="convert-template-name" required>
            Name of the new template
          </Label>
          <Input
            id="convert-template-name"
            value={name}
            maxLength={80}
            required
            disabled={pending}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "convert-template-error" : undefined}
          />
          <FieldError id="convert-template-error">{error}</FieldError>
        </div>

        <p className="mt-4 text-sm text-muted">
          This {from} template is kept as it is. In the new one, fields such as the {from} number
          switch to their {DOCUMENT_KIND_LABELS[target].toLowerCase()} equivalent, and fields with
          no equivalent are removed. Check the wording in the designer afterwards.
        </p>

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Working…" : "Convert"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** Name a new template of this kind, pick what it starts from, and open it in the designer. */
function NewTemplateDialog({ kind, onClose }: { kind: DocumentKind; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [starter, setStarter] = useState<DesignStarterKey>("clean");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = DOCUMENT_KIND_LABELS[kind].toLowerCase();

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createDocumentTemplate({ name, starter, kind });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/settings/document-templates/${result.id}`);
    });
  };

  return (
    <Dialog open onClose={onClose} title={`New ${label} template`}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          create();
        }}
      >
        <Label htmlFor="new-template-name" required>
          Name
        </Label>
        <Input
          id="new-template-name"
          value={name}
          maxLength={80}
          required
          autoFocus
          disabled={pending}
          placeholder={`e.g. Studio ${label}`}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "new-template-error" : undefined}
        />
        <FieldError id="new-template-error">{error}</FieldError>

        <fieldset className="mt-4" disabled={pending}>
          <legend className="mb-2 text-sm font-medium">Start from</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {DESIGN_STARTERS.map((option) => (
              <label
                key={option.key}
                className={cn(
                  "cursor-pointer rounded-xl border p-3 text-sm",
                  starter === option.key
                    ? "border-navy ring-2 ring-navy"
                    : "border-border hover:border-navy/50",
                )}
              >
                <input
                  type="radio"
                  name="starter"
                  value={option.key}
                  checked={starter === option.key}
                  onChange={() => setStarter(option.key)}
                  className="sr-only"
                />
                <span className="block font-medium">{option.name}</span>
                <span className="mt-1 block text-muted">{option.description}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Working…" : "Create and open designer"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

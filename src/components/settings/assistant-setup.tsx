"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";

type Step = { title: string; body?: ReactNode; showAddress?: boolean };

const FIRST_QUESTION = (
  <>
    Try: <q>Using Alfa, who owes me money right now?</q> The first answer may take a few
    seconds while it signs in.
  </>
);

const SIGN_IN: Step = {
  title: "Sign in to Alfa and choose Allow",
  body: "An Alfa sign-in page opens. Sign in as you normally do, then choose Allow. Nothing is shared until you do.",
};

const ASSISTANTS: { id: string; label: string; steps: Step[] }[] = [
  {
    id: "claude",
    label: "Claude",
    steps: [
      {
        title: "Open Claude's connector settings",
        body: (
          <>
            In Claude, open <strong>Settings</strong>, then <strong>Connectors</strong>. On a
            Team or Enterprise plan, an owner may need to add it for you.
          </>
        ),
      },
      {
        title: "Add Alfa as a custom connector",
        body: (
          <>
            Choose <strong>Add custom connector</strong>. Name it <strong>Alfa</strong> and paste
            this address, then choose <strong>Add</strong>.
          </>
        ),
        showAddress: true,
      },
      { ...SIGN_IN, title: "Choose Connect, sign in to Alfa and choose Allow" },
      {
        title: "Ask it something",
        body: <>Start a new chat. {FIRST_QUESTION}</>,
      },
    ],
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    steps: [
      {
        title: "Open ChatGPT's connector settings",
        body: (
          <>
            In ChatGPT, open <strong>Settings</strong>, then <strong>Apps &amp; Connectors</strong>.
            On a business plan, an admin may need to allow custom connectors first.
          </>
        ),
      },
      {
        title: "Turn on developer mode",
        body: (
          <>
            Under <strong>Advanced settings</strong>, turn on <strong>Developer mode</strong>.
            ChatGPT asks for this before adding a connector by address.
          </>
        ),
      },
      {
        title: "Create the Alfa connector",
        body: (
          <>
            Choose <strong>Create</strong>. Name it <strong>Alfa</strong>, paste this address and
            choose <strong>OAuth</strong> for authentication.
          </>
        ),
        showAddress: true,
      },
      SIGN_IN,
      {
        title: "Ask it something",
        body: <>In a new chat, turn on Alfa from the tools menu. {FIRST_QUESTION}</>,
      },
    ],
  },
  {
    id: "other",
    label: "Another assistant",
    steps: [
      {
        title: "Find where it adds connectors",
        body: "Look for connectors, integrations, tools or MCP servers in its settings. It needs to support remote servers with sign-in (OAuth).",
      },
      {
        title: "Add Alfa by its address",
        body: "Add a new server named Alfa with this address. If it asks for a transport, choose Streamable HTTP.",
        showAddress: true,
      },
      SIGN_IN,
      { title: "Ask it something", body: FIRST_QUESTION },
    ],
  },
];

/** One step at a time, for whichever assistant the person uses. */
export function AssistantSetup({ address }: { address: string }) {
  const [assistantId, setAssistantId] = useState(ASSISTANTS[0]!.id);
  const [index, setIndex] = useState(0);
  const assistant = ASSISTANTS.find((a) => a.id === assistantId)!;
  const step = assistant.steps[index]!;
  const last = index === assistant.steps.length - 1;

  return (
    <div className="space-y-5">
      <div role="group" aria-label="Which assistant do you use?" className="flex flex-wrap gap-2">
        {ASSISTANTS.map((a) => (
          <Button
            key={a.id}
            type="button"
            variant={a.id === assistantId ? "primary" : "secondary"}
            aria-pressed={a.id === assistantId}
            onClick={() => {
              setAssistantId(a.id);
              setIndex(0);
            }}
          >
            {a.label}
          </Button>
        ))}
      </div>

      <section
        aria-live="polite"
        aria-labelledby="assistant-step-title"
        className="rounded-2xl border border-border bg-surface p-5"
      >
        <p className="text-sm text-muted">
          Step {index + 1} of {assistant.steps.length}
        </p>
        <h3 id="assistant-step-title" className="mt-1 font-display text-lg font-semibold">
          {step.title}
        </h3>
        {step.body ? <p className="mt-2 text-sm text-foreground/90">{step.body}</p> : null}
        {step.showAddress ? <AssistantAddress address={address} /> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          {index > 0 ? (
            <Button type="button" variant="secondary" onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          ) : null}
          {!last ? (
            <Button type="button" onClick={() => setIndex(index + 1)}>
              Next
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

/** The connector address, large and easy to copy. */
export function AssistantAddress({ address }: { address: string }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-wash px-4 py-3">
      <code className="min-w-0 flex-1 break-all text-base text-foreground">{address}</code>
      <CopyButton value={address} />
    </div>
  );
}

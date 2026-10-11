"use client";

import { useState, useTransition } from "react";
import { askBookkeeper } from "@/actions/bookkeeper";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/form";

const EXAMPLES = [
  "What did we spend on software in the last quarter?",
  "Who are our biggest clients this year?",
  "How much VAT do we owe this quarter so far?",
  "Which invoices are overdue?",
];

type Answer = { question: string; answer: string; sources: string[] };

export function AskBox({ remaining }: { remaining: number }) {
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function ask(q: string) {
    const text = q.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const result = await askBookkeeper(text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAnswers((prev) => [{ question: text, answer: result.answer, sources: result.sources }, ...prev]);
      setQuestion("");
    });
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <Label htmlFor="question">Ask about your books</Label>
        <Textarea
          id="question"
          rows={2}
          maxLength={500}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(question);
            }
          }}
          placeholder={EXAMPLES[0]}
          disabled={pending}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || !question.trim()}>
            {pending ? "Looking it up…" : "Ask"}
          </Button>
          <span className="text-xs text-muted">{remaining} questions left today</span>
        </div>
        <FieldError>{error}</FieldError>
      </form>

      {answers.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={pending}
              onClick={() => ask(ex)}
              className="rounded-full border border-border bg-surface px-3 py-1 text-sm hover:bg-wash"
            >
              {ex}
            </button>
          ))}
        </div>
      ) : (
        <ol className="space-y-4" aria-live="polite">
          {answers.map((a, i) => (
            <li key={`${a.question}-${i}`} className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm text-muted">{a.question}</p>
              <p className="mt-2 whitespace-pre-wrap">{a.answer}</p>
              {a.sources.length > 0 ? (
                <p className="mt-2 text-xs text-muted">Based on: {a.sources.join("; ")}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

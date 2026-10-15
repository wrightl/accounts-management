/** Truncated text that expands in place to show the full value. */
export function ExpandableText({
  text,
  mono = false,
}: {
  text: string | null | undefined;
  mono?: boolean;
}) {
  if (!text) return <span className="text-muted">—</span>;
  const font = mono ? "font-mono" : "";
  if (text.length <= 60) {
    return <span className={`text-xs text-muted ${font}`}>{text}</span>;
  }
  return (
    <details className="max-w-md text-xs text-muted">
      <summary className={`cursor-pointer truncate ${font}`} title={text}>
        {text}
      </summary>
      <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-wash p-2 font-mono">
        {text}
      </pre>
    </details>
  );
}

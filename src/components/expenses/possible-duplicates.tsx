import Link from "next/link";
import { DisplayDate } from "@/components/date-format-provider";
import type { PossibleDuplicate } from "@/lib/expenses/duplicates";
import { formatExpenseAmount } from "@/lib/money";

function MatchLink({ match }: { match: PossibleDuplicate }) {
  return (
    <>
      <Link href={`/expenses/${match.id}`} className="font-medium underline underline-offset-2">
        {match.description}
      </Link>
      {match.spentAt ? (
        <>
          , <DisplayDate value={match.spentAt} />
        </>
      ) : null}
    </>
  );
}

/** One line under an expense in the list: the likeliest match and how many more. */
export function PossibleDuplicateChip({ matches }: { matches: PossibleDuplicate[] }) {
  const [first, ...rest] = matches;
  if (!first) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-red-900">
      <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium ring-1 ring-inset ring-red-700/30">
        Possible duplicate
      </span>
      <span>
        of <MatchLink match={first} />
        {first.sameReceipt ? " (same receipt)" : null}
        {rest.length ? ` and ${rest.length} more` : null}
      </span>
    </span>
  );
}

/** Every match, for the reviewer to compare before approving. */
export function PossibleDuplicateList({ matches }: { matches: PossibleDuplicate[] }) {
  if (!matches.length) return null;
  return (
    <div className="mt-2">
      <p className="font-medium">
        This may be a duplicate. Compare it with{" "}
        {matches.length === 1 ? "this expense" : "these expenses"} before approving:
      </p>
      <ul className="mt-1 list-disc pl-5">
        {matches.map((match) => (
          <li key={match.id}>
            <MatchLink match={match} />, {formatExpenseAmount(match)}:{" "}
            {match.sameReceipt ? "same receipt file" : "same amount and date"}
          </li>
        ))}
      </ul>
    </div>
  );
}

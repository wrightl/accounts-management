// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecordQueryIcon } from "@/components/queries/record-query-icon";
import { recordQueryLabel, shownQueryStatus, type RecordQuery } from "@/lib/queries/status";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/queries/raise-query-button", () => ({
  RaiseQueryDialog: () => <p>Raise dialog</p>,
}));

const open: RecordQuery = { id: "q1", subject: "Waiting one", status: "open" };
const answered: RecordQuery = { id: "q2", subject: "Answered one", status: "answered" };
const closed: RecordQuery = { id: "q3", subject: "Closed one", status: "closed" };

function renderIcon(queries: RecordQuery[], canRaise: boolean) {
  render(
    <RecordQueryIcon recordKind="invoice" recordId="r1" queries={queries} canRaise={canRaise} />,
  );
}

afterEach(cleanup);

describe("shownQueryStatus", () => {
  it("shows each viewer what they need to act on", () => {
    expect(shownQueryStatus([open, answered, closed], true)).toBe("answered");
    expect(shownQueryStatus([open, answered, closed], false)).toBe("open");
    expect(shownQueryStatus([closed], true)).toBe("closed");
    expect(shownQueryStatus([], true)).toBeNull();
  });
});

describe("recordQueryLabel", () => {
  it("says the status in words", () => {
    expect(recordQueryLabel([], true)).toBe("Raise a query");
    expect(recordQueryLabel([answered], true)).toBe("Query: Answered");
    expect(recordQueryLabel([open, answered, closed], true)).toBe("3 queries, 1 answered");
    expect(recordQueryLabel([open, answered, closed], false)).toBe(
      "3 queries, 1 waiting for the team",
    );
  });
});

describe("RecordQueryIcon", () => {
  it("raises a query when there are none", () => {
    renderIcon([], true);
    fireEvent.click(screen.getByRole("button", { name: "Raise a query" }));
    expect(screen.getByText("Raise dialog")).toBeTruthy();
  });

  it("shows the team nothing when there are none", () => {
    renderIcon([], false);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it.each([true, false])("links to a single query (canRaise %s)", (canRaise) => {
    renderIcon([answered], canRaise);
    expect(screen.getByRole("link", { name: "Query: Answered" }).getAttribute("href")).toBe(
      "/queries/q2",
    );
  });

  it("lists several, and lets an accountant raise another", () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    renderIcon([open, answered], true);
    fireEvent.click(screen.getByRole("button", { name: "2 queries, 1 answered" }));
    expect(screen.getByText("Waiting one").getAttribute("href")).toBe("/queries/q1");
    fireEvent.click(screen.getByText("Raise another"));
    expect(screen.getByText("Raise dialog")).toBeTruthy();
  });

  it("doesn't offer the team a way to raise another", () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    renderIcon([open, answered], false);
    fireEvent.click(screen.getByRole("button", { name: "2 queries, 1 waiting for the team" }));
    expect(screen.getByText("Answered one")).toBeTruthy();
    expect(screen.queryByText("Raise another")).toBeNull();
  });
});

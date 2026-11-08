// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LinkMenuButton } from "@/components/ui/link-menu-button";

afterEach(cleanup);

const items = [
  { key: "csv", label: "Accountant pack (CSV)", href: "/api/pack" },
  { key: "xlsx", label: "Accountant pack (Excel)", href: "/api/pack?format=xlsx" },
];

describe("LinkMenuButton", () => {
  it("shows the links only once opened", () => {
    render(<LinkMenuButton label="Download" items={items} />);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    const links = screen.getAllByRole("menuitem");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/api/pack",
      "/api/pack?format=xlsx",
    ]);
    expect(screen.getByRole("button", { name: "Download" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("closes on Escape and on a click outside", () => {
    render(<LinkMenuButton label="Download" items={items} />);
    const button = screen.getByRole("button", { name: "Download" });

    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(button);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

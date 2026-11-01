import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DateFormatProvider,
  DisplayDate,
  FriendlyDay,
} from "@/components/date-format-provider";

function render(node: React.ReactNode, format: "dmy" | "iso" | "mdy" | "d-mon-y") {
  return renderToStaticMarkup(
    <DateFormatProvider format={format}>{node}</DateFormatProvider>,
  );
}

describe("DisplayDate", () => {
  it("follows the provider's format", () => {
    expect(render(<DisplayDate value="2026-03-31" />, "mdy")).toBe("03/31/2026");
    expect(render(<DisplayDate value="2026-03-31" />, "d-mon-y")).toBe("31 Mar 2026");
  });

  it("defaults to dmy without a provider", () => {
    expect(renderToStaticMarkup(<DisplayDate value="2026-03-31" />)).toBe("31/03/2026");
  });

  it("formats timestamps, with time on request, and dashes empty values", () => {
    const at = new Date("2026-06-30T23:30:00Z");
    expect(render(<DisplayDate value={at} />, "iso")).toBe("2026-07-01");
    expect(render(<DisplayDate value={at} withTime />, "iso")).toBe("2026-07-01, 00:30:00");
    expect(render(<DisplayDate value={null} />, "iso")).toBe("—");
  });

  it("formats older days in FriendlyDay", () => {
    expect(render(<FriendlyDay iso="2020-01-05" />, "iso")).toBe("2020-01-05");
  });
});

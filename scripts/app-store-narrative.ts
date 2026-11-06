/**
 * Draft the App Store and Google Play copy for the mobile app with Claude, into
 * the fastlane metadata folders. Review the diff before uploading.
 *
 * Usage:
 *   npm run mobile:narrative
 *   npm run mobile:narrative -- --dry-run
 *
 * The prompt gets the mobile docs, the current copy and commit subjects since
 * the last `mobile-v*` tag. Never customer data.
 *
 * Needs AI_GATEWAY_API_KEY (or Vercel OIDC from `vercel env pull`).
 * NARRATIVE_MODEL overrides the model.
 */
import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateText, Output } from "ai";
import { z } from "zod";

config({ path: ".env.local" });
config({ path: ".env" });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MOBILE = join(ROOT, "mobile");
const IOS_DIR = join(MOBILE, "fastlane/metadata/ios/en-GB");
const ANDROID_DIR = join(MOBILE, "fastlane/metadata/android/en-GB");
const MODEL = process.env.NARRATIVE_MODEL?.trim() || "anthropic/claude-opus-5.5";

const dryRun = process.argv.includes("--dry-run");

/** Store limits in characters. Apple and Google reject anything longer. */
const LIMITS = {
  ios: {
    name: 30,
    subtitle: 30,
    promotional_text: 170,
    description: 4000,
    keywords: 100,
    release_notes: 4000,
  },
  android: {
    title: 30,
    short_description: 80,
    full_description: 4000,
    changelog: 500,
  },
} as const;

type Store = keyof typeof LIMITS;

const field = (max: number, hint = "") =>
  z.string().min(1).describe(`At most ${max} characters including spaces.${hint && ` ${hint}`}`);

// No .max() here: an over-long field is shortened on its own rather than
// throwing the whole draft away (see fitToLimits).
const schema = z.object({
  ios: z.object({
    name: field(LIMITS.ios.name),
    subtitle: field(LIMITS.ios.subtitle),
    promotional_text: field(LIMITS.ios.promotional_text),
    description: field(LIMITS.ios.description),
    keywords: field(
      LIMITS.ios.keywords,
      "Comma-separated, no spaces after commas, no words already in the name.",
    ),
    release_notes: field(LIMITS.ios.release_notes),
  }),
  android: z.object({
    title: field(LIMITS.android.title),
    short_description: field(LIMITS.android.short_description),
    full_description: field(LIMITS.android.full_description),
    changelog: field(LIMITS.android.changelog),
  }),
});

type Narrative = z.infer<typeof schema>;

/** Fields still longer than the store allows, as "ios.keywords (112/100)". */
function overLimit(narrative: Narrative): { store: Store; key: string; max: number }[] {
  return (Object.keys(LIMITS) as Store[]).flatMap((store) =>
    Object.entries(LIMITS[store])
      .filter(([key, max]) => (narrative[store] as Record<string, string>)[key].length > max)
      .map(([key, max]) => ({ store, key, max })),
  );
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function lastReleaseTag(): string | null {
  const tags = git(["tag", "--list", "mobile-v*", "--sort=-creatordate"]);
  return tags.split("\n").find(Boolean) ?? null;
}

function changesSince(tag: string | null): string {
  const range = tag ? [`${tag}..HEAD`] : [];
  return git(["log", "--no-merges", "--format=- %s", ...range, "--", "mobile", "src/app/api/mobile"]);
}

/** Build number from `version: 1.0.0+N`; Play's versionCode. */
function versionCode(): string {
  const pubspec = readFileSync(join(MOBILE, "pubspec.yaml"), "utf8");
  const match = pubspec.match(/^version:\s*[\d.]+\+(\d+)/m);
  if (!match) throw new Error("No build number in mobile/pubspec.yaml (expected version: x.y.z+N)");
  return match[1];
}

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8").trim() : null;
}

function currentCopy(): string {
  const files = [
    ...["name", "subtitle", "promotional_text", "description", "keywords"].map((f) => join(IOS_DIR, `${f}.txt`)),
    ...["title", "short_description", "full_description"].map((f) => join(ANDROID_DIR, `${f}.txt`)),
  ];
  const parts = files
    .map((path) => [path.slice(MOBILE.length + 1), readIfExists(path)] as const)
    .filter(([, text]) => text)
    .map(([path, text]) => `### ${path}\n${text}`);
  return parts.length ? parts.join("\n\n") : "(none yet: this is the first release)";
}

function prompt(): string {
  const tag = lastReleaseTag();
  const changes = changesSince(tag);
  return `You write the App Store and Google Play listing for Alfa, the phone app for a UK bookkeeping product for small consultancies.

Rules:
- UK English, sentence case, plain words. Name pages as the app does (Overview, Expenses, Sales, More, Weekly close, AI bookkeeper, Deadlines, Safe to pay yourself).
- Describe only features in the docs below. No tax or legal promises, no figures, no prices, no competitor names.
- The phone app is a companion to the web app: capture, review and what needs attention today. Say so honestly.
- Keep the current copy where it is still right; change it only where features changed.
- Release notes (release_notes and changelog) list what people will notice, from the commits below, in short plain lines. ${tag ? "" : 'This is the first release, so write "First release." and a one-line summary.'}
- Plain text only, no markdown. Bullets as "• ", one per line. Put a blank line between paragraphs and before each list.
- Sentence case everywhere, including the name, title and headings ("Alfa: bookkeeping on the go", not "Alfa: Bookkeeping On The Go").
- Each field gives its character limit. Aim well under it; the stores reject anything longer.

## Current copy
${currentCopy()}

## Commits since ${tag ?? "the start"}
${changes || "(none)"}

## mobile/README.md
${readFileSync(join(MOBILE, "README.md"), "utf8")}

## MOBILE_IMPLEMENTATION.md
${readFileSync(join(ROOT, "MOBILE_IMPLEMENTATION.md"), "utf8")}`;
}

async function draft(): Promise<Narrative> {
  const { output } = await generateText({
    model: MODEL,
    output: Output.object({ schema }),
    prompt: prompt(),
  });
  return output;
}

/** Shorten each over-long field on its own, a few tries at most. */
async function fitToLimits(narrative: Narrative): Promise<Narrative> {
  for (let round = 0; round < 3; round++) {
    const over = overLimit(narrative);
    if (over.length === 0) break;
    for (const { store, key, max } of over) {
      const fields = narrative[store] as Record<string, string>;
      const { text } = await generateText({
        model: MODEL,
        prompt: `Shorten this ${store === "ios" ? "App Store" : "Google Play"} ${key.replaceAll("_", " ")} to at most ${max} characters including spaces (it is ${fields[key].length}). Keep the meaning, UK English and sentence case.${key === "keywords" ? " Keep it comma-separated with no spaces after commas." : ""} Reply with the text only.\n\n${fields[key]}`,
      });
      fields[key] = text.trim().replace(/^"|"$/g, "");
    }
  }
  return narrative;
}

function write(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${text.trim()}\n`);
}

async function main() {
  const narrative = await fitToLimits(await draft());
  const over = overLimit(narrative);

  if (dryRun) {
    console.log(JSON.stringify(narrative, null, 2));
  } else {
    writeNarrative(narrative);
    console.log(`Wrote store copy (${MODEL}). Review with: git diff mobile/fastlane/metadata`);
  }

  if (over.length > 0) {
    const fields = over.map(({ store, key, max }) => {
      const length = (narrative[store] as Record<string, string>)[key].length;
      return `${store}/${key} (${length}/${max})`;
    });
    console.error(`Still too long for the store, trim by hand: ${fields.join(", ")}`);
    process.exit(1);
  }
}

function writeNarrative(narrative: Narrative) {
  for (const [field, text] of Object.entries(narrative.ios)) {
    write(join(IOS_DIR, `${field}.txt`), text);
  }
  write(join(ANDROID_DIR, "title.txt"), narrative.android.title);
  write(join(ANDROID_DIR, "short_description.txt"), narrative.android.short_description);
  write(join(ANDROID_DIR, "full_description.txt"), narrative.android.full_description);
  write(join(ANDROID_DIR, `changelogs/${versionCode()}.txt`), narrative.android.changelog);
}

main().catch((error) => {
  console.error(`Could not draft the store copy with ${MODEL}: ${error instanceof Error ? error.message : error}`);
  console.error("Set NARRATIVE_MODEL to another AI Gateway model if this one is not on your plan.");
  process.exit(1);
});

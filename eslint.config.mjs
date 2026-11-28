import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tenantScope from "./eslint-rules/tenant-scope.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Flutter app; iOS builds check out Swift packages with their own JS here.
    "mobile/**",
    // Git worktrees for other branches; each one is linted on its own branch.
    ".claude/worktrees/**",
  ]),
  {
    rules: {
      // Disable refs check - preventResetSubmit pattern accesses refs in callbacks, not during render
      "react-hooks/refs": "off",
      // Allow `const { omitted: _x, ...rest } = obj` to drop keys.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { ignoreRestSiblings: true, varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // CLAUDE.md: every query on a tenant-owned table is scoped to the company in
    // the same statement. See eslint-rules/tenant-scope.mjs.
    files: ["src/**/*.{ts,tsx}"],
    // Seed scripts run locally and clear their fixtures across companies on purpose.
    ignores: ["src/db/seed-*.ts"],
    plugins: { "tenant-scope": tenantScope },
    rules: { "tenant-scope/require-company-scope": "error" },
  },
]);

export default eslintConfig;

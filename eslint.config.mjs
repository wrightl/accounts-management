import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
]);

export default eslintConfig;

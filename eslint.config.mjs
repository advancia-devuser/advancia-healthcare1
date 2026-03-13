import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  ...compat.config({
    parser: "@typescript-eslint/parser",
    plugins: ["@typescript-eslint"],
    extends: ["next/core-web-vitals"],
    rules: {
      "max-len": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-restricted-globals": ["error", "event"],
      "prefer-const": "warn",
      "no-unused-expressions": "warn",
      eqeqeq: ["error", "always"],
    },
    overrides: [
      {
        files: ["**/*.ts", "**/*.tsx"],
        rules: {
          "@typescript-eslint/no-explicit-any": "warn",
          "@typescript-eslint/no-unused-vars": [
            "warn",
            { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
          ],
        },
      },
      {
        files: ["components/ui/**/*.{ts,tsx}"],
        rules: {
          "max-len": "off",
        },
      },
      {
        files: ["lib/logger.ts"],
        rules: {
          "no-console": "off",
        },
      },
      {
        files: ["__tests__/**/*.{ts,tsx}", "scripts/**/*.{js,cjs}"],
        rules: {
          "no-console": "off",
          "@typescript-eslint/no-explicit-any": "off",
        },
      },
    ],
  }),
];
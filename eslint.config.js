import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["client/**/*.{js,jsx}"],
    extends: [
      js.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
    },
  },
  {
    files: ["server/**/*.js"],
    ignores: ["server/tests/k6/**"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: globals.node,
    },
    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
    },
  },
  {
    files: ["server/tests/k6/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        __ENV: "readonly",
        __VU: "readonly",
        _: "readonly",
      },
    },
    rules: {
      // These scripts intentionally use empty handlers and underscore-prefixed placeholders.
      "no-empty": "off",
      "no-unused-vars": [
        "error",
        { varsIgnorePattern: "^[A-Z_]|^_", argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["server/tests/artillery/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node, fetch: "readonly" },
    },
    rules: {
      "no-empty": "off",
    },
  },
]);

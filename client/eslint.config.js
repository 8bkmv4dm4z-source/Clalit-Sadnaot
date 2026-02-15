import js from "@eslint/js";
import react from "eslint-plugin-react";
import importPlugin from "eslint-plugin-import";
import reactHooks from "eslint-plugin-react-hooks";
import babelParser from "@babel/eslint-parser";
import tseslint from "typescript-eslint";

const sharedGlobals = {
  window: "readonly",
  document: "readonly",
  localStorage: "readonly",
  fetch: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  alert: "readonly",
  CustomEvent: "readonly",
  FileReader: "readonly",
  URLSearchParams: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  ResizeObserver: "readonly",
  AbortController: "readonly",
  Event: "readonly"
};

const sharedPlugins = {
  react,
  import: importPlugin,
  "react-hooks": reactHooks
};

const sharedSettings = {
  react: { version: "detect" },
  "import/resolver": {
    alias: {
      map: [["@", "./src"]],
      extensions: [".js", ".jsx", ".ts", ".tsx", ".json"]
    }
  }
};

const sharedRules = {
  "import/no-unresolved": "error",
  "react-hooks/exhaustive-deps": "warn",
  "no-unused-vars": "off",
  "no-empty": "off",
  "react-refresh/only-export-components": "off",
  "react/prop-types": "off",
  "react/display-name": "off"
};

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-react"]
        }
      },
      globals: sharedGlobals
    },
    plugins: sharedPlugins,
    settings: sharedSettings,
    rules: sharedRules
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tseslint.parser,
      globals: sharedGlobals
    },
    plugins: sharedPlugins,
    settings: sharedSettings,
    rules: {
      ...sharedRules,
      "no-undef": "off"
    }
  }
];

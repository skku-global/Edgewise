// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // The scripts in scripts/ are plain Node, run with `node scripts/x.mjs`, and
    // never bundled. The Expo config targets the app — a React Native runtime,
    // where most of these do not exist — so it does not declare them. Listing
    // them explicitly rather than pulling in `globals` keeps this dependency-free
    // and makes the surface these scripts rely on visible.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        URL: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
  },
]);

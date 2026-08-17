/**
 * Stub for CSS imports under Jest.
 *
 * `src/constants/theme.ts` imports `@/global.css` — Tailwind-style global styles
 * that the Metro web bundler understands and Node does not. Jest hands the file
 * to its JS transform, which trips over the first `:root {`.
 *
 * The stylesheet contributes nothing a test can observe: it declares CSS custom
 * properties for the web build, while every value the app reads at runtime comes
 * from the exported token objects in `theme.ts`. So an empty module is a faithful
 * substitute, not a papered-over gap.
 *
 * Deliberately not inside a `__tests__` directory: jest-expo's `testMatch`
 * collects every file under one, and this is not a test.
 */
module.exports = {};

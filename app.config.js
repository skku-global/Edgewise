// GitHub Pages serves this repo from a sub-path (/Edgewise); Vercel, Netlify and
// the dev server all serve from the root. baseUrl prefixes every generated asset
// URL, so a value that suits one host breaks the others -- every script and
// stylesheet 404s. It therefore belongs to whoever is doing the build, not to
// app.json.
//
// Unset means root, which is what local `expo start` and Vercel want. The Pages
// workflow sets EXPO_WEB_BASE_URL=/Edgewise.
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_WEB_BASE_URL ?? '';
  return {
    ...config,
    experiments: {
      ...config.experiments,
      ...(baseUrl ? { baseUrl } : {}),
    },
  };
};

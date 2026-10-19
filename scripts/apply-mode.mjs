// Makes the shared UI pieces keep their ORIGINAL look in the dark design,
// while the white design keeps the new look. Run once: node scripts/apply-mode.mjs
// Each edit is checked: if a piece of code is not found exactly once, nothing is
// written for that file and you are told why.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const edits = [
  {
    file: 'src/components/ui/button.tsx',
    changes: [
      [
        /primary: \{\s*backgroundColor: '#6FE3A8',\s*borderColor: '#4FC98C',\s*\},/,
        "primary: t.scheme === 'dark'\n      ? { backgroundColor: t.color.accent, ...t.elevation[1] }\n      : { backgroundColor: '#6FE3A8', borderColor: '#4FC98C' },",
      ],
      [
        /danger: \{\s*backgroundColor: t\.color\.loss,\s*\},/,
        "danger: {\n      backgroundColor: t.color.loss,\n      ...(t.scheme === 'dark' ? t.elevation[1] : {}),\n    },",
      ],
      [/labelTone\[variant\]/, "labelToneFor(variant, theme.scheme)"],
      [/spinnerTone\[variant\]/, "spinnerToneFor(variant, theme.scheme)"],
    ],
    append:
      "\n// Dark design keeps the original primary label colour; the white design uses the new one.\n" +
      "const labelToneFor = (v: ButtonVariant, scheme: string): TextTone =>\n" +
      "  v === 'primary' && scheme === 'dark' ? 'textOnFill' : labelTone[v];\n" +
      "const spinnerToneFor = (v: ButtonVariant, scheme: string): 'textOnFill' | 'text' | 'accent' =>\n" +
      "  v === 'primary' && scheme === 'dark' ? 'textOnFill' : spinnerTone[v];\n",
  },
  {
    file: 'src/components/ui/pill.tsx',
    changes: [
      [
        /paddingVertical: t\.space\.half,\s*borderRadius: t\.radius\.sm,/,
        "paddingVertical: t.space.half,\n      borderRadius: t.scheme === 'dark' ? t.radius.pill : t.radius.sm,",
      ],
    ],
  },
  {
    file: 'src/components/ui/screen.tsx',
    changes: [
      [
        /hero: \{\s*paddingVertical: t\.space\.two,\s*\},/,
        "hero:\n      t.scheme === 'dark'\n        ? {\n            backgroundColor: t.color.hero,\n            borderRadius: t.radius.xl,\n            paddingHorizontal: t.space.four,\n            paddingVertical: t.space.four,\n          }\n        : { paddingVertical: t.space.two },",
      ],
    ],
  },
  {
    file: 'src/components/app-tabs.web.tsx',
    changes: [
      [
        /paddingHorizontal: t\.space\.three,\s*borderRadius: t\.radius\.md,\s*backgroundColor: 'transparent',/,
        "paddingHorizontal: t.space.three,\n      borderRadius: t.scheme === 'dark' ? t.radius.pill : t.radius.md,\n      backgroundColor: 'transparent',",
      ],
      [
        /paddingHorizontal: t\.space\.three,\s*borderRadius: t\.radius\.md,\s*borderWidth: 1,/,
        "paddingHorizontal: t.space.three,\n      borderRadius: t.scheme === 'dark' ? t.radius.pill : t.radius.md,\n      borderWidth: 1,",
      ],
      [
        /zIndex: 90,\s*\},\s*fabPressed:/,
        "zIndex: 90,\n      ...(t.scheme === 'dark' ? t.elevation[3] : {}),\n    },\n    fabPressed:",
      ],
    ],
  },
  {
    file: 'src/app/_layout.tsx',
    changes: [
      [
        /<StatusBar style="dark" \/>/,
        "<StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />",
      ],
    ],
  },
];

let failed = 0;
for (const { file, changes, append } of edits) {
  if (!existsSync(file)) {
    console.log(`SKIP  ${file} (not found)`);
    failed++;
    continue;
  }
  const raw = readFileSync(file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let text = raw.replace(/\r\n/g, '\n');

  if (changes.every(([re]) => !re.test(text))) {
    console.log(`DONE  ${file} (already patched)`);
    continue;
  }

  let ok = true;
  for (const [re, replacement] of changes) {
    const found = text.match(new RegExp(re.source, 'g'));
    if (!found || found.length !== 1) {
      console.log(`FAIL  ${file}: expected 1 match for ${re}, found ${found ? found.length : 0}`);
      ok = false;
      break;
    }
    text = text.replace(re, () => replacement);
  }
  if (!ok) {
    failed++;
    continue;
  }
  if (append) text = text.replace(/\n*$/, '\n') + append;
  writeFileSync(file, text.replace(/\n/g, eol));
  console.log(`OK    ${file}`);
}
console.log(failed ? `\n${failed} file(s) not patched. Paste this output to me.` : '\nAll patched.');

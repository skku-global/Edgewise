import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

// Load the URL polyfill on native only. Under `web.output: "static"`, Expo Router
// server-renders routes inside the Metro process, so importing this at module
// scope replaces Node's global URL with whatwg-url-without-unicode@8.0.0-3 —
// which predates URL.canParse and breaks Metro's own request parsing.
if (Platform.OS !== "web") {
  // Must stay a runtime require: a static import would be hoisted and run on
  // web too, which is exactly the breakage described above.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-native-url-polyfill/auto");
}

/**
 * Credentials come from the environment only — there are deliberately no inline
 * fallbacks.
 *
 * They used to be hardcoded here as defaults, which meant a checkout with no
 * `.env` silently read from and wrote to a real shared project instead of
 * failing. Every EXPO_PUBLIC_ value is compiled into the bundle in plain text,
 * so anyone with the app could reach that database; under the wide-open policies
 * this app started with, that was full read/write on someone else's trades.
 *
 * Throwing at import is the right failure. Metro surfaces the message directly,
 * and a missing config is not something to limp along with — every screen is a
 * database read.
 */
const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    !supabaseUrl && "EXPO_PUBLIC_SUPABASE_URL",
    !supabaseAnonKey && "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);

  throw new Error(
    `Supabase is not configured — ${missing.join(" and ")} missing. ` +
      `Copy .env.example to .env and fill in the Project URL and publishable key ` +
      `from Supabase → Project Settings → API, then restart the dev server ` +
      `(env vars are read at bundle time, so a reload is not enough).`,
  );
}

// AsyncStorage on native; on web supabase-js defaults to localStorage, which is
// what `detectSessionInUrl` needs to hand the session off after an email link.
const customStorage = Platform.OS === 'web' ? undefined : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

/**
 * The same two values, re-exported for the broker-sync setup screen.
 *
 * That screen's whole job is to show each user the credentials their MetaTrader
 * advisor needs, and two of the four are these — so they are read from the one
 * place that already validated them rather than from `process.env` a second
 * time, where a typo in the variable name would render a blank field instead of
 * failing.
 *
 * Neither is a secret. Both are compiled into every copy of this app in plain
 * text; the publishable key authenticates as `anon`, which under
 * `scripts/secure-rls.sql` owns nothing and can read nothing. What separates one
 * user's trades from another's is the policies, not the key.
 */
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_PUBLISHABLE_KEY = supabaseAnonKey;

//+------------------------------------------------------------------+
//|                                            EdgewiseSync.mq5   |
//|  Pushes closed MT5 trades into the Edgewise trading journal.      |
//+------------------------------------------------------------------+
//
// WHAT THIS DOES
//   Two jobs, both aimed at the same thing: the journal should never need a
//   trade typed in by hand again.
//
//     1. On start, it backfills. MT5 re-downloads your full history from the
//        broker every time it connects, so the EA walks that history and sends
//        every closed trade in the window. Your PC does NOT need to stay on --
//        trade from your phone all week, open the terminal on Sunday, and the
//        week lands in the journal.
//
//     2. While running, it pushes live. Every position you close is sent within
//        a second of closing.
//
//   Re-sending is safe. Each trade carries its broker deal ticket, the database
//   has a unique index on (user_id, source, external_id), and the request asks
//   Postgres to merge duplicates. Running the backfill a hundred times produces
//   the same rows once.
//
// WHY IT NEEDS YOUR EMAIL AND PASSWORD
//   The journal moved from a single-user database to per-user Row Level
//   Security, so rows are owned. The publishable key alone authenticates as
//   `anon`, which now owns nothing and can write nothing -- it is refused before
//   any policy is consulted. So the EA signs in the same way the app does, gets
//   a user JWT, and sends that. Postgres then stamps the row with your user id
//   via the column default and the insert policy verifies it matches.
//
//   Both values stay in the EA inputs on your own PC and are sent only to your
//   own Supabase project over HTTPS. Nothing else reads them.
//
// WHY AN EA AND NOT A CLOUD SERVICE
//   MT5 has no cloud API. The alternatives all bill per connected account,
//   which cannot stay free as users are added. Your own terminal doing the work
//   costs nothing at any number of users.
//
// SETUP: see mt5/README.md. The step everyone misses is whitelisting the URL
// under Tools -> Options -> Expert Advisors; without it WebRequest returns -1
// and nothing is ever sent.

#property copyright "Edgewise"
#property version   "2.00"
#property description "Syncs closed trades to your Edgewise journal."

//--- input parameters ------------------------------------------------------

input string SupabaseUrl      = "";    // Supabase project URL (no trailing slash)
input string SupabaseKey      = "";    // Supabase publishable (anon) key
input string SupabaseEmail    = "";    // The email you sign in to the app with
input string SupabasePassword = "";    // Your app password
input int    BackfillDays     = 90;    // Days of history to send on start (0 = skip)
input bool   DryRun           = false; // Log payloads, send no trades (still signs in)
input bool   VerboseLog       = true;  // Log each trade as it is sent

//--- constants ------------------------------------------------------------

// PostgREST's table endpoint. `resolution=merge-duplicates` turns the insert
// into an upsert, and on_conflict names the columns to resolve against -- the
// unique index from scripts/secure-rls.sql. That pairing is what makes
// re-sending harmless.
//
// on_conflict is not optional. Without it PostgREST resolves against the
// PRIMARY KEY, and since the payload carries no id nothing ever conflicts: every
// re-send inserts another row and the backfill duplicates the whole history on
// each terminal start.
//
// user_id leads the list because the index is per user. It used to be
// (source, external_id) globally, which collides between two traders whose
// brokers happen to issue the same deal ticket -- and the second one's upsert
// would resolve onto a row RLS hides from them, which Postgres cannot report
// sensibly.
#define TRADES_PATH   "/rest/v1/trades?on_conflict=user_id,source,external_id"
#define AUTH_PASSWORD "/auth/v1/token?grant_type=password"
#define AUTH_REFRESH  "/auth/v1/token?grant_type=refresh_token"
#define SOURCE_TAG    "mt5"
#define HTTP_TIMEOUT  8000

//--- session state --------------------------------------------------------

string g_access_token  = "";
string g_refresh_token = "";
string g_user_id       = "";

// Body of the most recent PostgREST response, kept for error reporting.
string g_last_response = "";

// Server time minus UTC, in seconds. Sampled once at init -- see IsoUtc.
int    g_utc_offset    = 0;

//+------------------------------------------------------------------+
//| Trade shape, assembled before it becomes JSON.                   |
//+------------------------------------------------------------------+
struct TradeRecord
{
   string   symbol;
   string   direction;      // "buy" or "sell" -- the POSITION's side, not the deal's
   double   entry_price;    // volume-weighted across every entry into the position
   double   exit_price;
   double   volume;
   double   profit;         // net: profit + commission + swap
   double   commission;
   double   swap;
   datetime opened_at;      // earliest entry into the position
   datetime closed_at;
   long     ticket;         // closing deal ticket, the dedup key
   int      digits;         // price precision for this symbol
};

//+------------------------------------------------------------------+
//| Init                                                             |
//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(SupabaseUrl) == 0 || StringLen(SupabaseKey) == 0)
   {
      Print("EdgewiseSync: set SupabaseUrl and SupabaseKey in the EA inputs. Nothing will be sent.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   if(StringLen(SupabaseEmail) == 0 || StringLen(SupabasePassword) == 0)
   {
      Print("EdgewiseSync: set SupabaseEmail and SupabasePassword to the account you ",
            "sign in to the app with. The journal now owns rows per user, so the ",
            "publishable key on its own can no longer write.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   // A trailing slash makes every URL ".../rest/v1/trades" into ".../trades",
   // which is a different path to PostgREST and fails the whitelist match. It is
   // an easy paste error and the resulting -1 says nothing about the cause, so
   // refuse to start rather than log failures for every trade in the backfill.
   if(StringGetCharacter(SupabaseUrl, StringLen(SupabaseUrl) - 1) == '/')
   {
      Print("EdgewiseSync: remove the trailing slash from SupabaseUrl. ",
            "It must read exactly https://<your-project>.supabase.co");
      return(INIT_PARAMETERS_INCORRECT);
   }

   // Cached once rather than recomputed per trade: the two clock readings are
   // taken microseconds apart and drift by a second or two between calls, which
   // would otherwise make the same deal serialise to a different timestamp on
   // each backfill and defeat nothing but readability. See IsoUtc.
   g_utc_offset = RoundedServerOffset();

   Print("EdgewiseSync: attached to ", _Symbol,
         " | account ", AccountInfoInteger(ACCOUNT_LOGIN),
         " | ", AccountInfoString(ACCOUNT_COMPANY),
         " | server UTC", (g_utc_offset >= 0 ? "+" : "-"),
         IntegerToString((int)MathAbs(g_utc_offset) / 3600));

   // Signed in even for a dry run: validating the credentials is most of what a
   // dry run is for, and it fills g_user_id so the logged payload is the real one.
   if(!Login())
      return(INIT_FAILED);

   if(DryRun)
      Print("EdgewiseSync: DRY RUN -- payloads are logged, no trades are sent.");

   if(BackfillDays > 0)
      BackfillHistory(BackfillDays);
   else
      Print("EdgewiseSync: backfill skipped (BackfillDays = 0). Live trades will still sync.");

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Required by the EA contract; this one is event-driven.            |
//+------------------------------------------------------------------+
void OnTick()
{
}

//+------------------------------------------------------------------+
//| Live push: fires on every trade event the terminal sees.          |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest    &request,
                        const MqlTradeResult     &result)
{
   // Only new deals matter. Order and position events fire constantly and none
   // of them mean "a trade finished".
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD)
      return;

   if(!HistoryDealSelect(trans.deal))
      return;

   if(!IsClosingEntry((ENUM_DEAL_ENTRY)HistoryDealGetInteger(trans.deal, DEAL_ENTRY)))
      return;

   TradeRecord record;

   if(!BuildRecordFromDeal(trans.deal, record))
      return;

   SendTrade(record);
}

//+------------------------------------------------------------------+
//| Does this deal end a trade?                                      |
//+------------------------------------------------------------------+
//
// OUT closes a position; OUT_BY closes one against an opposite position. INOUT
// is a reversal -- one deal that closes the whole position and opens a new one
// the other way. All three end a trade, and INOUT used to be filtered out here,
// which silently dropped every reversal from the journal. It was accepted as an
// *opener* three functions down at the same time, so the EA disagreed with
// itself about what a reversal was.
//
// A reversal is still only recorded as the trade it closed, not the one it
// opened: the opening half has no closing deal yet, and will get its own row
// when it does close.
//
bool IsClosingEntry(const ENUM_DEAL_ENTRY entry)
{
   return(entry == DEAL_ENTRY_OUT ||
          entry == DEAL_ENTRY_OUT_BY ||
          entry == DEAL_ENTRY_INOUT);
}

//+------------------------------------------------------------------+
//| Does this deal enter a position?                                  |
//+------------------------------------------------------------------+
bool IsOpeningEntry(const ENUM_DEAL_ENTRY entry)
{
   return(entry == DEAL_ENTRY_IN || entry == DEAL_ENTRY_INOUT);
}

//+------------------------------------------------------------------+
//| Backfill: walk history and send every closed trade in the window. |
//+------------------------------------------------------------------+
void BackfillHistory(const int days)
{
   const datetime to   = TimeCurrent();
   const datetime from = to - (datetime)days * 86400;

   if(!HistorySelect(from, to))
   {
      Print("EdgewiseSync: HistorySelect failed, error ", GetLastError(),
            ". Backfill skipped; live trades will still sync.");
      return;
   }

   const int total = HistoryDealsTotal();
   int sent = 0;
   int failed = 0;

   Print("EdgewiseSync: backfilling ", days, " days (", total, " deals to scan)...");

   // Two passes, and the split is not stylistic. BuildRecordFromDeal calls
   // HistorySelectByPosition to find the opening deals, which REPLACES this
   // date-range selection with a position-scoped one. Building inside the walk
   // would leave HistoryDealGetTicket(i) indexing a cache of two or three deals
   // instead of the window -- the loop would skip most of the history and
   // silently backfill a fraction of it.
   //
   // So: collect every closing ticket while the range selection is intact, then
   // build from tickets, which HistoryDealSelect resolves regardless of what is
   // currently selected.
   ulong closing[];
   int found = 0;

   ArrayResize(closing, total);

   for(int i = 0; i < total; i++)
   {
      const ulong ticket = HistoryDealGetTicket(i);

      if(ticket == 0)
         continue;

      if(!IsClosingEntry((ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY)))
         continue;

      closing[found] = ticket;
      found++;
   }

   ArrayResize(closing, found);

   Print("EdgewiseSync: ", found, " closed trades found in the window.");

   for(int i = 0; i < found; i++)
   {
      TradeRecord record;

      if(!BuildRecordFromDeal(closing[i], record))
         continue;

      if(SendTrade(record))
         sent++;
      else
         failed++;
   }

   Print("EdgewiseSync: backfill done -- ", sent, " sent, ", failed, " failed.");

   if(failed > 0)
      Print("EdgewiseSync: failures are usually the URL whitelist. See mt5/README.md.");
}

//+------------------------------------------------------------------+
//| Assemble a full trade from its CLOSING deal.                     |
//+------------------------------------------------------------------+
//
// The subtle part. A closing deal's DEAL_TYPE is the OPPOSITE of the position
// it closed: closing a buy is recorded as a sell deal. Reading direction off
// the closing deal would invert every single trade in the journal -- every win
// would look like it came from the wrong side of the market.
//
// So direction, entry price and open time all come from the OPENING deals, found
// by re-selecting history for this position id. Only the exit price, close time
// and money come from the closing deal.
//
bool BuildRecordFromDeal(const ulong close_ticket, TradeRecord &record)
{
   if(!HistoryDealSelect(close_ticket))
      return(false);

   const long position_id = HistoryDealGetInteger(close_ticket, DEAL_POSITION_ID);

   record.ticket     = (long)close_ticket;
   record.symbol     = HistoryDealGetString(close_ticket, DEAL_SYMBOL);
   record.exit_price = HistoryDealGetDouble(close_ticket, DEAL_PRICE);
   record.volume     = HistoryDealGetDouble(close_ticket, DEAL_VOLUME);
   record.commission = HistoryDealGetDouble(close_ticket, DEAL_COMMISSION);
   record.swap       = HistoryDealGetDouble(close_ticket, DEAL_SWAP);
   record.closed_at  = (datetime)HistoryDealGetInteger(close_ticket, DEAL_TIME);

   // Net P/L -- what actually hit the account. The journal must never derive
   // this from prices: XAUUSD has a contract size of 100, so a $1 move on one
   // lot is $100, and commission and swap are invisible to any price formula.
   record.profit = HistoryDealGetDouble(close_ticket, DEAL_PROFIT)
                 + record.commission
                 + record.swap;

   // Digits for price formatting. Falls back to 5 if the symbol is not in
   // Market Watch (possible for an instrument traded long ago).
   record.digits = (int)SymbolInfoInteger(record.symbol, SYMBOL_DIGITS);
   if(record.digits <= 0)
      record.digits = 5;

   if(!FillFromOpeningDeals(position_id, close_ticket, record))
   {
      // Without an opening deal the direction would be a guess, and a guessed
      // direction is worse than a missing trade: it silently corrupts the
      // psychology stats the whole product is built on. Skip it instead.
      Print("EdgewiseSync: no opening deal for position ", position_id,
            " (deal ", close_ticket, ") -- skipped to avoid recording a guessed direction.");
      return(false);
   }

   return(true);
}

//+------------------------------------------------------------------+
//| Take the position's true side and average entry from its openers. |
//+------------------------------------------------------------------+
//
// Volume-weighted, because a position can be scaled into. This used to take the
// first entry deal's price and stop looking, so a position built from three
// entries reported only the first one -- an entry price the trader never paid.
// P/L was unaffected (that comes from the broker) but every derived figure the
// app shows next to it, and every answer Chat gives about entries, was wrong.
//
bool FillFromOpeningDeals(const long position_id,
                          const ulong close_ticket,
                          TradeRecord &record)
{
   // Re-selects the history cache for just this position. Note this REPLACES
   // the current selection, which is why the caller must read everything it
   // needs from the closing deal before calling this.
   if(!HistorySelectByPosition(position_id))
      return(false);

   const int total = HistoryDealsTotal();

   double   volume_sum   = 0.0;
   double   notional_sum = 0.0;
   datetime earliest     = 0;
   bool     have_side    = false;

   for(int i = 0; i < total; i++)
   {
      const ulong ticket = HistoryDealGetTicket(i);

      if(ticket == 0 || ticket == close_ticket)
         continue;

      if(!IsOpeningEntry((ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY)))
         continue;

      const double volume = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      const double price  = HistoryDealGetDouble(ticket, DEAL_PRICE);
      const datetime when = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);

      volume_sum   += volume;
      notional_sum += price * volume;

      if(earliest == 0 || when < earliest)
         earliest = when;

      if(!have_side)
      {
         // Here the deal type IS the position's side, because this deal opened
         // it. Taken from the earliest opener; every later add is the same side
         // by definition, since an opposite deal would close, not open.
         const ENUM_DEAL_TYPE type =
            (ENUM_DEAL_TYPE)HistoryDealGetInteger(ticket, DEAL_TYPE);

         record.direction = (type == DEAL_TYPE_BUY) ? "buy" : "sell";
         have_side = true;
      }
   }

   if(!have_side || volume_sum <= 0.0)
      return(false);

   record.entry_price = notional_sum / volume_sum;
   record.opened_at   = earliest;

   return(true);
}

//+------------------------------------------------------------------+
//| Auth                                                             |
//+------------------------------------------------------------------+
//
// Signs in with the app's own credentials and keeps the tokens in memory only.
// Supabase access tokens last an hour, which a terminal left open all week will
// outlive many times over, so PostTrade refreshes on the first 401 and retries.
//
bool Login()
{
   const string body = "{\"email\":\"" + JsonEscape(SupabaseEmail) + "\","
                       "\"password\":\"" + JsonEscape(SupabasePassword) + "\"}";

   string response;
   const int status = HttpPost(SupabaseUrl + AUTH_PASSWORD, AuthHeaders(), body, response);

   if(status == -1)
   {
      ReportWebRequestFailure("sign-in");
      return(false);
   }

   if(status != 200)
   {
      Print("EdgewiseSync: sign-in failed with HTTP ", status, ": ", response);

      if(status == 400)
         Print("EdgewiseSync: check SupabaseEmail and SupabasePassword. If you signed up ",
               "recently, confirm the address from the verification email first.");

      return(false);
   }

   return(StoreSession(response, "sign-in"));
}

bool RefreshSession()
{
   if(StringLen(g_refresh_token) == 0)
      return(Login());

   const string body = "{\"refresh_token\":\"" + JsonEscape(g_refresh_token) + "\"}";

   string response;
   const int status = HttpPost(SupabaseUrl + AUTH_REFRESH, AuthHeaders(), body, response);

   // A refresh token can be expired or already rotated away; a full sign-in is
   // always available as the fallback, so never fail here without trying it.
   if(status != 200)
   {
      Print("EdgewiseSync: token refresh failed (HTTP ", status, "), signing in again.");
      return(Login());
   }

   return(StoreSession(response, "token refresh"));
}

bool StoreSession(const string response, const string what)
{
   g_access_token  = JsonString(response, "access_token", 0);
   g_refresh_token = JsonString(response, "refresh_token", 0);

   // "id" is searched from the "user" object rather than the whole body: the
   // response has several id-ish fields and the first bare "id" match in a
   // Supabase token payload is not guaranteed to be the user's.
   const int user_at = StringFind(response, "\"user\":{", 0);
   g_user_id = (user_at >= 0) ? JsonString(response, "id", user_at) : "";

   if(StringLen(g_access_token) == 0 || StringLen(g_user_id) == 0)
   {
      Print("EdgewiseSync: ", what, " returned no usable session. Response: ", response);
      return(false);
   }

   Print("EdgewiseSync: signed in as ", SupabaseEmail, " (user ", g_user_id, ").");
   return(true);
}

string AuthHeaders()
{
   return("apikey: " + SupabaseKey + "\r\n"
          "Content-Type: application/json\r\n");
}

//+------------------------------------------------------------------+
//| JSON                                                             |
//+------------------------------------------------------------------+
//
// Hand-rolled because MQL5 has no JSON library in the standard distribution and
// this payload is small and fully known. Every field here maps to a column in
// public.trades (see scripts/add-broker-sync.sql).
//
string BuildTradeJson(const TradeRecord &record)
{
   const long account = AccountInfoInteger(ACCOUNT_LOGIN);

   string json = "{";

   // Sent explicitly even though the column defaults to auth.uid(). It has to
   // be present for the on_conflict target to resolve, and the insert policy
   // then checks it against the JWT -- so a wrong value is rejected rather than
   // silently written.
   json += "\"user_id\":\""      + g_user_id + "\",";

   json += "\"pair\":\""        + JsonEscape(record.symbol) + "\",";
   json += "\"direction\":\""   + record.direction + "\",";
   json += "\"entry_price\":"   + DoubleToString(record.entry_price, record.digits) + ",";
   json += "\"exit_price\":"    + DoubleToString(record.exit_price, record.digits) + ",";
   json += "\"size\":"          + DoubleToString(record.volume, 2) + ",";
   json += "\"profit_loss\":"   + DoubleToString(record.profit, 2) + ",";
   json += "\"commission\":"    + DoubleToString(record.commission, 2) + ",";
   json += "\"swap\":"          + DoubleToString(record.swap, 2) + ",";

   // setup_type is deliberately null: the broker has no idea WHY the trade was
   // taken. The user classifies it in the app afterwards, which is also where
   // the mood gets attached. That is the whole point of the tagging queue.
   json += "\"setup_type\":null,";
   json += "\"notes\":null,";

   json += "\"source\":\""        + SOURCE_TAG + "\",";
   json += "\"external_id\":\""   + IntegerToString(record.ticket) + "\",";
   json += "\"account_login\":\"" + IntegerToString(account) + "\",";

   json += "\"opened_at\":\"" + IsoUtc(record.opened_at) + "\",";
   json += "\"closed_at\":\"" + IsoUtc(record.closed_at) + "\",";

   // created_at is set to the CLOSE time on purpose. Every screen in the app
   // sorts and groups by created_at, so this one assignment puts synced trades
   // in the right place on the calendar and the equity curve with no app change.
   json += "\"created_at\":\"" + IsoUtc(record.closed_at) + "\"";

   json += "}";

   return(json);
}

//+------------------------------------------------------------------+
//| Read a string value out of a flat JSON body.                      |
//+------------------------------------------------------------------+
//
// Enough JSON for the two shapes this EA reads, and no more. Scans past escaped
// quotes so a value containing \" does not terminate early.
//
string JsonString(const string json, const string key, const int from)
{
   const string needle = "\"" + key + "\":\"";
   const int at = StringFind(json, needle, from);

   if(at < 0)
      return("");

   const int start  = at + StringLen(needle);
   const int length = StringLen(json);

   int i = start;

   while(i < length)
   {
      const ushort c = StringGetCharacter(json, i);

      if(c == '\\')
      {
         i += 2;
         continue;
      }

      if(c == '"')
         break;

      i++;
   }

   return(StringSubstr(json, start, i - start));
}

//+------------------------------------------------------------------+
//| Server clock offset from UTC, rounded to a real timezone step.    |
//+------------------------------------------------------------------+
//
// TimeTradeServer() and TimeGMT() are read a few microseconds apart, so their
// difference carries a second or two of jitter that no timezone actually has.
// Rounding to the nearest 15 minutes removes it -- every real offset on earth is
// a multiple of 15 minutes.
//
int RoundedServerOffset()
{
   const int raw  = (int)(TimeTradeServer() - TimeGMT());
   const int step = 900;

   return((int)MathRound((double)raw / step) * step);
}

//+------------------------------------------------------------------+
//| ISO-8601 UTC, e.g. 2026-08-11T14:32:07Z                          |
//+------------------------------------------------------------------+
//
// The explicit Z matters. Without a zone Postgres applies the server's
// timezone, which would shift every trade by hours and move some onto the wrong
// calendar day.
//
// KNOWN LIMIT: MT5 reports deal times in broker-server time and exposes only
// the server's CURRENT offset from UTC -- there is no API for what the offset
// was last March. So the cached offset is applied to every deal, and a
// backfilled trade from the other side of a daylight-saving change can land an
// hour out, which at the edges of a day can move it to the neighbouring date.
// Live sync -- the normal path, and every trade after setup -- is always
// correct, because then the current offset IS the deal's offset.
//
string IsoUtc(const datetime value)
{
   const datetime utc = value - g_utc_offset;

   MqlDateTime parts;
   TimeToStruct(utc, parts);

   return(StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       parts.year, parts.mon, parts.day,
                       parts.hour, parts.min, parts.sec));
}

//+------------------------------------------------------------------+
//| Escape the characters that can appear in the values we send.       |
//+------------------------------------------------------------------+
string JsonEscape(const string value)
{
   string out = value;

   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");

   return(out);
}

//+------------------------------------------------------------------+
//| Send one trade. Returns true when the row is safely stored.       |
//+------------------------------------------------------------------+
bool SendTrade(const TradeRecord &record)
{
   const string json = BuildTradeJson(record);

   if(VerboseLog || DryRun)
      Print("EdgewiseSync: ", record.direction, " ", record.volume, " ",
            record.symbol, " @ ", DoubleToString(record.entry_price, record.digits),
            " -> ", DoubleToString(record.exit_price, record.digits),
            " P/L ", DoubleToString(record.profit, 2),
            " (deal ", record.ticket, ")");

   if(DryRun)
   {
      Print("EdgewiseSync [dry run] ", json);
      return(true);
   }

   return(PostTrade(json, record.ticket));
}

//+------------------------------------------------------------------+
//| HTTP POST to PostgREST, refreshing the session once on a 401.      |
//+------------------------------------------------------------------+
bool PostTrade(const string json, const long ticket)
{
   int status = PostTradeOnce(json);

   // 401 is an expired access token, which a terminal left open for more than an
   // hour will hit on every send. Refresh and retry once; a second 401 is a real
   // authorisation problem and is reported rather than looped on.
   if(status == 401)
   {
      Print("EdgewiseSync: access token expired, refreshing...");

      if(!RefreshSession())
         return(false);

      status = PostTradeOnce(json);
   }

   if(status == -1)
   {
      ReportWebRequestFailure("deal " + IntegerToString(ticket));
      return(false);
   }

   // 200 OK, 201 Created, 204 No Content (what return=minimal gives on success).
   if(status == 200 || status == 201 || status == 204)
      return(true);

   Print("EdgewiseSync: deal ", ticket, " rejected with HTTP ", status,
         ": ", g_last_response);

   if(status == 401 || status == 403)
      Print("EdgewiseSync: the journal refused the write. Confirm this account owns ",
            "the trades, and that scripts/secure-rls.sql has been run.");

   if(status == 404)
      Print("EdgewiseSync: no trades table found. Run scripts/create-trades-table.sql ",
            "and scripts/add-broker-sync.sql first.");

   if(status == 400)
      Print("EdgewiseSync: the table is missing the sync columns, or the dedup index ",
            "does not match. Run scripts/add-broker-sync.sql then scripts/secure-rls.sql.");

   return(false);
}

int PostTradeOnce(const string json)
{
   const string url = SupabaseUrl + TRADES_PATH;

   // resolution=merge-duplicates makes this an upsert against the unique index
   // on (user_id, source, external_id), so re-sending a deal updates it instead
   // of creating a second row. return=minimal keeps the response tiny.
   const string headers =
      "apikey: " + SupabaseKey + "\r\n"
      "Authorization: Bearer " + g_access_token + "\r\n"
      "Content-Type: application/json\r\n"
      "Prefer: resolution=merge-duplicates,return=minimal\r\n";

   return(HttpPost(url, headers, json, g_last_response));
}

//+------------------------------------------------------------------+
//| One POST. Returns the HTTP status, or -1 when WebRequest failed.   |
//+------------------------------------------------------------------+
int HttpPost(const string url, const string headers, const string body, string &response)
{
   char post[];
   char result[];
   string result_headers;

   // No trailing null: StringToCharArray appends one by default and PostgREST
   // rejects the body as malformed JSON if it is included.
   const int len = StringToCharArray(body, post, 0, StringLen(body), CP_UTF8);

   if(len > 0)
      ArrayResize(post, len);

   ResetLastError();

   const int status = WebRequest("POST", url, headers, HTTP_TIMEOUT,
                                 post, result, result_headers);

   response = (ArraySize(result) > 0)
              ? CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8)
              : "";

   return(status);
}

//+------------------------------------------------------------------+
//| Explain a WebRequest that never left the terminal.                |
//+------------------------------------------------------------------+
void ReportWebRequestFailure(const string what)
{
   const int error = GetLastError();

   Print("EdgewiseSync: WebRequest failed for ", what, ", error ", error, ".");

   // 4014 is the whitelist. It is by far the most common failure and the
   // message is worthless without the fix, so spell the fix out.
   if(error == 4014)
      Print("EdgewiseSync: add ", SupabaseUrl,
            " under Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL.");
   else
      Print("EdgewiseSync: check the URL is exactly your project URL with no trailing slash, ",
            "and that it is whitelisted under Tools -> Options -> Expert Advisors.");
}
//+------------------------------------------------------------------+

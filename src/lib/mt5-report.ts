/**
 * Read an MT5 "Report" HTML file into trades the journal can store.
 *
 * ## Why this exists
 *
 * The advisor in `mt5/` is the good path: set it up once and closed trades
 * arrive on their own. But it is a fifteen-minute setup involving a URL
 * whitelist, and it only ever runs on a PC. The ask it does not answer is "I
 * just want my last year of trades in here now, from my phone, without
 * installing anything."
 *
 * There is no way to do that from an account number. An MT5 login is an
 * identifier, not a credential — no MetaQuotes API turns one into a trade list,
 * and the services that appear to do it are holding the account's investor
 * password and logging in from their own servers. What MT5 *will* do, in two
 * clicks and with no password anywhere, is export the history it already has.
 * So the app reads that file.
 *
 * ## What it has to survive
 *
 * The report is a human-facing document, not an interchange format, and it is
 * built by the terminal rather than by us. So the parser matches columns **by
 * their header text**, never by position: a broker or build that adds a column
 * shifts every index, and an index-based reader would keep going and write
 * prices into the size column. Matching by name means an unrecognised layout
 * stops with a message naming the headers it actually found, which is a
 * five-minute fix instead of a silent corruption of someone's win rate.
 *
 * Two headers appear twice — `Time` and `Price`, once for the open and once for
 * the close — so those two are resolved by order of appearance. That is the one
 * place position matters, and it is checked: fewer than two of either is an
 * error rather than a guess.
 *
 * ## Timestamps
 *
 * The report prints broker server time with no offset marker anywhere in the
 * file, so there is nothing to convert from. Times are therefore read as UTC and
 * a warning says so. The advisor, which can read the offset from the terminal,
 * sends true UTC — so a trade imported both ways could differ by the broker's
 * offset, usually two or three hours. That matters only near midnight, where it
 * can move a trade onto the neighbouring day in the calendar, and it is the
 * reason an import never overwrites a row the advisor already wrote.
 */

/** One closed position, exactly as the report printed it. */
export type ReportPosition = {
  /** The report's `Position` column — the dedup key, matching the advisor. */
  positionId: string;
  /** Upper-cased: the report prints symbols lowercase, manual entry stores them upper. */
  symbol: string;
  direction: 'buy' | 'sell';
  volume: number;
  openPrice: number;
  closePrice: number;
  /** ISO 8601. Read as UTC — see the note on timestamps above. */
  openedAt: string;
  closedAt: string;
  commission: number;
  swap: number;
  /** The `Profit` column on its own, before costs. */
  profit: number;
  /** What actually hit the account: profit + commission + swap. */
  netProfit: number;
};

export type Mt5Report = {
  /** Digits from the report's `Account:` line, or null if it was not printed. */
  accountLogin: string | null;
  positions: ReportPosition[];
  /** Things worth telling the user that are not failures. */
  warnings: string[];
};

/**
 * A parse that could not continue, carrying a message written for the person
 * holding the file rather than for a log.
 */
export class Mt5ReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Mt5ReportError';
  }
}

const ROW_PATTERN = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_PATTERN = /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Visible text of one cell: tags dropped, entities decoded, spacing collapsed. */
function cellText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every row in the document, each as its list of visible cell strings. */
function tableRows(html: string): string[][] {
  const rows: string[][] = [];

  for (const rowMatch of html.matchAll(ROW_PATTERN)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(CELL_PATTERN)) {
      cells.push(cellText(cellMatch[2]));
    }
    rows.push(cells);
  }

  return rows;
}

/**
 * A number as the report writes it.
 *
 * Thousands are separated by a space (already collapsed by `cellText`) and the
 * decimal mark is a dot. A comma is only ever a thousands separator here, and
 * only alongside a dot — so it is dropped in that case and left alone
 * otherwise, where it would be ambiguous. An ambiguous cell returns null and
 * becomes a named error rather than a value silently out by a factor of a
 * hundred.
 */
function parseNumber(raw: string): number | null {
  let text = raw.replace(/\s/g, '');

  if (text === '' || text === '-') {
    return null;
  }

  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/,/g, '');
  }

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

const REPORT_TIME = /^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** `2026.08.10 14:23:11` to ISO. Read as UTC — see the note on timestamps. */
function parseReportTime(raw: string): string | null {
  const match = REPORT_TIME.exec(raw.trim());

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;
  const paddedHour = hour.padStart(2, '0');

  return `${year}-${month}-${day}T${paddedHour}:${minute}:${second ?? '00'}.000Z`;
}

/**
 * Where each field sits in the Positions table, resolved from the header row.
 */
type PositionColumns = {
  openTime: number;
  positionId: number;
  symbol: number;
  type: number;
  volume: number;
  openPrice: number;
  closeTime: number;
  closePrice: number;
  commission: number;
  swap: number;
  profit: number;
};

/** A row is the Positions header if it names the columns we depend on. */
function looksLikeHeader(cells: string[]): boolean {
  const lower = cells.map((cell) => cell.toLowerCase());
  return lower.includes('symbol') && lower.includes('volume') && lower.includes('profit');
}

function resolveColumns(cells: string[]): PositionColumns {
  const lower = cells.map((cell) => cell.toLowerCase().trim());

  const indexesOf = (name: string) =>
    lower.reduce<number[]>((found, cell, index) => {
      if (cell === name) {
        found.push(index);
      }
      return found;
    }, []);

  const times = indexesOf('time');
  const prices = indexesOf('price');

  const single = (name: string) => {
    const index = lower.indexOf(name);
    if (index === -1) {
      throw new Mt5ReportError(
        `This report has no "${name}" column, so there is no safe way to read it. ` +
          `The columns it does have are: ${cells.filter(Boolean).join(', ')}. ` +
          'Export again from the History tab with Report, and pick HTML.',
      );
    }
    return index;
  };

  // The open and close columns share their names, so they can only be told
  // apart by order. Anything else is a layout this parser has not seen, and
  // guessing which is which would put the exit price on the entry.
  if (times.length < 2 || prices.length < 2) {
    throw new Mt5ReportError(
      'This report does not have the two Time and two Price columns a Positions ' +
        `table has (found ${times.length} Time and ${prices.length} Price). ` +
        `Its columns are: ${cells.filter(Boolean).join(', ')}. ` +
        'This usually means the file is an Orders or Deals export rather than a history report.',
    );
  }

  return {
    openTime: times[0],
    closeTime: times[1],
    openPrice: prices[0],
    closePrice: prices[1],
    positionId: single('position'),
    symbol: single('symbol'),
    type: single('type'),
    volume: single('volume'),
    commission: single('commission'),
    swap: single('swap'),
    profit: single('profit'),
  };
}

/** Section headings in the report, in the order the terminal writes them. */
const SECTIONS = ['positions', 'orders', 'deals'] as const;

function sectionName(cells: string[]): string | null {
  const filled = cells.filter((cell) => cell.length > 0);

  if (filled.length !== 1) {
    return null;
  }

  const name = filled[0].toLowerCase();
  return (SECTIONS as readonly string[]).includes(name) ? name : null;
}

/**
 * The account login, from the `Account:` line the terminal writes above the
 * tables. Reported as digits only: the cell also carries currency, server and
 * account type, none of which belongs in a column called `account_login`.
 */
function findAccountLogin(rows: string[][]): string | null {
  for (const cells of rows) {
    for (let index = 0; index < cells.length; index += 1) {
      if (!/^account\b/i.test(cells[index])) {
        continue;
      }

      // Either "Account: 12345678 (USD, Broker-Server)" in one cell, or
      // "Account:" in this one and the value in the next.
      const candidates = [cells[index], cells[index + 1] ?? ''];

      for (const candidate of candidates) {
        const digits = /(\d{4,})/.exec(candidate);
        if (digits) {
          return digits[1];
        }
      }
    }
  }

  return null;
}

export function parseMt5Report(text: string): Mt5Report {
  if (!/<t(able|r)\b/i.test(text)) {
    // The most likely wrong file by far is the XLSX the same menu offers, which
    // is a ZIP and unreadable without a spreadsheet library. Worth naming.
    const looksBinary = /^PK\x03\x04/.test(text) || text.includes('\x00');

    throw new Mt5ReportError(
      looksBinary
        ? 'That file is not HTML — it looks like an .xlsx workbook. In MetaTrader, ' +
            'right-click the History tab, choose Report, and pick HTML rather than XLSX.'
        : 'That file has no tables in it, so it is not an MT5 history report. In ' +
            'MetaTrader: Toolbox, History tab, right-click, Report, HTML.',
    );
  }

  const rows = tableRows(text);
  const warnings: string[] = [];

  let columns: PositionColumns | null = null;
  let requiredCells = 0;
  let inPositions = false;
  let skippedRows = 0;
  const positions: ReportPosition[] = [];

  for (const cells of rows) {
    const section = sectionName(cells);

    if (section !== null) {
      // Positions is the only section with one row per trade. Orders and Deals
      // describe the individual instructions and fills that make one up, and
      // reading those as trades would multiply the history.
      inPositions = section === 'positions';
      columns = null;
      requiredCells = 0;
      continue;
    }

    if (!inPositions) {
      continue;
    }

    if (columns === null) {
      if (looksLikeHeader(cells)) {
        columns = resolveColumns(cells);
        requiredCells = Math.max(...Object.values(columns)) + 1;
      }
      continue;
    }

    // Under the trades come the Commission, Swap and Profit totals, and the
    // terminal writes those with colspan -- three cells where a trade row has
    // thirteen. Cell count is the reliable tell. The position-id test below is
    // not: a whole-number total would pass it, and the row would then be
    // reported to the user as a skipped deposit.
    if (cells.length < requiredCells) {
      continue;
    }

    const positionId = cells[columns.positionId] ?? '';

    // Below the trades the terminal writes totals and summary rows, which have
    // no position id. That is the signal the table has ended, not a bad row.
    if (!/^\d+$/.test(positionId)) {
      continue;
    }

    const direction = (cells[columns.type] ?? '').toLowerCase();

    if (direction !== 'buy' && direction !== 'sell') {
      // Balance operations and non-trades share the table in some builds.
      // Skipped rather than guessed, and counted so the total is honest.
      skippedRows += 1;
      continue;
    }

    const volume = parseNumber(cells[columns.volume] ?? '');
    const openPrice = parseNumber(cells[columns.openPrice] ?? '');
    const closePrice = parseNumber(cells[columns.closePrice] ?? '');
    const profit = parseNumber(cells[columns.profit] ?? '');
    const commission = parseNumber(cells[columns.commission] ?? '') ?? 0;
    const swap = parseNumber(cells[columns.swap] ?? '') ?? 0;
    const openedAt = parseReportTime(cells[columns.openTime] ?? '');
    const closedAt = parseReportTime(cells[columns.closeTime] ?? '');

    if (
      volume === null ||
      openPrice === null ||
      closePrice === null ||
      profit === null ||
      openedAt === null ||
      closedAt === null
    ) {
      throw new Mt5ReportError(
        `Position ${positionId} in this report could not be read: ` +
          `volume "${cells[columns.volume] ?? ''}", ` +
          `prices "${cells[columns.openPrice] ?? ''}" and "${cells[columns.closePrice] ?? ''}", ` +
          `times "${cells[columns.openTime] ?? ''}" and "${cells[columns.closeTime] ?? ''}", ` +
          `profit "${cells[columns.profit] ?? ''}". ` +
          'Nothing has been imported. Send this report to support rather than ' +
          'editing it — the numbers matter.',
      );
    }

    positions.push({
      positionId,
      symbol: (cells[columns.symbol] ?? '').toUpperCase(),
      direction,
      volume,
      openPrice,
      closePrice,
      openedAt,
      closedAt,
      commission,
      swap,
      // Never derived from prices. XAUUSD has a contract size of 100, so a $1
      // move on one lot is $100, and commission and swap are invisible to any
      // price formula. This is the same rule the advisor follows.
      profit,
      netProfit: profit + commission + swap,
    });
  }

  if (columns === null && positions.length === 0) {
    throw new Mt5ReportError(
      'This file has tables but no Positions section, so there are no closed ' +
        'trades in it. In MetaTrader, set the History tab period to All before ' +
        'exporting — a report for a range with no closed trades comes out empty.',
    );
  }

  if (positions.length === 0) {
    throw new Mt5ReportError(
      'This report has a Positions table with no trades in it. Set the History ' +
        'tab period to All and export again.',
    );
  }

  if (skippedRows > 0) {
    warnings.push(
      `${skippedRows} ${skippedRows === 1 ? 'row was' : 'rows were'} not buys or ` +
        'sells — deposits or adjustments — and were left out.',
    );
  }

  warnings.push(
    'Times in an MT5 report are your broker’s server time, which the file ' +
      'does not state, so they are read as UTC.',
  );

  return { accountLogin: findAccountLogin(rows), positions, warnings };
}

/** How much of the report to take. The user's words were "all or 1 month". */
export type ImportRange = 'all' | 'last-30-days';

export const RANGE_DAYS: Record<ImportRange, number | null> = {
  all: null,
  'last-30-days': 30,
};

/**
 * A row ready for `trades`.
 *
 * `setup_type` and `notes` are deliberately absent rather than null: they are
 * the user's to fill in, and naming them in the payload at all would let a
 * second import overwrite a classification that had been made in between.
 */
export type TradeInsert = {
  user_id: string;
  pair: string;
  direction: 'buy' | 'sell';
  entry_price: number;
  exit_price: number;
  size: number;
  profit_loss: number;
  /** Stored beside the net figure so a report row carries what an advisor row does. */
  commission: number;
  swap: number;
  source: 'mt5';
  external_id: string;
  account_login: string | null;
  opened_at: string;
  closed_at: string;
};

export type ImportPlan = {
  /** Only the rows that are not in the journal already. */
  inserts: TradeInsert[];
  /** How many positions the report held, after the range filter. */
  inRange: number;
  /** Of those, how many are already stored. */
  alreadyHere: number;
  /** Close dates of the rows to be written, for the preview. ISO, or null. */
  earliest: string | null;
  latest: string | null;
};

export type PlanOptions = {
  range: ImportRange;
  /** `external_id` of every MT5-sourced trade already loaded. */
  existingExternalIds: ReadonlySet<string>;
  userId: string;
  /** Injectable for tests; defaults to now. */
  now?: Date;
};

/**
 * Decide what an import would write, without writing it.
 *
 * Existing rows are filtered out here rather than left to the database, for two
 * reasons. The obvious one is an honest count in the preview. The other is that
 * the advisor's copy of a trade is better than the report's — it carries true
 * UTC timestamps rather than unlabelled server time — so a row that is already
 * present should be left exactly as it is.
 */
export function planImport(report: Mt5Report, options: PlanOptions): ImportPlan {
  const { range, existingExternalIds, userId, now = new Date() } = options;

  const days = RANGE_DAYS[range];
  const cutoff =
    days === null ? null : new Date(now.getTime() - days * 24 * 60 * 60 * 1000).getTime();

  const inRange = report.positions.filter(
    (position) => cutoff === null || Date.parse(position.closedAt) >= cutoff,
  );

  const fresh = inRange.filter((position) => !existingExternalIds.has(position.positionId));

  const inserts: TradeInsert[] = fresh.map((position) => ({
    user_id: userId,
    pair: position.symbol,
    direction: position.direction,
    entry_price: position.openPrice,
    exit_price: position.closePrice,
    size: position.volume,
    profit_loss: position.netProfit,
    commission: position.commission,
    swap: position.swap,
    source: 'mt5',
    external_id: position.positionId,
    account_login: report.accountLogin,
    opened_at: position.openedAt,
    closed_at: position.closedAt,
  }));

  const closes = fresh.map((position) => Date.parse(position.closedAt)).sort((a, b) => a - b);

  return {
    inserts,
    inRange: inRange.length,
    alreadyHere: inRange.length - fresh.length,
    earliest: closes.length > 0 ? new Date(closes[0]).toISOString() : null,
    latest: closes.length > 0 ? new Date(closes[closes.length - 1]).toISOString() : null,
  };
}

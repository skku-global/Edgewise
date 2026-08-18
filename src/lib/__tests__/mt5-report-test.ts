/**
 * Tests for reading an MT5 "Report" export.
 *
 * These are mostly about the ways a report is not a data format. Two columns are
 * called Time and two are called Price; symbols come out lowercase; thousands are
 * split by a non-breaking space; the totals under the table use colspan so they
 * have a fraction of the cells; and two more sections sit below the trades, one of
 * which (Deals) has Symbol, Volume and Profit columns too — so a parser that goes
 * hunting for a header rather than tracking which section it is in would read the
 * individual fills as trades and multiply the history.
 *
 * The failure that matters here is not a crash. It is a mis-mapped column that
 * writes a price into the size field, or a P/L derived from prices, because either
 * one silently changes the win rate the whole app is built on. So the error cases
 * get as much attention as the happy path: every one of them has to stop, and say
 * what it saw.
 */

import { readFileSync } from 'fs';
import path from 'path';

import { Mt5ReportError, parseMt5Report, planImport } from '../mt5-report';

const REPORT = readFileSync(
  path.join(__dirname, '..', '__fixtures__', 'mt5-report.html'),
  'utf8',
);

const report = parseMt5Report(REPORT);

const USER = 'user-uuid-0000';
const NONE: ReadonlySet<string> = new Set<string>();

/**
 * The fixture's own Date line. Fixed, so the 30-day tests are not a function of
 * the day they happen to run on.
 */
const NOW = new Date('2026-08-18T12:00:00.000Z');

/** The Positions header, and one good row, for the malformed-input cases. */
const HEADER =
  '<tr><td>Time</td><td>Position</td><td>Symbol</td><td>Type</td><td>Volume</td>' +
  '<td>Price</td><td>S / L</td><td>T / P</td><td>Time</td><td>Price</td>' +
  '<td>Commission</td><td>Swap</td><td>Profit</td></tr>';

const ROW =
  '<tr><td>2026.08.01 09:15:22</td><td>512345678</td><td>eurusd</td><td>buy</td>' +
  '<td>0.50</td><td>1.09120</td><td></td><td></td><td>2026.08.01 11:42:07</td>' +
  '<td>1.09480</td><td>-3.50</td><td>-1.20</td><td>180.00</td></tr>';

const positions = (body: string) =>
  '<table><tr><td>Positions</td></tr>' + body + '</table>';

describe('parseMt5Report', () => {
  it('reads the account login without the currency, server or account type', () => {
    expect(report.accountLogin).toBe('12345678');
  });

  it('reads one row per closed position, in document order', () => {
    expect(report.positions.map((position) => position.positionId)).toEqual([
      '512345678',
      '512345679',
      '512345680',
    ]);
  });

  it('ignores the Deals section, whose columns look like the ones it wants', () => {
    // 712345678 and 712345679 are the two fills that make up the first trade.
    // Reading them would turn one trade into two, both with the wrong P/L.
    const ids = report.positions.map((position) => position.positionId);
    expect(ids.some((id) => id.startsWith('7'))).toBe(false);
  });

  it('maps every field by its header name', () => {
    const { netProfit, ...rest } = report.positions[0];

    expect(rest).toEqual({
      positionId: '512345678',
      symbol: 'EURUSD',
      direction: 'buy',
      volume: 0.5,
      openPrice: 1.0912,
      closePrice: 1.0948,
      openedAt: '2026-08-01T09:15:22.000Z',
      closedAt: '2026-08-01T11:42:07.000Z',
      commission: -3.5,
      swap: -1.2,
      profit: 180,
    });
    expect(netProfit).toBeCloseTo(175.3, 10);
  });

  it('upper-cases the symbol, which the report prints in lowercase', () => {
    expect(report.positions.map((position) => position.symbol)).toEqual([
      'EURUSD',
      'XAUUSD',
      'GBPUSD',
    ]);
  });

  it('reads a thousands separator written as a non-breaking space', () => {
    expect(report.positions[1].profit).toBe(1245);
    expect(report.positions[1].netProfit).toBeCloseTo(1238, 10);
  });

  it('takes P/L from the Profit column, never from the prices', () => {
    // XAUUSD has a contract size of 100, so this 12.45 move on one lot is $1,245.
    // Commission and swap are invisible to any price formula as well. Deriving
    // P/L here would understate the trade by two orders of magnitude.
    const gold = report.positions[1];
    const priceMove = (gold.openPrice - gold.closePrice) * gold.volume;

    expect(priceMove).toBeCloseTo(12.45, 10);
    expect(gold.profit).toBe(1245);
  });

  it('reads times as UTC and warns that they are really server time', () => {
    expect(report.positions[2].closedAt).toBe('2026-08-16T01:10:00.000Z');
    expect(report.warnings.some((warning) => warning.includes('read as UTC'))).toBe(true);
  });

  it('leaves out rows that are not buys or sells, and says how many', () => {
    expect(report.positions).toHaveLength(3);
    expect(report.warnings.some((warning) => warning.includes('1 row was'))).toBe(true);
  });

  it('does not count the Commission, Swap and Profit totals as skipped trades', () => {
    // Three totals rows sit under the table. If they were being counted the
    // warning above would claim four.
    expect(report.warnings.some((warning) => warning.includes('4 rows'))).toBe(false);
  });

  it('ignores a summary row even when its number would pass as a position id', () => {
    // A whole number in the position column is exactly what the position-id test
    // cannot catch. Cell count is what rules these out: a summary row written
    // with colspan has two cells where a trade row has thirteen.
    const totals = '<tr><td>Total Trades:</td><td>4</td></tr>';
    const parsed = parseMt5Report(positions(HEADER + ROW + totals));

    expect(parsed.positions).toHaveLength(1);
    expect(parsed.warnings.some((warning) => warning.includes('not buys or sells'))).toBe(false);
  });
});

describe('parseMt5Report rejections', () => {
  it('names the xlsx workbook, which is the wrong file the same menu offers', () => {
    // A real ZIP local-file header. Built from char codes rather than escapes so
    // there are no invisible bytes sitting in this source file.
    const workbook = 'PK' + String.fromCharCode(3, 4) + 'binary bytes follow';

    expect(() => parseMt5Report(workbook)).toThrow(Mt5ReportError);
    expect(() => parseMt5Report(workbook)).toThrow(/xlsx/i);
  });

  it('rejects a file with no tables at all', () => {
    expect(() => parseMt5Report('just some text')).toThrow(/no tables/i);
  });

  it('refuses a file whose only section is Deals', () => {
    const dealsOnly = '<table><tr><td>Deals</td></tr>' + HEADER + ROW + '</table>';
    expect(() => parseMt5Report(dealsOnly)).toThrow(/no Positions section/i);
  });

  it('says the table was empty rather than importing nothing quietly', () => {
    expect(() => parseMt5Report(positions(HEADER))).toThrow(/no trades in it/i);
  });

  it('lists the headers it did find when a column it needs is missing', () => {
    const renamed = HEADER.replace('<td>Position</td>', '<td>Ticket</td>');

    expect(() => parseMt5Report(positions(renamed + ROW))).toThrow(/Ticket/);
    expect(() => parseMt5Report(positions(renamed + ROW))).toThrow(/no "position" column/i);
  });

  it('will not guess which Price is the entry when only one is present', () => {
    const flattened =
      '<tr><td>Time</td><td>Position</td><td>Symbol</td><td>Type</td><td>Volume</td>' +
      '<td>Price</td><td>Commission</td><td>Swap</td><td>Profit</td></tr>';

    expect(() => parseMt5Report(positions(flattened))).toThrow(/two Time and two Price/i);
  });

  it('stops on a row it cannot read instead of writing a wrong number', () => {
    const broken = ROW.replace('<td>0.50</td>', '<td>half a lot</td>');

    expect(() => parseMt5Report(positions(HEADER + broken))).toThrow(/could not be read/i);
    expect(() => parseMt5Report(positions(HEADER + broken))).toThrow(/512345678/);
  });
});

describe('planImport', () => {
  const plan = (range: 'all' | 'last-30-days', existing = NONE, now = NOW) =>
    planImport(report, { range, existingExternalIds: existing, userId: USER, now });

  it('takes the whole report when the range is all', () => {
    const all = plan('all');

    expect(all.inRange).toBe(3);
    expect(all.inserts).toHaveLength(3);
    expect(all.alreadyHere).toBe(0);
  });

  it('keeps only the last 30 days when asked for a month', () => {
    expect(plan('last-30-days').inserts.map((row) => row.external_id)).toEqual([
      '512345678',
      '512345680',
    ]);
  });

  it('includes a trade that closed exactly 30 days ago, and drops it a second later', () => {
    const oldest = Date.parse(report.positions[1].closedAt);
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    const onTheLine = plan('last-30-days', NONE, new Date(oldest + thirtyDays));
    const justPast = plan('last-30-days', NONE, new Date(oldest + thirtyDays + 1000));

    expect(onTheLine.inserts.map((row) => row.external_id)).toContain('512345679');
    expect(justPast.inserts.map((row) => row.external_id)).not.toContain('512345679');
  });

  it('leaves out trades the journal already has, and counts them for the preview', () => {
    const second = plan('all', new Set(['512345678']));

    expect(second.inRange).toBe(3);
    expect(second.alreadyHere).toBe(1);
    expect(second.inserts.map((row) => row.external_id)).toEqual(['512345679', '512345680']);
  });

  it('writes nothing at all on a re-import of the same file', () => {
    const everything = new Set(report.positions.map((position) => position.positionId));
    const again = plan('all', everything);

    expect(again.inserts).toHaveLength(0);
    expect(again.alreadyHere).toBe(3);
    expect(again.earliest).toBeNull();
  });

  it('builds a row the trades table accepts, carrying the account it came from', () => {
    const { profit_loss, ...rest } = plan('all').inserts[0];

    // Exact equality on purpose: it is also what proves setup_type and notes are
    // absent rather than null. See the note on TradeInsert for why that matters.
    expect(rest).toEqual({
      user_id: USER,
      pair: 'EURUSD',
      direction: 'buy',
      entry_price: 1.0912,
      exit_price: 1.0948,
      size: 0.5,
      commission: -3.5,
      swap: -1.2,
      source: 'mt5',
      external_id: '512345678',
      account_login: '12345678',
      opened_at: '2026-08-01T09:15:22.000Z',
      closed_at: '2026-08-01T11:42:07.000Z',
    });
    expect(profit_loss).toBeCloseTo(175.3, 10);
  });

  it('never names setup_type or notes, so a second import cannot wipe a tag', () => {
    const row = plan('all').inserts[0];

    expect('setup_type' in row).toBe(false);
    expect('notes' in row).toBe(false);
  });

  it('reports the span of what it would write, for the preview', () => {
    const all = plan('all');

    expect(all.earliest).toBe('2026-07-02T16:30:11.000Z');
    expect(all.latest).toBe('2026-08-16T01:10:00.000Z');
  });
});

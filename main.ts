// Dual-Swing — cbBTC 1m bot for btc-race-24h-20261118-1444.
//
// Philosophy: one position slot, two patient entries, one patient exit.
// The dev window (and the one before it) punishes every fast strategy we
// tested — naive dip-buying, z-score fades, VWAP swings and EMA/momentum
// breakouts all lose money on it, because dips keep falling and rallies
// grind slowly instead of spiking. The only entries that made money on
// BOTH available 24h windows were rare, selective ones that buy a real
// swing low and then ride the recovery for hours instead of scalping it:
//
//   CAP (capitulation): after a 1-hour fall of >= 200 bps that is still
//     falling fast (>= 60 bps in the last 15 minutes), buy 55% of equity.
//     This fires at most once or twice per day, at a genuine washout.
//   BASE (basing after a selloff): after a 6-hour fall of >= 120 bps,
//     when the last 2 hours traded in a narrow <= 150 bps range, price
//     has ticked >= 20 bps off the 2-hour low, and RSI(14) >= 40 (the
//     selling has stopped and momentum is turning), buy 60% of equity.
//     This buys the flat bottom after the washout, not the falling knife.
//
//   Exit (shared): take-profit +250 bps, hard stop -150 bps, a trailing
//     stop 150 bps under the best close since entry, or an 8-hour time
//     box — whichever comes first. No entries after bar 1200 (too late
//     in the window to recover), and an equity drawdown kill-switch
//     flattens everything at -7% and pauses entries for 300 bars.
//
// Sizing is a fixed fraction of equity; all indicator math is plain
// float64 on USD closes; no clock, no environment, no randomness, so the
// two graded runs are byte-identical. Local grades: +9.54 USDC on the
// 2026-11-18 dev window and +0.90 USDC on the 2026-11-17 window, one
// trade each, positive at double fees on both.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const SCALE = 1e5; // raw price units per USD
const SLIP = 200; // max slippage bps

const CAP_R60 = -200; // 1h return that marks a capitulation
const CAP_R15 = -60; //   ...still falling fast over 15m
const CAP_SIZE_BPS = 5500; // 55% of equity on a CAP entry
const CAP_TP = 250;
const BASE_R360 = -120; // 6h return that marks a selloff to base after
const BASE_RANGE = 150; // 2h range (bps) that counts as basing
const BASE_TICKUP = 20; // bps off the 2h low that counts as turning up
const BASE_RSI = 40; // RSI(14) floor: selling has stopped
const BASE_SIZE_BPS = 6000; // 60% of equity on a BASE entry
const BASE_TP = 250;
const SL_BPS = -150;
const TRAIL_BPS = -150; // trailing stop below the best close since entry
const MAX_HOLD = 480; // bars (8 hours)
const COOL = 30; // quiet bars after an exit
const LATE_BAR = 1200; // no new entries after this bar
const DD_KILL_BPS = -700;
const DD_PAUSE = 300;

const closes: number[] = [];
let seq = -1;
let qty = 0n;
let entryPx = 0;
let entrySeq = -1;
let bestClose = 0;
let takeProfit = CAP_TP;
let peakEquity = 1000;
let coolUntil = -1;
let pauseUntil = -1;

function retBps(h: number): number {
  if (closes.length <= h) return 0;
  const now = closes[closes.length - 1];
  return (now / closes[closes.length - 1 - h] - 1) * 10000;
}

function rsi(period: number): number {
  if (closes.length <= period) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  const avgG = gain / period;
  const avgL = loss / period;
  if (avgL === 0) return 100;
  if (avgG === 0) return 0;
  return 100 - 100 / (1 + avgG / avgL);
}

function buy(state: BarsState, fracBps: number): OrderInput | null {
  const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
  let notional = (state.equity * BigInt(fracBps)) / 10000n;
  if (notional > state.cash) notional = state.cash;
  if (notional < minNotional) return null;
  return { side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: SLIP };
}

function sellAll(): OrderInput | null {
  if (qty <= 0n) return null;
  return { side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: SLIP };
}

await runBars({
  onBatch(state: BarsState, batch) {
    for (const f of batch.fills ?? []) {
      if (f.symbol !== SYMBOL || f.status !== 'filled') continue;
      const px = Number(f.price) / SCALE;
      if (f.side === 'buy') {
        if (qty === 0n) {
          entryPx = px;
          entrySeq = seq + 1;
          bestClose = px;
        }
        qty += BigInt(f.qty);
      } else {
        qty = 0n;
        coolUntil = seq + 1 + COOL;
      }
    }

    const bar = (batch.bars ?? []).find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    seq = batch.seq;
    closes.push(Number(bar.c) / SCALE);
    if (closes.length > 721) closes.shift();

    const equity = Number(state.equity) / 1e6;
    peakEquity = Math.max(peakEquity, equity);
    if (state.warmingUp) return [];

    const close = closes[closes.length - 1];
    let orders: OrderInput[] = [];

    if (qty > 0n) {
      bestClose = Math.max(bestClose, close);
      const gain = (close / entryPx - 1) * 10000;
      const trail = (close / bestClose - 1) * 10000;
      const held = seq - entrySeq;
      if (gain >= takeProfit || gain <= SL_BPS || trail <= TRAIL_BPS || held >= MAX_HOLD) {
        const s = sellAll();
        if (s !== null) orders = [s];
      }
    } else if (seq >= coolUntil && seq >= pauseUntil && seq < LATE_BAR) {
      if (closes.length >= 60 && retBps(60) <= CAP_R60 && retBps(15) <= CAP_R15) {
        takeProfit = CAP_TP;
        const b = buy(state, CAP_SIZE_BPS);
        if (b !== null) orders = [b];
      } else if (closes.length >= 360) {
        const window = closes.slice(-120);
        let low = window[0];
        let high = window[0];
        for (const x of window) {
          if (x < low) low = x;
          if (x > high) high = x;
        }
        const rangeBps = (high / low - 1) * 10000;
        const upBps = (close / low - 1) * 10000;
        if (
          retBps(360) <= BASE_R360 &&
          rangeBps <= BASE_RANGE &&
          upBps >= BASE_TICKUP &&
          rsi(14) >= BASE_RSI
        ) {
          takeProfit = BASE_TP;
          const b = buy(state, BASE_SIZE_BPS);
          if (b !== null) orders = [b];
        }
      }
    }

    const dd = (equity / peakEquity - 1) * 10000;
    if (dd <= DD_KILL_BPS) {
      pauseUntil = seq + DD_PAUSE;
      if (qty > 0n) {
        const s = sellAll();
        orders = s !== null ? [s] : [];
      }
    }
    return orders;
  },
});

# btc-race-20261118-dual-swing

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/lampardkarunia/btc-race-20261118-dual-swing/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/lampardkarunia/btc-race-20261118-dual-swing/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

Dual-Swing: a patient cbBTC trading bot for make.fun's "Race a BTC trading bot live for 24 hours" ($250 in USDC).

One position slot, two patient entries, one patient exit. The dev window punishes every fast strategy — naive dip-buying, z-score fades, VWAP swings and EMA/momentum breakouts all lose money on it, because dips keep falling and rallies grind slowly instead of spiking. The only entries that made money on both available 24h windows were rare, selective ones that buy a real swing low and ride the recovery for hours instead of scalping it:

- **CAP (capitulation):** after a 1-hour fall of ≥ 200 bps that is still falling fast (≥ 60 bps in the last 15 minutes), buy 55% of equity.
- **BASE (basing after a selloff):** after a 6-hour fall of ≥ 120 bps, when the last 2 hours traded in a narrow ≤ 150 bps range, price has ticked ≥ 20 bps off the 2-hour low, and RSI(14) ≥ 40, buy 60% of equity.

**Exit (shared):** take-profit +250 bps, hard stop −150 bps, a trailing stop 150 bps under the best close since entry, or an 8-hour time box. No entries after bar 1200, and an equity drawdown kill-switch flattens everything at −7% and pauses entries for 300 bars.

**Local grades (kit `grade-local`, `--driver process`):**

| Window | Net PnL | Trades | Max drawdown |
|---|---|---|---|
| 2026-11-18 dev | **+9.54 USDC** | 1 round trip (win) | 0.83% |
| 2026-11-17 dev | **+0.90 USDC** | 1 round trip (win) | — |

Positive on both windows, and still positive at double fees on both (+9.09 / +0.42). The design was chosen over three other variants (adaptive range fade, Donchian breakout rider, VWAP swing) that all failed the dev gate on this window, and validated on the prior window plus a parameter-sensitivity sweep before submitting.

## Run it

```sh
node main.ts
```

The bot reads 1-minute cbBTC bars from stdin and answers with orders, following the `agent-fun/bars-replay/v1` protocol (`vendor/makefun-bars.ts`). Node 22, standard library only, no network, no clock, no randomness — two runs on the same data produce the same orders.

---

<sub>Entered on [make.fun](https://make.fun/?ref=vivid-coyote-81&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>

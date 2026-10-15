# Conditional AI Trade Plans

The existing confirmed technical signal ledger is unchanged. The captain's
BUY / HOLD / SELL is a separate, conditional, long-only opinion based on the
same captured daily data used by the four specialist roles. It is not a trade
execution, a predicted return, or a backtested strategy.

## Grounding

- The server derives complete candidate scenarios from SMA20, Bollinger 20/2,
  the last 20 closed bars' support/resistance, and ATR14. The model selects an
  existing scenario ID and action, not a new price.
- Pullbacks require a new confirmed bar showing a return inside the lower band
  and a rising close. SMA20 recovery requires a confirmed upward recovery,
  RSI40-70 and nonnegative MACD histogram. Touching a price alone is insufficient.
- BUY invalidation is entry minus 1.5 ATR. Candidate reward/risk must be at
  least 1.5, using a higher observed chart level, excluding fees and gaps.
  These constants are conservative design assumptions, not optimized values.
- SELL means reducing an existing holding, not opening a short. Support-loss
  and resistance-profit-taking cases require their stated confirmation.
- Index prices are observation levels in pt, not the price of an executable
  ETF/future. Displayed stock levels are not exchange tick-rounded order prices.

## Safety And Lifetime

Stale/missing quotes, old captured data, unavailable indicators, incomplete or
insufficient specialists, an insufficient captain, and unknown/mismatched IDs
produce HOLD without actionable price fields. The server checks quote age
using exchange hours. The four roles must be complete to publish a price plan.

Expiry is 24 hours from analysis start, or 6 hours for Bitcoin. Read-only expiry
checks and live quote invalidation never invoke an AI model. Follow-up chat gets
the validated effective plan and must not revive expired BUY/SELL decisions.
The office replay is only a local animation; it never requests a model.

## Entry Watch And Investor Tools

HOLD may carry a separate `buyWatch`, never an actionable BUY. The captain
selects `watchCandidateId` from the same validated BUY candidates. Explicit
null or an invalid ID suppresses the watch. If a new response omits the field,
the nearest valid candidate is labeled CHART rather than an AI recommendation.
Old stored runs without this field remain readable but need new analysis for
a watch price. Incomplete/insufficient analysis still suppresses all prices.

Watch lines use the label "observation", not "buy". Both chart and follow-up
chat receive the same effective plan. Expiry, missing/stale quotes, target
arrival, or invalidation remove the watch without calling a model.

The live distance and price-contact alert are free local calculations. Alerts
are opt-in, once per arming, and only work while the page is open and the quote
is usable. Price contact never confirms a daily-close rule or triggers an order.
New run selection resets alerts and simulation inputs. No automatic AI call.

The optional local-only simulation sizes a hypothetical holding by the smaller
of investment-budget/entry and assumed-loss-budget/(entry-invalidation).
Hynix uses whole shares and Bitcoin uses 8 decimal places; indices have no
quantity calculator. This is arithmetic, not a recommended position size.
Fees, taxes, slippage, gaps, FX and venue tick/lot rules are excluded. Assumed
invalidation-price execution is not a guaranteed maximum loss.

## Indicator References

- [Fidelity: Bollinger Bands](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/bollinger-bands)
  explains volatility envelopes and why band contact alone is insufficient.
- [Fidelity: ATR](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr)
  explains the volatility measure used for the scenario's risk buffer.
- [SEC Investor.gov: stop orders](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-15)
  explains why a reference stop price is not a guaranteed execution price.

These references describe indicators, not evidence that the site's chosen
conditions are profitable. There is no automatic order API or profit guarantee.

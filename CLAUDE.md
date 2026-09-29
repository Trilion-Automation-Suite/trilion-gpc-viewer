# CLAUDE.md — trilion-gpc-viewer

Reads and writes GOM Product Configurator `.gconfiguration` files. **This repo
is public.** No ZEISS catalogs, no PDB files, no customer data, no pricing
tables — those live in `TrilionSuite/internal-apps/gpc-viewer`.

## The one rule that matters

GPC reports *every* deserialization failure as **"This file has no Order-Part.
Perhaps this is a .gproducts which was renamed to .gconfiguration"**. It is a
catch-all. Four distinct causes have produced it, none of them a missing
relationship. Do not read the message literally.

**When a file is refused, read GPC's log before anything else:**

```
%APPDATA%\Made in Office\<appname>\logs\<yyyy-MM-dd>.txt
```

The dialog interpolates the *file path*; the exception — with the
XmlSerializer line and column — goes only to the log. It has answered in one
line what six hand-built bisect files could not.

## Where the answers are

Never infer from the reference `.gconfiguration` files what GPC will *accept*.
They show only what it happened to write, and a member left null is simply
absent — so a wrong guess agrees with every artifact right up until someone
fills in a field.

| Question | Source |
|---|---|
| element order, types, enum values | decompiled C# in `internal-apps/gpc-viewer/src/2.9.8` and `2.9.12` |
| what a blank order looks like | `order.xml` *inside* every `.gproducts` since PDB276 |
| what a line is made of | the catalog's `DependentListsData` — e.g. `SMA_EXT` |
| prices, discounts, rounding | `ArticlesData`, `DiscountsData`, `RoundingRules` in `config.xml` |
| how anything is calculated | the decompiled helpers, then check against a real file |

`src/lib/gpc/memberOrder.ts` is **generated** from those declarations by
`internal-apps/gpc-viewer/fidelity/harness/gen-member-order.mjs`. Do not hand-edit
it. `validateOrderXml` checks a document against it, enum values included; run
it over anything new before shipping.

## Things that look right and are not

- **Enums travel as the member name, not the UI label.** `AddressType` is
  `Customer | GOMPartner | HomCenter | Other`. "GOM Partner" is what GPC
  *displays*.
- **DP is derived from `DiscountsData`**, not from a price list's `Dp` column.
  No discount row for an MPG means DP equals MSRP.
- **PDB290's MSRP rules round *down*** — to 10 for a licence, 1 for an
  agreement. Miss it and you are out by single-digit euros, which reads as
  noise and is the difference between matching GPC and not.
- **`OrderArticle.Amount` is an `int`.** Fractional quantities are
  unrepresentable, not merely unusual.
- **`IsOlderSelected` is a dropdown choice**, not an absent date. While it is
  set the missing months are the catalog maximum whatever date is stored.

## Display-only data

Some things GPC recomputes on open and never stores — the lapsed-cover upgrade
is the example (`src/lib/gpc/reentry.ts`). Compute them for display; **write
nothing**. A save must leave the stored totals exactly as GPC left them.

## Before believing a UI report

The app is a PWA with a service worker, and Safari holds it hard. Several
"still broken" reports have been stale bundles. Check the error text or version
against what is actually in `main` before debugging; if the message quotes a
string that no longer exists in the source, it is a cached build.

Safari also has no `type="month"` picker and falls back to a text box, so
anything relying on that control needs a placeholder and a pattern.

## Working here

- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` before every
  commit. One pre-existing `react-refresh` warning is expected.
- The fidelity ladder lives in the private repo:
  `cd internal-apps/gpc-viewer/fidelity && node harness/verify.mjs --all`.
  M0–M5 green, M6 open. Never mark a milestone green without the scoreboard
  line that proves it.
- Reproduce before theorising. Several reports have looked like one thing and
  been another — "order has no PriceList" was the paste path ignoring the
  block's own value, not a missing field.
- Say plainly what was **not** verified. Nothing here renders Safari or runs
  GPC; visual and configurator-side claims are reasoned, not seen.

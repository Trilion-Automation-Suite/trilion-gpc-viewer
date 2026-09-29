# CLAUDE.md — trilion-gpc-viewer

Reads and writes GOM Product Configurator `.gconfiguration` files. **This repo
is public.** No ZEISS catalogs, no PDB files, no customer data, no pricing
tables — those live in `TrilionSuite/internal-apps/gpc-viewer`.

## The one rule that matters

GPC reports *every* deserialization failure as **"This file has no Order-Part.
Perhaps this is a .gproducts which was renamed to .gconfiguration"**. It is a
catch-all. Four distinct causes have produced it, none of them a missing
relationship. Do not read the message literally.

**Read GPC's log before anything else.** On Q17 it named both failing frames in
one read, after a diff of two conversions had found the right structure and the
wrong completeness — and it showed the failure was not a deserialization error at
all. Ask for the log first, every time:

```
%APPDATA%\Made in Office\<appname>\logs\<yyyy-MM-dd>.txt
```

The dialog interpolates the *file path*; the exception — with the
XmlSerializer line and column — goes only to the log. It has answered in one
line what six hand-built bisect files could not. The crash may be nowhere near
deserialization: Q17's was `ArgumentOutOfRangeException` in
`DependentListDataFactoryExt.InitRuntimeData`, with the file parsing fine.

**Then, if GPC has produced its own version of the same order, diff the two.**
Count every element path in both `order.xml` files and print only the paths whose
counts disagree; then compare the *shape* of each leaf value (int / dec / bool /
date / empty / text) and flag a shape appearing on one side only. `cmp -l` the two
`config.xml` files: a few differing bytes in 47 MB says the catalog is being
re-serialised rather than copied.

**Best of all, ask for a re-save.** GPC opening one of our files and saving it
back is the authoritative answer to "what should this order look like on this
catalog" for that exact order. It settled the `##Euro`/`##Partner` question:
GPC recreated `##Partner`, the *selected* list, and not `##Euro` — they are a
cache `AdministrationDataExt` builds on demand, not a required part.

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

**`validateOrderXml` and the harness tools are regex scanners.** They check
member order and enum values; they cannot see that a document is *malformed* —
an unclosed tag or an unbound prefix passes them. Parse anything suspect with a
real parser as its own step: it is the cheapest fatal cause and nothing else
here tests for it.

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
- **An order mirrors a dependent list's whole option tree, and GPC resolves it
  at two levels.** `SectionScreenData` is indexed *positionally* against the
  catalog in `DependentListDataFactoryExt.InitRuntimeData` — a count that
  disagrees is an `ArgumentOutOfRangeException` before any window opens.
  `SectionArticleScreenData` is resolved *by lookup* in
  `DependentListHandler.UpdateRestrictions` — a stale option is a
  `NullReferenceException` when the price list is set. PDB290 dropped one
  `SMA_EXT` section and two Floating options, which in an 8-dongle Care order is
  8 stale sections and 24 stale options (Q17). Fixing one level only moves the
  crash. Converting a catalog is not only re-pricing articles: anything copied
  from the old catalog's *structure* goes stale, and none of it is visible to
  `validateOrderXml`.

- **`listOf` descends two levels, `kidsOf` one.** A catalog's
  `DependentList/Sections` and `Section/Articles` are single members, so
  `listOf(list, 'Sections', '')` type-checks, runs, and returns `[]`. It would
  have emptied every option mirror on every conversion, silently. Where a helper
  returns "nothing found" for what is really a structural mistake, make the
  caller refuse the empty result — `reconcileMirror` will not write an empty
  mirror.

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
- **A release is its own commit, titled exactly `vX.Y.Z`, touching only
  `package.json` and `package-lock.json`.** Code goes in `feat:`/`fix:` commits
  before it. `git log --oneline` shows the pattern going back many releases;
  bundling the bump into the fix commit hides the release from anyone scanning
  commit names. `main` is the working branch, and CI deploys it to GitHub Pages
  on push.
- **When a new test fails, ask whether the expectation or the code is wrong.**
  Of the nine tests written for Q17, two failed first and both times the test was
  wrong — a dropped section's options should not also be counted as option
  removals, and a screen total *should* follow a repriced option when it was a
  plain sum. Write the assertion from the rule, not from what the old code
  happened to do.
- The fidelity ladder lives in the private repo:
  `cd internal-apps/gpc-viewer/fidelity && node harness/verify.mjs --all`.
  M0–M5 green, M6 open. Never mark a milestone green without the scoreboard
  line that proves it.
- Reproduce before theorising. Several reports have looked like one thing and
  been another — "order has no PriceList" was the paste path ignoring the
  block's own value, not a missing field.
- Say plainly what was **not** verified. Nothing here renders Safari or runs
  GPC; visual and configurator-side claims are reasoned, not seen.

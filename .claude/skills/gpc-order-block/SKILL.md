---
name: gpc-order-block
description: "Build a GPC Order Block — the pasteable text that fills a whole order in gpc-viewer: customer, addresses, contact, products, software licences and maintenance agreements. Use when the user wants to paste an order into gpc-viewer, asks for a paste block or order block, or describes an order in prose (a customer, a renewal, a list of SAP codes) and wants it turned into something the viewer can take. Also use to check or fix a block that did not resolve."
---

# GPC Order Block

Turn what the user tells you into one block of text they paste into gpc-viewer,
which builds the whole order from it.

The format is specified in `docs/order-block-format.md` in the `trilion-gpc-viewer`
repo. **Read it** before writing a block — it is the contract, and it is the
authority when this file and it disagree.

## How to work

Ask for what is missing, in one round, then produce the block. Do not
interrogate one field at a time, and do not ask for anything the user has
already given you or that has a sensible default.

Then **validate before handing it over**:

```bash
python3 .claude/skills/gpc-order-block/make_block.py order.json
```

It prints the envelope on success and the reason on failure. Never hand the
user a block you have not run through it.

## What is mandatory

Only three things, and one of them catches people out:

- `gpcOrder: 1`.
- Every `sma` item needs a **dongle ID**. There is no default and no way to
  guess it. If the user has not given one, **ask** — a maintenance agreement
  without it is the one thing the viewer refuses outright.
- Every `sma` item needs `endOldContract` and at least one entry in `articles`.

Everything else is optional. A block that carries only a customer and three SAP
codes is valid.

## The rules worth knowing

**Agreements run in whole months.** They start on the first of a month and end
on the last day of one. Ask for months, not dates: "ends end of September,
starts October, one year" is `endOldContract: "2026-09"`,
`startNewContract: "2026-10"`, `months: 12`. Omitting `months` means 12, the
minimum; longer terms are priced pro rata, so 24 months costs twice 12.

**A gap is deliberate and free.** If the new term starts later than the month
after the old one ended, the customer had no cover for those months and is not
charged for them. Say so back to the user when you produce a block with a gap,
because a gap by accident and a gap on purpose look identical in the file.

**One `sma` entry per dongle, not per agreement.** Several agreements on the
same dongle go in that entry's `articles` array — that is how GPC groups them.
Two entries with the same dongle id makes two separate rows, which is a
different thing and usually not what was meant.

**Articles: SAP number first, name second.** `sapNr` is the *ZEISS* SAP number
(`NNNNNN-NNNN-NNN`), not an internal SKU; in Odoo it is the vendor product code
on the ZEISS vendor line. Send both when you have both: a SAP number that
matches several articles in a catalog is settled by the name, and refused
without one.

**Licences and agreements are matched by name**, exactly as the catalog spells
them — `EXT SMA for Sensor Driver ARAMIS`, `EXT SMA for ZEISS CORRELATE - Pro
Line`. Get the spelling from the catalog, not from memory. If the user's
wording is close but not exact ("correlate professional line"), say which
article you matched it to.

**Address types** are exactly `Customer`, `GOM Partner`, `Order Process Center`
or `Other Address`. Nothing else.

## What to flag rather than silently fix

The block's job is to stop people retyping things, so a quiet correction
defeats it. Tell the user when:

- A name and an e-mail disagree — "Alessandro Viera" with
  `alessandro.vieira@boeing.com`. Use the spelling the e-mail implies and say
  you did.
- You matched a loosely-worded product to a specific catalog article.
- The term has a gap.
- You guessed at a country, a state or a price list.

## Never put a placeholder inside the block

The block is base64. Once encoded, a `REPLACE-ME` is invisible — the user sees
a wall of characters and pastes it, and the placeholder reaches the order.

So there is nothing to substitute later. If a dongle id, or anything else
mandatory, is missing: **stop and ask for it.** Producing a block that needs
editing is worse than producing none, because it looks finished.

When you do hand over a block, show the JSON alongside it, folded or in a code
block. It costs a few lines and it is the only way the person can see what they
are about to paste.

## Defaults

Use these unless the user says otherwise, and mention the ones that matter:

| Field | Default |
|---|---|
| `catalog` | the newest PDB the user has — ask if you cannot tell |
| `priceList` | `Partner` |
| `account.country` | infer from the city, and say so |
| `administration.*AddressType` | `Customer` when the order ships to the customer |
| `sma.months` | 12 |
| `sma.startNewContract` | the month after `endOldContract` |
| `source.system` | `manual` when you built it from prose |

## After the block

Tell the user, briefly:

- what the block contains, in words;
- anything you flagged above;
- that the viewer shows a preview before applying anything, so an article that
  fails to resolve is reported rather than dropped — the preview is where a
  wrong SAP number surfaces.

## Worked example

Prose in:

> SMA renewal for Northwind Testing Labs in Portland OR — sensor driver ARAMIS
> plus CORRELATE pro line, current agreement ends end of September, new one
> starts October for a year. Contact Jordan Lee, jordan.lee@example.invalid.
> Dongle 3-0000000.

`order.json`:

```json
{
  "gpcOrder": 1,
  "source": { "system": "manual", "ref": "SMA renewal" },
  "catalog": "PDB290_09-2026",
  "priceList": "Partner",
  "account": {
    "companyName": "Northwind Testing Labs",
    "city": "Portland",
    "stateProvince": "OR",
    "country": "United States of America"
  },
  "contact": {
    "firstName": "Jordan",
    "lastName": "Lee",
    "email": "jordan.lee@example.invalid"
  },
  "administration": {
    "invoiceAddressType": "Customer",
    "shippingAddressType": "Customer"
  },
  "items": [
    {
      "type": "sma",
      "dongleId": "3-0000000",
      "endOldContract": "2026-09",
      "startNewContract": "2026-10",
      "months": 12,
      "articles": [
        "EXT SMA for Sensor Driver ARAMIS",
        "EXT SMA for ZEISS CORRELATE - Pro Line"
      ],
      "licenseUserEmail": "jordan.lee@example.invalid",
      "licenseUserName": "Jordan Lee"
    }
  ]
}
```

Then `python3 .claude/skills/gpc-order-block/make_block.py order.json` and give
the user the envelope it prints.

## Checking a block that did not resolve

The viewer names the reason, and it is nearly always one of:

| It says | It means |
|---|---|
| "is not in this catalog" | the name is misspelled, or the article is in a different PDB |
| "matches N articles ... no name" | send `name` alongside `sapNr` |
| "not offered by any software-licence list" | it is an article, not a licence — use `type: "article"` |
| "needs a dongleId" | exactly that |
| "format version N" | the block was built for a newer viewer |

Decode a block to look inside it:

```bash
python3 .claude/skills/gpc-order-block/make_block.py --decode block.txt
```

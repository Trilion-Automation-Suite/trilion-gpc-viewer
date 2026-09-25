#!/usr/bin/env python3
"""Turn a GPC order JSON into the block a person pastes into gpc-viewer.

    python3 make_block.py order.json          # validate, print the envelope
    python3 make_block.py -                   # read the JSON from stdin
    python3 make_block.py --decode block.txt  # the other way, to look inside one

The validation is the point. The viewer will refuse a bad block too, but it
does so in front of the person who is waiting for it, and by then the mistake
has already been copied into a mail. The checks here are the ones the format
makes and a generator keeps getting wrong: a maintenance agreement with no
dongle, a term under the minimum, an address type the configurator has never
heard of.

Format: ../../docs/order-block-format.md — that file is the authority.
"""
from __future__ import annotations

import base64
import json
import re
import sys

VERSION = 1
BEGIN = "-----BEGIN GPC ORDER-----"
END = "-----END GPC ORDER-----"

# AddressType is a C# enum and travels as its member NAME. The labels GPC's UI
# shows -- "GOM Partner", "Order Process Center", "Other Address" -- make .NET
# refuse the entire document with an instance-validation error, which GPC
# reports as "This file has no Order-Part".
ADDRESS_TYPES = ("Customer", "GOMPartner", "HomCenter", "Other")
ADDRESS_LABELS = {"GOM Partner": "GOMPartner", "Order Process Center": "HomCenter",
                  "Other Address": "Other", "GPC Partner": "GOMPartner"}

MINIMUM_CONTRACT_MONTHS = 12

MONTH = re.compile(r"^\d{4}-\d{2}(-\d{2})?$")
SAP = re.compile(r"^\d{6}-\d{4}-\d{3}$")


def fail(message: str) -> None:
    sys.exit(f"error: {message}")


def check_date(where: str, value, required: bool = True) -> None:
    if value in (None, ""):
        if required:
            fail(f"{where} is required (YYYY-MM or YYYY-MM-DD).")
        return
    if not isinstance(value, str) or not MONTH.match(value):
        fail(f"{where} is {value!r}; it must be YYYY-MM or YYYY-MM-DD.")


def validate(block: dict) -> list[str]:
    """Refuses what is wrong, returns notes on what is merely worth saying."""
    notes: list[str] = []

    if block.get("gpcOrder") != VERSION:
        fail(f'"gpcOrder" must be {VERSION}, not {block.get("gpcOrder")!r}.')

    admin = block.get("administration") or {}
    for field in ("invoiceAddressType", "shippingAddressType"):
        value = admin.get(field)
        if value in (None, "") or value in ADDRESS_TYPES:
            continue
        if value in ADDRESS_LABELS:
            fail(f"{field} is {value!r}, which is the label GPC shows, not what it stores. "
                 f"Use {ADDRESS_LABELS[value]!r}.")
        fail(f"{field} is {value!r}. AddressType accepts only: " + ", ".join(ADDRESS_TYPES) + ".")

    items = block.get("items") or []
    if not isinstance(items, list):
        fail('"items" must be a list.')
    if not items:
        notes.append("No items — this block carries customer details only.")

    for i, item in enumerate(items, 1):
        where = f"item {i}"
        if not isinstance(item, dict):
            fail(f"{where} is not an object.")
        kind = item.get("type")

        if kind == "article":
            if not item.get("sapNr") and not item.get("name"):
                fail(f'{where}: an article needs "sapNr" or "name".')
            sap = item.get("sapNr")
            if sap and not SAP.match(str(sap)):
                notes.append(
                    f"{where}: {sap!r} is not a ZEISS SAP number (NNNNNN-NNNN-NNN). "
                    "The viewer will fall back to the name."
                )
            amount = item.get("amount", 1)
            if not isinstance(amount, int) or amount < 1:
                fail(f"{where}: amount must be a whole number of 1 or more, not {amount!r}.")

        elif kind == "license":
            if not item.get("name"):
                fail(f'{where}: a licence needs "name", spelled as the catalog spells it.')

        elif kind == "sma":
            if not item.get("dongleId"):
                fail(
                    f'{where}: a maintenance agreement needs "dongleId". '
                    "There is no default — ask for the dongle or sensor serial."
                )
            check_date(f'{where}: "endOldContract"', item.get("endOldContract"))
            check_date(f'{where}: "startNewContract"', item.get("startNewContract"), required=False)
            articles = item.get("articles")
            if not isinstance(articles, list) or not articles:
                fail(f'{where}: "articles" must list at least one agreement.')
            months = item.get("months")
            if months is not None:
                if not isinstance(months, int) or months < MINIMUM_CONTRACT_MONTHS:
                    fail(
                        f"{where}: a term is at least {MINIMUM_CONTRACT_MONTHS} whole months, "
                        f"not {months!r}."
                    )
            start, end_old = item.get("startNewContract"), item.get("endOldContract")
            if start and end_old:
                gap = months_between(end_old, start) - 1
                if gap > 0:
                    notes.append(
                        f"{where}: {gap} month{'s' if gap != 1 else ''} of lapsed cover between "
                        f"{end_old} and {start}. Not charged — say so if it was not intended."
                    )
                elif gap < 0:
                    fail(f"{where}: the new term starts {start}, before the old one ends {end_old}.")

        else:
            fail(f"{where}: unknown type {kind!r} (article, license or sma).")

    # One entry per dongle: two entries with the same id make two separate rows
    # in GPC, which is a different thing and rarely what was meant.
    seen: dict[str, int] = {}
    for i, item in enumerate(items, 1):
        if isinstance(item, dict) and item.get("type") == "sma":
            dongle = item.get("dongleId")
            if dongle in seen:
                notes.append(
                    f"item {i}: dongle {dongle} is also on item {seen[dongle]}. That makes two "
                    "rows in GPC; put several agreements in one entry's \"articles\" instead."
                )
            else:
                seen[dongle] = i
    return notes


def months_between(earlier: str, later: str) -> int:
    ey, em = int(earlier[:4]), int(earlier[5:7])
    ly, lm = int(later[:4]), int(later[5:7])
    return (ly - ey) * 12 + (lm - em)


def encode(block: dict) -> str:
    payload = json.dumps(block, ensure_ascii=False, separators=(",", ":"))
    body = base64.b64encode(payload.encode("utf-8")).decode("ascii")
    wrapped = "\n".join(body[i:i + 76] for i in range(0, len(body), 76))
    return f"{BEGIN}\n{wrapped}\n{END}"


def decode(text: str) -> dict:
    start = text.find(BEGIN)
    if start < 0:
        return json.loads(text)
    stop = text.find(END, start)
    if stop < 0:
        fail(f"the block has no {END} line — it was cut short.")
    body = "".join(text[start + len(BEGIN):stop].split())
    return json.loads(base64.b64decode(body).decode("utf-8"))


def main() -> None:
    args = [a for a in sys.argv[1:]]
    if not args:
        sys.exit(__doc__)

    if args[0] == "--decode":
        if len(args) < 2:
            fail("--decode needs a file, or - for stdin.")
        raw = sys.stdin.read() if args[1] == "-" else open(args[1], encoding="utf-8").read()
        print(json.dumps(decode(raw), indent=2, ensure_ascii=False))
        return

    raw = sys.stdin.read() if args[0] == "-" else open(args[0], encoding="utf-8").read()
    try:
        block = json.loads(raw)
    except json.JSONDecodeError as err:
        fail(f"that is not valid JSON: {err}")
    if not isinstance(block, dict):
        fail("the top level must be an object.")

    notes = validate(block)
    print(encode(block))
    if notes:
        print("\n".join(f"note: {n}" for n in notes), file=sys.stderr)


if __name__ == "__main__":
    main()

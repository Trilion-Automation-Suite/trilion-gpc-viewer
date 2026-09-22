/**
 * order.xml — the part GPC actually deserializes into its OrderData object graph.
 *
 * Written by .NET's XmlSerializer through an XmlWriter with Indent = true, so
 * reproducing it means reproducing that writer's formatting exactly, not merely
 * producing equivalent XML.
 *
 * Every formatting rule below was read off the corpus rather than inferred from
 * what .NET "probably" does:
 *
 *  - CRLF line endings, two spaces of indent per level, no trailing newline —
 *    all 9 artifacts end at the final `>` of `</OrderData>`.
 *  - Empty elements are `<Name />`, with exactly one space before the slash.
 *  - Only three characters are escaped in text: `&`, `<` and `>`. Across the whole
 *    corpus the only entity references that appear are `&amp;` (334), `&lt;` (224)
 *    and `&gt;` (240) — no `&quot;`, no numeric escapes, so a literal LF inside
 *    text stays a literal LF. Reference files rely on that: they contain bare
 *    LFs inside text content alongside CRLF line endings.
 *  - No mixed content anywhere: an element has children, or text, or neither.
 *  - `xsi:nil="true"` marks a null value type; a null reference type is omitted
 *    entirely. The distinction matters — GPC fails to deserialize an empty
 *    `<Name />` where it expects a nullable decimal.
 *
 * The model keeps members in document order. That is deliberate: a parse/
 * serialize round-trip cannot by itself prove that member *order* is right,
 * because it replays whatever order it read. The canonical order lives in
 * orderSchema.ts and is what M3/M4 exercise, where elements are generated rather
 * than echoed.
 */
import { CANONICAL_ORDER } from './orderSchema.ts'

const DECLARATION = '<?xml version="1.0" encoding="utf-8"?>'
const ROOT = 'OrderData'
const ROOT_ATTRS =
  ' xmlns:xsd="http://www.w3.org/2001/XMLSchema"' +
  ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
const EOL = '\r\n'
const INDENT = '  '

/** A null value type: `<Name xsi:nil="true" />`. Distinct from an empty element. */
export interface NilValue {
  kind: 'nil'
}

/**
 * An element holding character data: `<Name>text</Name>`.
 *
 * `type` carries an `xsi:type` when the member is declared as `object` rather
 * than a concrete type — older schema versions serialize `List<object>` entries
 * as `<string xsi:type="xsd:string">value</string>`. Newer ones use
 * `List<string>` and omit it.
 */
export interface TextValue {
  kind: 'text'
  type: string | null
  value: string
}

/** An element holding child elements, or none at all (`<Name />`). */
export interface ElementValue {
  kind: 'element'
  /** The `xsi:type` discriminator on polymorphic entries, e.g. `DependentListScreenData`. */
  type: string | null
  members: OrderMember[]
}

export type OrderValue = NilValue | TextValue | ElementValue

export interface OrderMember {
  name: string
  value: OrderValue
}

/** The deserialized `order.xml`: the `OrderData` root and its members. */
export interface OrderDocument {
  root: ElementValue
}

// ── parsing ───────────────────────────────────────────────────────────────────

/**
 * Parses order.xml. Strict by design — an unexpected shape is a signal that the
 * model is wrong, and silently tolerating it would surface later as a byte diff
 * with no explanation.
 */
export function parseOrderXml(bytes: Uint8Array): OrderDocument {
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const p = new Parser(xml)
  p.expectDeclaration()
  const root = p.parseElement()
  if (root.name !== ROOT) throw new Error(`orderXml: root is <${root.name}>, expected <${ROOT}>`)
  if (root.value.kind !== 'element') throw new Error(`orderXml: root <${ROOT}> is ${root.value.kind}`)
  p.expectEnd()
  return { root: root.value }
}

interface ParsedElement {
  name: string
  value: ElementValue | TextValue | NilValue
}

class Parser {
  private at = 0
  private readonly xml: string

  constructor(xml: string) {
    this.xml = xml
  }

  expectDeclaration(): void {
    if (!this.xml.startsWith(DECLARATION)) {
      throw new Error(`orderXml: unexpected declaration ${JSON.stringify(this.xml.slice(0, 60))}`)
    }
    this.at = DECLARATION.length
    this.skipWhitespace()
  }

  expectEnd(): void {
    this.skipWhitespace()
    if (this.at !== this.xml.length) {
      throw new Error(`orderXml: trailing content at ${this.at}: ${JSON.stringify(this.xml.slice(this.at, this.at + 40))}`)
    }
  }

  parseElement(): ParsedElement {
    if (this.xml[this.at] !== '<') {
      throw new Error(`orderXml: expected '<' at ${this.at}`)
    }
    const tagEnd = this.xml.indexOf('>', this.at)
    if (tagEnd < 0) throw new Error(`orderXml: unterminated tag at ${this.at}`)

    const selfClosing = this.xml[tagEnd - 1] === '/'
    const inner = this.xml.slice(this.at + 1, selfClosing ? tagEnd - 1 : tagEnd)
    const { name, attrs } = splitTag(inner)
    this.at = tagEnd + 1

    const nil = attrs.get('xsi:nil') === 'true'
    const type = attrs.get('xsi:type') ?? null

    if (selfClosing) {
      return { name, value: nil ? { kind: 'nil' } : { kind: 'element', type, members: [] } }
    }

    if (nil) {
      // `<X xsi:nil="true">Customer</X>` contradicts itself, and files in the
      // wild contain it — this app wrote it until v1.0.1, setting a value
      // without clearing the attribute. GPC believes the attribute and drops
      // the text, so the value was already gone as far as the configurator was
      // concerned. Reading it the same way keeps our interpretation and GPC's
      // identical, and writing it back emits a clean self-closing element, so
      // opening and saving repairs the file.
      this.skipTo(`</${name}>`)
      this.expectClose(name)
      return { name, value: { kind: 'nil' } }
    }

    // Look at what follows: child element, or character data.
    const next = this.xml.indexOf('<', this.at)
    if (next < 0) throw new Error(`orderXml: unterminated <${name}>`)
    const between = this.xml.slice(this.at, next)

    if (this.xml.startsWith('</', next)) {
      // Nothing but character data before the close tag, so `between` *is* the
      // value — verbatim, whitespace included. Reference files contain an
      // element whose real value is a single space; treating whitespace-only
      // content as "empty" would rewrite it to `<Name />` and lose a byte.
      this.at = next
      this.expectClose(name)
      return { name, value: { kind: 'text', type, value: unescapeXml(between) } }
    }

    if (between.trim() !== '') {
      throw new Error(`orderXml: <${name}> has mixed content`)
    }

    // Child elements.
    const members: OrderMember[] = []
    for (;;) {
      this.skipWhitespace()
      if (this.xml.startsWith('</', this.at)) break
      const child = this.parseElement()
      members.push({ name: child.name, value: child.value })
    }
    this.expectClose(name)
    return { name, value: { kind: 'element', type, members } }
  }

  /** Advances to the next occurrence of `marker`, leaving `at` on it. */
  private skipTo(marker: string): void {
    const found = this.xml.indexOf(marker, this.at)
    if (found < 0) throw new Error(`orderXml: unterminated element, expected ${marker}`)
    this.at = found
  }

  private expectClose(name: string): void {
    const close = `</${name}>`
    if (!this.xml.startsWith(close, this.at)) {
      throw new Error(
        `orderXml: expected ${close} at ${this.at}, found ${JSON.stringify(this.xml.slice(this.at, this.at + 40))}`
      )
    }
    this.at += close.length
  }

  private skipWhitespace(): void {
    while (this.at < this.xml.length) {
      const c = this.xml.charCodeAt(this.at)
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) this.at++
      else break
    }
  }
}

function splitTag(inner: string): { name: string; attrs: Map<string, string> } {
  const trimmed = inner.trimEnd()
  const space = trimmed.search(/\s/)
  if (space < 0) return { name: trimmed, attrs: new Map() }
  const name = trimmed.slice(0, space)
  const attrs = new Map<string, string>()
  for (const m of trimmed.slice(space).matchAll(/([\w:.-]+)="([^"]*)"/g)) {
    attrs.set(m[1], unescapeXml(m[2]))
  }
  return { name, attrs }
}

// ── serializing ───────────────────────────────────────────────────────────────

/** Serializes back to the exact bytes .NET's XmlSerializer would have written. */
export function serializeOrderXml(doc: OrderDocument): Uint8Array {
  const out: string[] = [DECLARATION, EOL]
  writeElement(out, ROOT, doc.root, 0, ROOT_ATTRS)
  return new TextEncoder().encode(out.join(''))
}

function writeElement(
  out: string[],
  name: string,
  value: OrderValue,
  depth: number,
  extraAttrs = ''
): void {
  const pad = INDENT.repeat(depth)

  if (value.kind === 'nil') {
    out.push(`${pad}<${name} xsi:nil="true" />`)
    return
  }
  if (value.kind === 'text') {
    const typeAttr = value.type !== null ? ` xsi:type="${escapeXml(value.type)}"` : ''
    out.push(`${pad}<${name}${typeAttr}${extraAttrs}>${escapeXml(value.value)}</${name}>`)
    return
  }

  const attrs = (value.type !== null ? ` xsi:type="${escapeXml(value.type)}"` : '') + extraAttrs
  if (value.members.length === 0) {
    out.push(`${pad}<${name}${attrs} />`)
    return
  }
  out.push(`${pad}<${name}${attrs}>`)
  for (const m of value.members) {
    out.push(EOL)
    writeElement(out, m.name, m.value, depth + 1)
  }
  out.push(EOL, `${pad}</${name}>`)
}

/**
 * `&`, `<` and `>` only — the sole escapes .NET's XmlWriter produced anywhere in
 * the corpus. `&` must go first or the other replacements would be double-escaped.
 */
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function unescapeXml(s: string): string {
  if (s.indexOf('&') < 0) return s
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (whole, body: string) => {
    switch (body) {
      case 'amp': return '&'
      case 'lt': return '<'
      case 'gt': return '>'
      case 'quot': return '"'
      case 'apos': return "'"
      default:
        return body.startsWith('#x')
          ? String.fromCodePoint(parseInt(body.slice(2), 16))
          : body.startsWith('#')
            ? String.fromCodePoint(parseInt(body.slice(1), 10))
            : whole
    }
  })
}

// ── typed access ──────────────────────────────────────────────────────────────

/** Reads a direct member by name, or null when absent (a null reference type). */
export function member(el: ElementValue, name: string): OrderValue | null {
  return el.members.find((m) => m.name === name)?.value ?? null
}

/** Reads a member's text, or null when the member is absent, nil or complex. */
export function text(el: ElementValue, name: string): string | null {
  const v = member(el, name)
  return v !== null && v.kind === 'text' ? v.value : null
}

/**
 * Inserts or replaces a member, keeping the canonical order for the element's
 * type. Members .NET would have omitted stay omitted; this only positions the
 * ones that are present.
 */
export function setMember(el: ElementValue, typeName: string, name: string, value: OrderValue): void {
  const order = CANONICAL_ORDER[typeName]
  if (!order) throw new Error(`orderXml: no canonical member order known for ${typeName}`)
  const position = order.indexOf(name)
  if (position < 0) throw new Error(`orderXml: ${typeName} has no member ${name}`)

  const existing = el.members.findIndex((m) => m.name === name)
  if (existing >= 0) {
    el.members[existing] = { name, value }
    return
  }
  let insertAt = el.members.length
  for (let i = 0; i < el.members.length; i++) {
    const other = order.indexOf(el.members[i].name)
    if (other > position) { insertAt = i; break }
  }
  el.members.splice(insertAt, 0, { name, value })
}

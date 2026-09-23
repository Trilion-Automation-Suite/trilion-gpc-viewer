/**
 * Starting a new order from the one GPC itself starts from.
 *
 * Every product database since PDB276 carries its own `order.xml`: the blank
 * order the configurator opens when you click New. It is the real thing, in
 * that catalog's own hand — the right members, the right order, the right
 * currency row, `xsi:nil` where GPC writes `xsi:nil`.
 *
 * The app used to write a hand-authored template instead. It was close enough
 * to read back and wrong in ways no reference file could show, because a saved
 * GPC order omits every member it left null. Three releases went out against
 * it. Starting from the catalog's copy removes the guesswork: the only edits
 * are the ones a new order genuinely needs.
 */
import type { GpcContainer } from './gpc/container.ts'
import { MEMBER_ORDER } from './gpc/memberOrder.ts'
import { parseOrder } from './parseOrder.js'
import { patchOrderXml } from './patchOrder.js'
import type { OrderSummary } from '../types/order.js'

/** The blank order a catalog carries, or null for one old enough to lack it. */
export function catalogBlankOrder(pdb: GpcContainer): string | null {
  const entry = pdb.entries.find((e) => e.name === 'order.xml')
  return entry ? new TextDecoder('utf-8').decode(entry.data) : null
}

/**
 * `2026-09-18T11:28:10.7381171-07:00` — .NET's round-trip DateTime for a local
 * time, which is what GPC writes. `toISOString` gives UTC with three decimal
 * places, a shape no reference file uses.
 */
export function dotNetLocalTimestamp(when: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  const offset = -when.getTimezoneOffset()
  const sign = offset < 0 ? '-' : '+'
  const ticks = `${pad(when.getMilliseconds(), 3)}0000`
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `T${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}.${ticks}` +
    `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  )
}

/**
 * Sets a direct child of `OrderData`, in the position its class declares.
 *
 * Text rather than DOM on purpose: the blank order is already exactly what GPC
 * wrote, and a parse-and-reserialise would reformat parts of it that nothing
 * here needs to touch.
 */
function setRootElement(xml: string, tag: string, value: string): string {
  const eol = xml.includes('\r\n') ? '\r\n' : '\n'
  const existing = new RegExp(`^(  )<${tag}(?: [^>]*)?(?:/>|>.*?</${tag}>)`, 'm')
  if (existing.test(xml)) return xml.replace(existing, `$1<${tag}>${value}</${tag}>`)

  const position = MEMBER_ORDER.OrderData.indexOf(tag)
  if (position < 0) return xml
  const line = `  <${tag}>${value}</${tag}>${eol}`
  for (const match of xml.matchAll(/^ {2}<([A-Za-z_][\w.-]*)/gm)) {
    if (MEMBER_ORDER.OrderData.indexOf(match[1]) > position) {
      const at = match.index
      return xml.slice(0, at) + line + xml.slice(at)
    }
  }
  return xml.replace(/^<\/OrderData>/m, `${line}</OrderData>`)
}

/** What a new order needs that the catalog's blank copy cannot know. */
export interface NewOrderDefaults {
  /** `SourceFileName` — which catalog this order was started from. */
  catalog: string
  /**
   * Root elements to set outright. `patchOrderXml` deliberately leaves some
   * fields alone — `Distributor` and `PriceList` among them — because a save
   * must never rewrite them; a new order is where they get set.
   */
  root?: Record<string, string>
  /** Applied through the normal save path, so placement is the proven one. */
  apply?: (order: OrderSummary) => void
  now?: Date
}

/**
 * The catalog's blank order, made current: new timestamps, the catalog it came
 * from recorded, and any house defaults applied.
 */
export function startOrderFromCatalogBlank(blankXml: string, defaults: NewOrderDefaults): string {
  const now = defaults.now ?? new Date()
  const stamp = dotNetLocalTimestamp(now)

  let xml = setRootElement(blankXml, 'CreationDate', stamp)
  xml = setRootElement(xml, 'LastModified', stamp)
  if (defaults.catalog) xml = setRootElement(xml, 'SourceFileName', defaults.catalog)
  for (const [tag, value] of Object.entries(defaults.root ?? {})) {
    if (value !== '') xml = setRootElement(xml, tag, value)
  }

  if (defaults.apply) {
    const order = parseOrder(xml)
    defaults.apply(order)
    // patchOrderXml is what Save uses, and it reproduces a GPC-written order
    // byte for byte, so the defaults land exactly where a save would put them.
    xml = patchOrderXml(xml, order, [])
  }
  return xml
}

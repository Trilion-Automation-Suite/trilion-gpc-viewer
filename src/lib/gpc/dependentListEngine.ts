/**
 * The configurator's rules engine for dependent lists — what happens when an
 * operator ticks, unticks or changes the quantity of an option in a system.
 *
 * A dependent list (see dependentList.ts) stores every option of every section
 * with an `Amount` and an `AmountMode` saying *why* it has that amount. The
 * catalog's `DependentListsData` holds the rules that produce those values:
 *
 *  - a section's **selection mode** — `ExactlyOne` (radio), `ZeroOrOne`,
 *    `AtLeastOne`, `OneOrMore` (checkboxes), `MinXMaxY` (a bounded count);
 *  - per option, **preconditions** (when it is offered at all) and
 *    **implications** (what picking it sets elsewhere, as `#amount = +amount`);
 *  - per section, a **special function** (always hide, show only when an
 *    implication asks, read-only, auto-select the maximum ...).
 *
 * A pick therefore cascades. On an SRX, removing the only measuring volume for
 * a frame takes the frame, its case and possibly the basic unit with it, and an
 * option whose precondition named that volume disappears from its section.
 * Setting one `Amount` in the XML produces a file the configurator would never
 * have written; this module re-derives everything, the way it does.
 *
 * It is a literal port of `ProductConfigurator.Data.DependentListLogic`
 * (DependentListHandler, UserChoiceHandler, DependencyStack,
 * ImplicationHandler, PreconditionHandler, SectionSelectionMode,
 * SectionSpecialFunctions, TechCategorySynchronizer), same order of operations
 * and same quirks, because the proof that it is right is a replay: opening a
 * file the configurator saved must reproduce every stored Amount and
 * AmountMode. `replaySystem` is that check.
 *
 * What it will not do: build a sub-configuration that is not already on the
 * order (Training, a re-added SMA). The pick is refused with `NeedsGpcError`.
 */
import type { ElementValue, OrderDocument, OrderValue } from './orderXml.ts'
import { member, text } from './orderXml.ts'
import type { Dec } from './decimal.ts'
import { add, compare, divide, formatDecimal, fromInt, isZero, multiply, parseDecimal, parseDecimalOrNull, subtract } from './decimal.ts'

const INT_MAX = 2147483647
const NO_ARTICLE = '<no-article>'
const PARAMETER = '<parameter>'
const XSI_TYPE_DL = 'DependentListScreenData'

export type AmountMode =
  | 'Implication'
  | 'SectionSpecialFunction'
  | 'UserChoice'
  | 'SoftImplication'
  | 'Default'
  | 'Reset'
  | 'None'

export type SelectionMode = 'ExactlyOne' | 'AtLeastOne' | 'ZeroOrOne' | 'OneOrMore' | 'MinXMaxY'

type SectionType = 'Selection' | 'SelectionWithAdditionalChoice' | 'Amount' | 'AmountWithAdditionalChoice' | 'SubConfiguration'

/** Refused: the pick needs something only the configurator can build. */
export class NeedsGpcError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NeedsGpcError'
  }
}

/** Refused: the configurator would not let the operator make this pick. */
export class PickError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PickError'
  }
}

// ── element access ────────────────────────────────────────────────────────────

function sub(e: ElementValue | null, name: string): ElementValue | null {
  if (!e) return null
  const v = member(e, name)
  return v && v.kind === 'element' ? v : null
}

function kids(e: ElementValue | null): ElementValue[] {
  if (!e) return []
  return e.members.map((m) => m.value).filter((x): x is ElementValue => x.kind === 'element')
}

/** Text of a member; empty elements and absent members read as null. */
function str(e: ElementValue | null, name: string): string | null {
  if (!e) return null
  const t = text(e, name)
  return t === null || t.trim() === '' ? null : t
}

function int(e: ElementValue | null, name: string, fallback: number): number
function int(e: ElementValue | null, name: string, fallback: null): number | null
function int(e: ElementValue | null, name: string, fallback: number | null): number | null {
  const t = str(e, name)
  return t === null ? fallback : parseInt(t, 10)
}

function bool(e: ElementValue | null, name: string): boolean {
  return (str(e, name) ?? '').toLowerCase() === 'true'
}

function strings(e: ElementValue | null, name: string): string[] {
  const list = sub(e, name)
  if (!list) return []
  return list.members.map((m) => (m.value.kind === 'text' ? m.value.value : ''))
}

function setText(e: ElementValue, name: string, value: string): void {
  const i = e.members.findIndex((m) => m.name === name)
  const v: OrderValue = { kind: 'text', type: null, value }
  if (i < 0) throw new Error(`dependentListEngine: <${name}> missing where the configurator always writes it`)
  e.members[i] = { name, value: v }
}

// ── catalog side ──────────────────────────────────────────────────────────────

export class Selection {
  readonly mode: SelectionMode
  readonly x: number | null
  readonly y: number | null

  constructor(mode: SelectionMode, x: number | null = null, y: number | null = null) {
    this.mode = mode
    this.x = x
    this.y = y
  }

  static parse(e: ElementValue | null): Selection | null {
    if (!e || e.members.length === 0) return null
    return new Selection((str(e, 'SelectionMode') ?? 'ExactlyOne') as SelectionMode, int(e, 'X', null), int(e, 'Y', null))
  }

  get minAmount(): number {
    if (this.mode === 'ExactlyOne' || this.mode === 'AtLeastOne') return 1
    if (this.mode !== 'MinXMaxY' || this.x === null) return 0
    return this.x
  }

  get maxAmount(): number {
    if (this.mode === 'ExactlyOne' || this.mode === 'ZeroOrOne') return 1
    if (this.mode !== 'MinXMaxY' || this.y === null) return INT_MAX
    return this.y
  }

  key(): string {
    return `${this.mode}:${this.x}:${this.y}`
  }
}

class Precondition {
  readonly dlRef: string
  readonly secRef: string
  readonly names: string[]
  readonly mins: number[]
  readonly maxs: number[]
  readonly id: number
  readonly logical: string
  readonly sectionLogical: string

  constructor(e: ElementValue) {
    this.dlRef = str(e, 'DependentListReference') ?? ''
    this.secRef = str(e, 'SectionReference') ?? ''
    this.names = strings(e, 'ArticleLongNames')
    this.mins = strings(e, 'ArticleMinValues').map((x) => parseInt(x, 10))
    this.maxs = strings(e, 'ArticleMaxValues').map((x) => parseInt(x, 10))
    // DependentListLegacyExt.SetMinMaxAmountsForPreconditions
    while (this.mins.length < this.names.length) this.mins.push(0)
    while (this.maxs.length < this.names.length) this.maxs.push(INT_MAX)
    this.id = int(e, 'Id', 0)
    this.logical = str(e, 'LogicalConnector') ?? 'Or'
    this.sectionLogical = str(e, 'SectionLogicalConnector') ?? 'And'
  }
}

interface Operand {
  op: string
  value: string | number | null
}

class Implication extends Precondition {
  readonly params: Operand[][]
  readonly special: string
  readonly selection: Selection | null
  readonly showSection: boolean

  constructor(e: ElementValue) {
    super(e)
    this.params = kids(sub(e, 'ArticleParams')).map((arr) =>
      kids(arr).map((po) => ({ op: String.fromCharCode(int(po, 'Operator', 0)), value: str(po, 'string') }))
    )
    this.special = str(e, 'ImplicationSpecialFunction') ?? 'None'
    this.selection = Selection.parse(sub(e, 'Selection'))
    this.showSection = bool(e, 'ShowSection')
  }

  get isSoft(): boolean {
    return ['NoneSoft', 'ConsolidatedUniqueSoft', 'ConsolidatedLargestOnlySoft'].includes(this.special)
  }

  get unique(): boolean {
    return this.special === 'ConsolidatedUnique' || this.special === 'ConsolidatedUniqueSoft'
  }

  get largestOnly(): boolean {
    return this.special === 'ConsolidatedLargestOnly' || this.special === 'ConsolidatedLargestOnlySoft'
  }
}

/** What the engine and the price roll-up need from a catalog `Article`. */
export interface ArticleInfo {
  longName: string
  blacklist: string[]
  regional: string[]
  ranking: number | null
  unit: string
  itemWideQuantityDiscount: boolean
  hasMaxQuantityDiscount: boolean
  quantityDiscounts: Array<{ trigger: number; discount: number }>
}

function articleInfo(e: ElementValue): ArticleInfo {
  return {
    longName: str(e, 'LongName') ?? '',
    blacklist: strings(e, 'UserBlacklist'),
    regional: strings(e, 'RegionalRestrictionNotInTheseCountriesRegions'),
    ranking: int(e, 'Ranking', null),
    unit: str(e, 'Unit') ?? '',
    itemWideQuantityDiscount: bool(e, 'IsItemWideQuantityDiscount'),
    hasMaxQuantityDiscount: bool(e, 'HasMaxQuantityDiscount'),
    quantityDiscounts: kids(sub(e, 'QuantityDiscounts')).map((q) => ({
      trigger: int(q, 'TriggerAmount', 0),
      discount: parseFloat(str(q, 'Discount') ?? '0'),
    })),
  }
}

/** ArticleExt.GetQuantityDiscount: the price factor, 1 when there is none. */
export function quantityDiscount(article: ArticleInfo, amount: number): number {
  const qd = article.quantityDiscounts
  if (qd.length === 0) return 1
  const low = Math.min(amount, Math.max(...qd.map((q) => q.trigger)))
  const hit = [...qd].sort((a, b) => a.trigger - b.trigger).find((q) => q.trigger >= low)
  return hit ? 1 - hit.discount / 100 : 1
}

class SectionArticle {
  readonly longName: string
  readonly preconditions: Precondition[]
  readonly implications: Implication[]
  minQuantity: number | null
  maxQuantity: number | null
  readonly step: number
  readonly defaultAmount: number
  readonly techCategory: number
  article: ArticleInfo | null = null

  constructor(e: ElementValue) {
    this.longName = str(e, 'LongName') ?? ''
    this.preconditions = kids(sub(e, 'Preconditions')).map((p) => new Precondition(p))
    this.implications = kids(sub(e, 'Implications')).map((i) => new Implication(i))
    this.minQuantity = int(e, 'MinQuantity', null)
    this.maxQuantity = int(e, 'MaxQuantity', null)
    this.step = int(e, 'Step', 1)
    this.defaultAmount = int(e, 'DefaultAmount', 0)
    this.techCategory = int(e, 'TechCategory', 0)
  }

  get minAmount(): number {
    return this.minQuantity ?? 0
  }

  get maxAmount(): number {
    return this.maxQuantity ?? 1
  }
}

export class Section {
  readonly longName: string
  readonly special: string
  readonly mandatoryComment: boolean
  readonly description: string
  readonly additionalChoiceTitle: string | null
  readonly selection: Selection
  readonly articles: SectionArticle[]
  readonly isSubconfig: boolean

  constructor(e: ElementValue) {
    this.longName = str(e, 'LongName') ?? ''
    this.special = str(e, 'SectionSpecialFunction') ?? 'None'
    this.mandatoryComment = bool(e, 'MandatoryComment')
    this.description = (str(e, 'Description') ?? '').trim()
    this.additionalChoiceTitle = str(e, 'AdditionalChoiceTitle')
    this.selection = Selection.parse(sub(e, 'Selection')) ?? new Selection('ExactlyOne')
    this.articles = kids(sub(e, 'Articles')).map((a) => new SectionArticle(a))
    this.isSubconfig = bool(e, 'IsSubconfiguration')
  }

  get type(): SectionType {
    if (this.isSubconfig) return 'SubConfiguration'
    if (this.articles.some((a) => a.maxAmount > 1)) {
      return this.additionalChoiceTitle ? 'AmountWithAdditionalChoice' : 'Amount'
    }
    return this.additionalChoiceTitle ? 'SelectionWithAdditionalChoice' : 'Selection'
  }
}

interface ConfigItemInfo {
  name: string
  filter: string
  blacklist: string[]
  regional: string[]
}

/** The parts of a catalog the engine reads, indexed once. */
export class EngineCatalog {
  private readonly listEls = new Map<string, ElementValue>()
  private readonly lists = new Map<string, Section[]>()
  private readonly articleEls = new Map<string, ElementValue>()
  private readonly articles = new Map<string, ArticleInfo | null>()
  readonly configItems = new Map<string, ConfigItemInfo>()
  readonly regions = new Map<string, string[]>()
  readonly users = new Map<string, ElementValue>()

  constructor(config: ElementValue) {
    for (const d of kids(sub(sub(config, 'DependentListsData'), 'DependentLists'))) {
      const name = str(d, 'DependentListName')
      if (name !== null && !this.listEls.has(name)) this.listEls.set(name, d)
    }
    for (const a of kids(sub(sub(config, 'ArticlesData'), 'Articles'))) {
      const name = text(a, 'LongName') ?? ''
      if (!this.articleEls.has(name)) this.articleEls.set(name, a) // FirstOrDefault
    }
    for (const c of kids(sub(sub(config, 'ConfigurationItemsData'), 'ConfigurationItems'))) {
      const name = str(c, 'Name') ?? ''
      if (this.configItems.has(name)) continue
      this.configItems.set(name, {
        name,
        filter: str(c, 'WorksheetArticleFilter') ?? '',
        blacklist: strings(c, 'UserBlacklist'),
        regional: strings(c, 'RegionalRestrictionNotInTheseCountriesRegions'),
      })
    }
    for (const r of kids(sub(sub(config, 'DestinationsData'), 'RegionsAndIsoLists'))) {
      this.regions.set(str(r, 'Region') ?? '', strings(r, 'IsoList'))
    }
    const usersData = sub(config, 'UsersData')
    const userList = usersData ? kids(usersData)[0] ?? null : null
    for (const u of kids(userList)) this.users.set(str(u, 'Username') ?? '', u)
  }

  article(name: string): ArticleInfo | null {
    if (!this.articles.has(name)) {
      const e = this.articleEls.get(name)
      this.articles.set(name, e ? articleInfo(e) : null)
    }
    return this.articles.get(name) ?? null
  }

  /** A list's sections with `InitRuntimeData`'s fix-ups applied. */
  dependentList(name: string): Section[] {
    let sections = this.lists.get(name)
    if (sections) return sections
    const e = this.listEls.get(name)
    if (!e) throw new Error(`The catalog has no dependent list '${name}'.`)
    sections = kids(sub(e, 'Sections')).map((s) => new Section(s))
    for (const s of sections) {
      for (const sa of s.articles) {
        sa.article = this.article(sa.longName)
        if (s.isSubconfig) {
          sa.minQuantity = sa.minAmount > 0 ? 1 : 0
          sa.maxQuantity = sa.maxAmount > 0 ? 1 : 0
          const ci = this.configItems.get(sa.longName)
          sa.article = {
            longName: sa.longName,
            blacklist: ci?.blacklist ?? [],
            regional: ci?.regional ?? [],
            ranking: null,
            unit: '',
            itemWideQuantityDiscount: false,
            hasMaxQuantityDiscount: false,
            quantityDiscounts: [],
          }
        }
      }
    }
    this.lists.set(name, sections)
    return sections
  }

  isRegionalRestricted(restricted: string[], iso: string): boolean {
    return restricted.some((r) => iso === r || (this.regions.get(r) ?? []).includes(iso))
  }
}

/** ConfigurationItem.DependentListName: the filter after its last `>`, else the name. */
function dependentListName(ci: ElementValue): string {
  const filter = str(ci, 'WorksheetArticleFilter') ?? ''
  const tail = filter.slice(filter.lastIndexOf('>') + 1)
  return tail.trim() ? tail : (str(ci, 'Name') ?? '')
}

// ── order side ────────────────────────────────────────────────────────────────

/** SectionArticleScreenData with the runtime state the configurator keeps beside it. */
export class OptionState {
  readonly el: ElementValue
  readonly name: string
  amount: number
  mode: AmountMode
  step: number
  readonly msrp: string | null
  readonly dp: string | null
  readonly additionalArticleName: string | null
  readonly customQuantityDiscount: string | null
  min = 0
  max = 0
  defaultAmount = 0
  isReadOnly = false
  isHidden = false
  isSelectable = false
  isBlacklisted = false
  isRegional = false
  sa!: SectionArticle
  article: ArticleInfo | null = null
  /** What the file held when it was opened. */
  readonly original: { amount: number; mode: AmountMode }

  constructor(el: ElementValue) {
    this.el = el
    this.name = text(el, 'Name') ?? ''
    this.amount = int(el, 'Amount', 0)
    this.mode = (str(el, 'AmountMode') ?? 'None') as AmountMode
    this.step = int(el, 'Step', 1)
    this.msrp = str(el, 'Msrp')
    this.dp = str(el, 'Dp')
    this.additionalArticleName = str(el, 'AdditionalArticleName')
    this.customQuantityDiscount = str(el, 'CustomQuantityDiscount')
    this.original = { amount: this.amount, mode: this.mode }
  }

  get isRestricted(): boolean {
    return this.isBlacklisted || this.isRegional
  }

  get isDisabled(): boolean {
    if (this.isSelectable && !this.isBlacklisted) return this.isRegional
    return true
  }
}

export class SectionState {
  readonly el: ElementValue
  readonly id: number
  readonly name: string
  readonly options: OptionState[]
  selection!: Selection
  type: SectionType = 'Selection'
  isHidden = false
  isReadOnly = false
  isRestricted = false
  isChanged = false
  /** The configurator's "your earlier choice was overridden" notes. */
  overridden: string[] = []

  constructor(el: ElementValue, id: number) {
    this.el = el
    this.id = id
    this.name = text(el, 'Name') ?? ''
    this.options = kids(sub(el, 'SectionArticles')).map((a) => new OptionState(a))
  }

  clearComments(): void {
    this.el.members = this.el.members.filter((m) => m.name !== 'Comments')
  }
}

/** A DependentListScreenData and its nested dependent lists. */
export class ListState {
  readonly el: ElementValue
  readonly itemName: string
  readonly listName: string
  readonly parameter: string | null
  readonly sectionDefs: Section[]
  readonly sections: SectionState[]
  readonly subconfigs: Array<ListState | { el: ElementValue; itemName: string }>
  /** Where the element sits, so a removed sub-configuration can be taken out. */
  readonly container: ElementValue | null

  constructor(el: ElementValue, catalog: EngineCatalog, container: ElementValue | null = null) {
    this.el = el
    this.container = container
    const ci = sub(el, 'ConfigurationItem')
    this.itemName = str(ci, 'Name') ?? ''
    this.listName = ci ? dependentListName(ci) : ''
    // XmlSerializer reads <Parameter /> as "", absent as null.
    this.parameter = ci && member(ci, 'Parameter') !== null ? (text(ci, 'Parameter') ?? '') : null
    this.sectionDefs = catalog.dependentList(this.listName)
    this.sections = kids(sub(el, 'Sections')).map((s, i) => new SectionState(s, i))
    if (this.sections.length !== this.sectionDefs.length) {
      throw new Error(
        `'${this.itemName}': the order has ${this.sections.length} sections, the catalog's '${this.listName}' has ` +
          `${this.sectionDefs.length}. The order and its catalog disagree; convert it first.`
      )
    }
    this.sections.forEach((sd, i) => {
      const sec = this.sectionDefs[i]
      if (sd.options.length !== sec.articles.length) {
        throw new Error(`'${this.itemName}' / '${sd.name}': the option lists disagree between order and catalog.`)
      }
      sd.type = sec.type
      sd.selection = sec.selection
      sd.options.forEach((o, j) => {
        const sa = sec.articles[j]
        o.sa = sa
        o.article = sa.article
        o.step = sa.step
        o.min = sa.minAmount
        o.max = sa.maxAmount
        o.defaultAmount = sa.defaultAmount
      })
    })
    const subs = sub(el, 'SubConfigurations')
    this.subconfigs = kids(subs).map((sc) =>
      sc.type === XSI_TYPE_DL
        ? new ListState(sc, catalog, subs)
        : { el: sc, itemName: str(sub(sc, 'ConfigurationItem'), 'Name') ?? '' }
    )
    // InitRuntimeData: an existing sub-configuration marks its section's option as chosen.
    this.sections.forEach((sd, i) => {
      if (this.sectionDefs[i].type !== 'SubConfiguration' || sd.options.length === 0) return
      const opt = sd.options[0]
      if (this.subconfigs.some((s) => s instanceof ListState && s.itemName === opt.name)) {
        opt.amount = 1
        opt.mode = 'UserChoice'
      }
    })
  }

  get no(): string {
    return text(this.el, 'No') ?? ''
  }

  /** This list and every dependent list nested under it, parent first. */
  *tree(): Generator<ListState> {
    yield this
    for (const s of this.subconfigs) if (s instanceof ListState) yield* s.tree()
  }
}

// ── engine ────────────────────────────────────────────────────────────────────

class ArticleEntry {
  name: string
  amount: number
  constructor(name: string, amount: number) {
    this.name = name
    this.amount = amount
  }
}

class MergedImplication {
  readonly unique: boolean
  readonly largestOnly: boolean
  readonly showSection: boolean
  readonly selection: Selection | null
  readonly isSoft: boolean
  readonly params: Operand[][] = []
  readonly targets: Array<string | null> = []

  constructor(imp: Implication) {
    this.unique = imp.unique
    this.largestOnly = imp.largestOnly
    this.showSection = imp.showSection
    this.selection = imp.selection
    this.isSoft = imp.isSoft
  }

  addTarget(target: string, raw: Operand[], trigger: OptionState, forceAmount: string | null): void {
    const ops = raw.map((o) => ({ ...o }))
    if (forceAmount) for (const o of ops) if (o.op !== '#' && o.value === 'amount') o.value = forceAmount
    for (let i = ops.length - 1; i > 0; i--) {
      if (ops[i].op !== '#' && ops[i].value !== null) tryParse(ops[i], trigger)
    }
    this.params.push(ops)
    this.targets.push(target)
  }

  removeNotDistinct(): string[] {
    const seen: string[] = []
    this.targets.forEach((t, i) => {
      if (t === null) return
      if (!seen.includes(t)) seen.push(t)
      else this.targets[i] = null
    })
    return seen
  }
}

function tryParse(o: Operand, option: OptionState | null): boolean {
  if (typeof o.value === 'number') return true
  switch (o.value) {
    case 'amount': o.value = option ? option.amount : null; return true
    case 'default': o.value = option ? option.defaultAmount : null; return true
    case 'min': o.value = option ? option.min : null; return true
    case 'max': o.value = option ? option.max : null; return true
    case 'step': o.value = option ? option.step : null; return true
  }
  if (o.value !== null && /^[+-]?\d+$/.test(o.value.trim())) {
    o.value = parseInt(o.value, 10)
    return true
  }
  return false
}

function basicOp(left: Operand, right: Operand): boolean {
  if (typeof left.value !== 'number' || typeof right.value !== 'number') return false
  const a = left.value
  const b = right.value
  switch (right.op) {
    case '+': left.value = a + b; break
    case '-': left.value = a - b; break
    case '*': left.value = a * b; break
    case '/': left.value = Math.trunc(a / Math.max(1, b)); break
    default: left.value = b
  }
  return true
}

type StackEntry = ArticleEntry | MergedImplication

class DependencyStack {
  private readonly stack: Array<[string, Map<string, StackEntry[]>]> = []

  private container(dl: string, sec: string): StackEntry[] {
    let d = this.stack.find(([n]) => n === dl)?.[1]
    if (!d) {
      d = new Map()
      this.stack.push([dl, d])
    }
    let c = d.get(sec)
    if (!c) {
      c = []
      d.set(sec, c)
    }
    return c
  }

  updateSelections(dl: string, sd: SectionState): void {
    const c = this.container(dl, sd.name)
    c.length = 0
    for (const o of sd.options) {
      if (o.isRestricted || o.amount <= 0) continue
      const e = c.find((x): x is ArticleEntry => x instanceof ArticleEntry && x.name === o.name)
      if (e) e.amount += o.amount
      else c.push(new ArticleEntry(o.name, o.amount))
    }
  }

  private find(dl: string, sec: string): ArticleEntry[] | null {
    if (!dl.trim()) {
      for (const [n, d] of this.stack) {
        if (n.trim() && d.has(sec)) return d.get(sec)!.filter((x): x is ArticleEntry => x instanceof ArticleEntry)
      }
      return null
    }
    return this.container(dl, sec).filter((x): x is ArticleEntry => x instanceof ArticleEntry)
  }

  articleAmount(dl: string, sec: string, name: string): number {
    return this.find(dl, sec)?.find((e) => e.name === name)?.amount ?? 0
  }

  selectedCount(dl: string, sec: string): number {
    return (this.find(dl, sec) ?? []).filter((e) => e.amount > 0).length
  }

  updateImplications(dl: string, sd: SectionState): void {
    for (let i = 1; i <= 6; i++) {
      let merged: MergedImplication | null = null
      for (const o of sd.options) {
        if ((o.isDisabled || o.amount === 0) && sd.type !== 'SubConfiguration') continue
        for (const imp of o.sa.implications) {
          if (imp.id !== i) continue
          const flag = sd.type === 'SubConfiguration' && dl !== imp.dlRef
          if (o.amount !== 0 || flag) {
            if (!merged) {
              merged = new MergedImplication(imp)
              this.container(imp.dlRef, imp.secRef).push(merged)
            }
            imp.names.forEach((target, k) => merged!.addTarget(target, imp.params[k] ?? [], o, flag ? '1' : null))
          }
        }
      }
    }
  }

  implications(dl: string, sec: string): MergedImplication[] {
    const pick = (c: StackEntry[]) => c.filter((x): x is MergedImplication => x instanceof MergedImplication)
    return [...pick(this.container(dl, sec)), ...pick(this.container('', sec))]
  }
}

/** SectionSelectionMode.GetMaxAllowedAmount. */
export function maxAllowedAmount(sd: SectionState, target: OptionState): number {
  let n = target.max
  const mode = sd.selection.mode
  if (mode === 'MinXMaxY') {
    if (sd.selection.y !== null) {
      const used = sd.options.filter((o) => !o.isDisabled && o !== target).reduce((s, o) => s + o.amount, 0)
      const rest = sd.selection.y - used
      n = rest > 0 ? Math.min(n, rest) : 0
    }
  } else if (mode === 'ExactlyOne' || mode === 'ZeroOrOne') {
    if (sd.options.some((o) => !o.isDisabled && o !== target && o.amount > 0)) n = 0
  }
  return n
}

function trySetArticleDefaults(sd: SectionState): void {
  if (sd.options.some((o) => o.mode === 'UserChoice')) return
  for (const o of sd.options) {
    if (!o.isDisabled && o.defaultAmount !== 0 && o.amount <= 0 && o.mode === 'None') {
      if (sd.selection.maxAmount <= sd.options.filter((x) => x.amount > 0).length) break
      o.amount = Math.min(Math.max(o.defaultAmount, o.min), o.max)
      o.mode = 'Default'
    }
  }
}

/** SectionSelectionMode.TryPreselectAmountsIfNoChoice. */
function tryPreselectIfNoChoice(sd: SectionState): boolean {
  const source = sd.options.filter((o) => !o.isDisabled && o.max > 0)
  const fixed = source.filter((o) => o.min > 0 && o.min === o.max)
  if (source.length === 0) return true
  if (!source.some((o) => !o.isReadOnly)) return true
  if (source.length === fixed.length) return true
  const mode = sd.selection.mode
  if (mode === 'OneOrMore') return false
  if (mode === 'ZeroOrOne') return fixed.length > 0
  let only: OptionState | null = null
  if (mode === 'ExactlyOne') {
    if (fixed.length > 0) return true
    if (source.length > 1) return false
    only = source[0]
  }
  if (mode === 'AtLeastOne') {
    if (source.length > 1) return false
    only = source[0]
  }
  if (only && only.max === 1) {
    if (only.amount === 0) {
      only.amount = 1
      only.mode = 'SectionSpecialFunction'
      only.min = only.amount
    }
    return true
  }
  if (mode !== 'MinXMaxY') return false
  const totalMin = source.reduce((s, o) => s + o.min, 0)
  const totalMax = source.reduce((s, o) => s + o.max, 0)
  if (totalMin === sd.selection.maxAmount) {
    for (const o of source.filter((x) => x.min > 0)) {
      if (o.amount !== o.min) {
        o.amount = o.min
        o.mode = 'SectionSpecialFunction'
        o.min = o.amount
      }
    }
    return true
  }
  if (totalMax === sd.selection.minAmount) {
    for (const o of source.filter((x) => x.min > 0)) {
      if (o.amount < o.max) {
        o.amount = o.max
        o.mode = 'SectionSpecialFunction'
        o.min = o.amount
      }
    }
    return true
  }
  return false
}

function specialFunctions(sd: SectionState, sec: Section, stack: DependencyStack, dl: string): void {
  switch (sec.special) {
    case 'None':
      tryPreselectIfNoChoice(sd)
      break
    case 'AlwaysHide':
      sd.isHidden = true
      break
    case 'HideAlwaysAutoSelectMaxQuantity':
      for (const o of sd.options) {
        if (!o.isDisabled && o.mode !== 'Implication') {
          o.amount = o.max
          o.min = o.amount
          o.mode = 'SectionSpecialFunction'
          o.isReadOnly = true
        }
      }
      sd.isHidden = true
      break
    case 'ReadOnly':
      tryPreselectIfNoChoice(sd)
      sd.isReadOnly = true
      for (const o of sd.options) o.isReadOnly = true
      break
    case 'HideArticleSectionIfNoChoice':
      sd.isHidden = tryPreselectIfNoChoice(sd)
      break
    case 'HideArticleSectionIfNoArticle':
      tryPreselectIfNoChoice(sd)
      if (!sd.options.some((o) => !o.isDisabled)) sd.isHidden = true
      break
    case 'ShowOnlyIfSetByImplication':
      sd.isHidden = true
      if (stack.implications(dl, sd.name).some((m) => m.showSection)) {
        sd.isHidden = false
        tryPreselectIfNoChoice(sd)
      }
      break
  }
}

/** TechCategorySynchronizer.SynchornizeTechAmounts. */
function syncTechAmounts(sd: SectionState, sec: Section): void {
  const entries: Array<{ tc: number; amount: number; mode: AmountMode }> = []
  let guard = 1000
  let i = 0
  while (i < sec.articles.length) {
    if (guard-- < 0) break
    const o = sd.options[i]
    const tc = sec.articles[i].techCategory
    if (o.isDisabled || tc === 0) {
      i++
      continue
    }
    const e = entries.find((x) => x.tc === tc)
    const weak = e !== undefined && (e.mode === 'SoftImplication' || e.mode === 'Default')
    if (!e) {
      if (o.mode !== 'None') {
        entries.push({ tc, amount: o.amount, mode: o.mode })
        i = 0
        continue
      }
    } else if (
      (o.mode === 'SectionSpecialFunction' || o.mode === 'Implication' || o.mode === 'UserChoice') &&
      (o.amount > e.amount || weak)
    ) {
      e.amount = o.amount
      e.mode = o.mode
      i = 0
      continue
    } else if (o.mode === 'SoftImplication' && o.amount > e.amount && e.mode === 'Default') {
      e.amount = o.min
      e.mode = 'UserChoice'
      i = 0
      continue
    } else {
      const val = Math.min(Math.max(e.amount, o.min), o.max)
      if (o.amount !== val) {
        o.amount = val
        o.mode = e.mode
      }
    }
    i++
  }
}

function resetAmountsAndFlags(sd: SectionState, sec: Section): void {
  sd.isHidden = false
  sd.isReadOnly = false
  sd.isChanged = false
  sd.type = sec.type
  sd.selection = sec.selection
  sd.options.forEach((o, i) => {
    if (o.isRestricted) return
    const sa = sec.articles[i]
    o.step = sa.step
    o.defaultAmount = sa.defaultAmount
    o.max = sa.maxAmount
    o.min = sa.minAmount
    o.amount = 0
    o.mode = 'None'
    o.isReadOnly = false
    o.isHidden = !o.isSelectable
  })
}

function image(sd: SectionState): string {
  const rows = sd.options
    .filter((o) => !o.isRestricted)
    .map((o) => [o.amount, o.mode, o.min, o.max, o.defaultAmount, o.step, o.isHidden, o.isReadOnly, o.isSelectable].join(','))
  rows.push([sd.isHidden, sd.isReadOnly, sd.type, sd.selection.key()].join(','))
  return rows.join('|')
}

class UserChoiceHandler {
  private readonly c = new Map<string, [number[], number[]]>()

  private get(dl: string, id: number, n: number): [number[], number[]] {
    const key = `${dl}\u0000${id}`
    let v = this.c.get(key)
    if (!v) {
      v = [new Array(n).fill(-1), new Array(n).fill(-1)]
      this.c.set(key, v)
    }
    return v
  }

  collect(dl: string, sd: SectionState, sec: Section): void {
    const [counts, amounts] = this.get(dl, sd.id, sd.options.length)
    const hasUser = sd.options.some((o) => o.mode === 'UserChoice')
    const techs: Array<[number, number]> = []
    sd.options.forEach((o, i) => {
      if (o.mode === 'Reset') {
        o.mode = 'None'
        counts[i] = amounts[i] = -1
      } else if (
        o.mode === 'UserChoice' ||
        (hasUser && (o.defaultAmount > 0 || o.mode === 'SoftImplication') && !o.isDisabled && !o.isHidden && !o.isReadOnly)
      ) {
        counts[i] = Math.trunc(o.amount / (o.step || 1))
        amounts[i] = o.amount
        const tc = sec.articles[i].techCategory
        if (tc > 0 && !techs.some(([t]) => t === tc)) techs.push([tc, o.amount])
      } else {
        counts[i] = amounts[i] = -1
      }
    })
    for (const [tc, amt] of techs) {
      sd.options.forEach((o, i) => {
        if (sec.articles[i].techCategory === tc && o.mode !== 'UserChoice' && o.isSelectable) amounts[i] = amt
      })
    }
  }

  tryRestore(dl: string, sd: SectionState): void {
    if (sd.isHidden || sd.isReadOnly) return
    const [counts] = this.get(dl, sd.id, sd.options.length)
    sd.options.forEach((o, i) => {
      let num = counts[i]
      if (num < 0) return
      if (o.mode === 'Implication' || o.mode === 'SectionSpecialFunction') {
        if (o.min < o.amount) o.min = o.amount
        return
      }
      if (o.isDisabled || o.isHidden || o.isReadOnly || (o.min === o.max && o.amount === o.max)) return
      num *= o.step
      if (num > o.amount) {
        const source = sd.options.filter((x) => x.isSelectable)
        if (sd.selection.maxAmount === 1) {
          if (source.some((x) => x.amount > 0)) {
            for (const x of source) if (!x.isHidden && !x.isReadOnly && x.min === 0) x.amount = 0
          }
          if (!source.some((x) => x.amount > 0)) {
            o.amount = Math.max(1, num)
            o.mode = 'UserChoice'
          }
        } else {
          o.amount = Math.min(num, o.max)
          o.mode = 'UserChoice'
        }
      } else if (num < o.amount) {
        if (num >= Math.max(num, o.min)) {
          o.amount = Math.min(num, o.max)
          o.mode = 'UserChoice'
        }
      } else {
        o.mode = 'UserChoice'
      }
    })
  }

  updateAndWarn(dl: string, sd: SectionState): void {
    const [counts, amounts] = this.get(dl, sd.id, sd.options.length)
    if (sd.isHidden) {
      counts.fill(-1)
      amounts.fill(-1)
      return
    }
    const hasUser = sd.options.some((o) => o.mode === 'UserChoice')
    sd.options.forEach((o, i) => {
      const before = amounts[i]
      if (
        o.mode === 'UserChoice' ||
        (hasUser && (o.defaultAmount > 0 || o.mode === 'SoftImplication') && !o.isDisabled && !o.isHidden && !o.isReadOnly)
      ) {
        counts[i] = Math.trunc(o.amount / (o.step || 1))
        amounts[i] = o.amount
        return
      }
      counts[i] = amounts[i] = -1
      // The C# also has an "Added selection" branch here for a UserChoice
      // option, but every UserChoice option has already returned above.
      if (before > 0) {
        if (o.amount === 0) sd.overridden.push(`Removed selection: ${o.name}`)
        else if (o.amount !== before) sd.overridden.push(`Amount changed (was ${before}): ${o.name}`)
      }
    })
  }
}

export interface EngineContext {
  /** OrderData/Username — blacklists are per user. */
  username: string
  /** OrderData/DestinationNew/Iso — regional restrictions are per destination. */
  iso: string
}

/** DependentListHandler: processes one list and, through sub-handlers, its children. */
class ListHandler {
  private readonly ctx: EngineContext
  readonly data: ListState
  private readonly catalog: EngineCatalog
  private readonly uch: UserChoiceHandler
  private subs: ListHandler[] = []
  private initDone = false
  readonly removedSubconfigs: string[]

  constructor(ctx: EngineContext, data: ListState, catalog: EngineCatalog, uch?: UserChoiceHandler, removed?: string[]) {
    this.ctx = ctx
    this.data = data
    this.catalog = catalog
    this.uch = uch ?? new UserChoiceHandler()
    this.removedSubconfigs = removed ?? []
    this.updateRestrictions()
    this.resetRestricted()
  }

  private get dl(): string {
    return this.data.listName
  }

  private updateRestrictions(): void {
    for (const sd of this.data.sections) {
      for (const o of sd.options) {
        const a = o.article
        o.isBlacklisted = !!a && a.blacklist.includes(this.ctx.username)
        o.isRegional = !!a && this.catalog.isRegionalRestricted(a.regional, this.ctx.iso)
      }
    }
  }

  private resetRestricted(): void {
    for (const sd of this.data.sections) {
      for (const o of sd.options) {
        if (!o.isRestricted) continue
        o.step = o.defaultAmount = o.min = o.max = o.amount = 0
        o.mode = 'None'
        o.isSelectable = o.isReadOnly = false
        o.isHidden = true
      }
      sd.isRestricted = sd.options.length > 0 && sd.options.every((o) => o.isBlacklisted || o.isRegional)
      sd.isHidden = sd.isRestricted
    }
  }

  // preconditions

  private matchParameter(name: string): boolean {
    if (!name.toLowerCase().startsWith(PARAMETER) || this.data.parameter === null) return false
    return name.replace(PARAMETER, '').trim().toLowerCase() === this.data.parameter.toLowerCase()
  }

  private refSelected(stack: DependencyStack, pre: Precondition, i: number): boolean {
    const amt = stack.articleAmount(pre.dlRef, pre.secRef, pre.names[i])
    return amt > pre.mins[i] && amt < pre.maxs[i]
  }

  private check(pre: Precondition, stack: DependencyStack): boolean {
    if (pre.names.some((n) => n.trim() !== '' && !n.toLowerCase().startsWith(PARAMETER))) {
      if (pre.names.includes(NO_ARTICLE) && stack.selectedCount(pre.dlRef, pre.secRef) === 0) return true
    }
    const hit = (n: string, i: number) => this.matchParameter(n) || this.refSelected(stack, pre, i)
    const miss = (n: string, i: number) => !this.matchParameter(n) && !this.refSelected(stack, pre, i)
    switch (pre.logical) {
      case 'And': return pre.names.every(hit)
      case 'Or': return pre.names.some(hit)
      case 'AndNot': return pre.names.every(miss)
      case 'OrNot': return pre.names.some(miss)
      default: return false
    }
  }

  private checkAll(pres: Precondition[], stack: DependencyStack): boolean {
    let flag = true
    let conn = 'And'
    for (const pre of pres) {
      const f = this.check(pre, stack)
      flag = conn === 'And' ? f && flag : f || flag
      conn = pre.sectionLogical
    }
    return flag
  }

  // implications

  private merged(sd: SectionState, list: MergedImplication[]): void {
    for (const m of list) {
      if (m.unique) {
        m.removeNotDistinct()
      } else if (m.largestOnly) {
        const names = m.removeNotDistinct()
        const src = sd.options.filter((o) => !o.isDisabled && names.includes(o.name))
        let keep: string | null = null
        if (src.length > 0) {
          const rankings = src.map((o) => o.article?.ranking).filter((r): r is number => r !== null && r !== undefined)
          const top = rankings.length > 0 ? Math.max(...rankings) : 0
          keep = src.find((o) => (o.article?.ranking ?? 0) === top)?.name ?? null
        }
        m.targets.forEach((t, k) => {
          if (keep === null || keep !== t) m.targets[k] = null
        })
      }
      const mode: AmountMode = m.isSoft ? 'SoftImplication' : 'Implication'
      m.targets.forEach((target, k) => {
        if (target === null) return
        for (const item of sd.options.filter((o) => !o.isDisabled && o.name === target)) {
          const allowed = maxAllowedAmount(sd, item)
          rightSide(m.params[k], item)
          apply(m.params[k], item, allowed, mode)
        }
      })
    }
  }

  // sub-configurations

  private subHandler(ci: ConfigItemInfo): ListHandler | null {
    let h = this.subs.find((s) => s.dl === ci.filter) ?? null
    if (h && !this.data.subconfigs.includes(h.data)) {
      this.subs = this.subs.filter((s) => s !== h)
      h = null
    }
    if (!h) {
      const sc = this.data.subconfigs.find((s) => s.itemName === ci.name)
      if (sc instanceof ListState) {
        h = new ListHandler(this.ctx, sc, this.catalog, this.uch, this.removedSubconfigs)
        this.subs.push(h)
      }
    }
    return h
  }

  private removeSubconfig(sc: ListState | { el: ElementValue; itemName: string }): void {
    const i = this.data.subconfigs.indexOf(sc)
    this.data.subconfigs.splice(i, 1)
    const container = sub(this.data.el, 'SubConfigurations')
    if (container) container.members = container.members.filter((m) => m.value !== sc.el)
    this.subs = this.subs.filter((h) => h.data !== sc)
    this.removedSubconfigs.push(sc.itemName)
  }

  // processing

  /** ProcessDependentLists: one full pass over the list and its children. */
  process(): void {
    const stack = new DependencyStack()
    let num = -1
    let pass = 0
    for (; pass < 21; pass++) {
      num = this.processSections(stack, num + 1)
      if (num < 0) break
      const ciName = this.data.sections[num].options[0]?.name
      const ci = ciName !== undefined ? this.catalog.configItems.get(ciName) : undefined
      if (!ci) continue
      this.subHandler(ci)?.processSections(stack)
    }
    if (pass >= 21) throw new Error('Unable to process dependent lists.')
    this.initDone = true
  }

  processSections(stack: DependencyStack, start = 0): number {
    const defs = this.data.sectionDefs
    if (start < 0 || start >= defs.length) return -1
    for (let i = start; i < defs.length; i++) {
      const sd = this.data.sections[i]
      if (sd.isRestricted) continue
      this.processSection(sd, defs[i], stack)
      if (sd.type === 'SubConfiguration') return i
    }
    return -1
  }

  private processSection(sd: SectionState, sec: Section, stack: DependencyStack): void {
    const before = image(sd)
    const loaded = this.initDone ? null : sd.options.map((o) => o.amount)
    this.uch.collect(this.dl, sd, sec)
    sd.options.forEach((o, i) => {
      o.isSelectable = !o.isRestricted && this.checkAll(sec.articles[i].preconditions, stack)
    })
    resetAmountsAndFlags(sd, sec)
    const withSelection = stack.implications(this.dl, sd.name).find((m) => m.selection !== null)
    if (withSelection) sd.selection = withSelection.selection!
    const src = stack.implications(this.dl, sd.name).filter((m) => m.targets.length > 0)
    this.merged(sd, src.filter((m) => !m.isSoft))
    for (const o of sd.options.filter((x) => !x.isDisabled && x.amount === 0 && x.min > 0)) {
      if (o.min <= maxAllowedAmount(sd, o)) {
        o.amount = Math.min(o.min, o.max)
        o.mode = 'Default'
      }
    }
    this.merged(sd, src.filter((m) => m.isSoft))
    specialFunctions(sd, sec, stack, this.dl)
    this.uch.tryRestore(this.dl, sd)
    trySetArticleDefaults(sd)
    if (loaded && loaded.some((x) => x !== 0)) {
      if (!sd.isRestricted && !sd.isHidden && !sd.isReadOnly && sd.options.every((o) => o.amount === 0)) {
        sd.options.forEach((o, i) => {
          if (!o.isHidden && !o.isReadOnly && !o.isDisabled) {
            o.amount = loaded[i]
            o.mode = loaded[i] !== 0 ? 'UserChoice' : 'None'
          }
        })
      }
    }
    syncTechAmounts(sd, sec)
    if (sec.type === 'SubConfiguration' && sd.options.length > 0) {
      const opt = sd.options[0]
      const sc = this.data.subconfigs.find((s) => s.itemName === opt.name)
      if (opt.amount === 0) {
        if (sc) {
          this.removeSubconfig(sc)
          sd.isChanged = true
        }
      } else if (!sc) {
        throw new NeedsGpcError(
          `'${opt.name}' would be added to '${this.data.itemName}' as a new sub-configuration ` +
            `(section '${sd.name}'). Building one is not supported here yet — make that pick in GPC.`
        )
      }
    }
    this.uch.updateAndWarn(this.dl, sd)
    for (const o of sd.options) {
      if (o.isDisabled || o.max === 0) {
        o.isHidden = true
        continue
      }
      o.isReadOnly ||= sd.isReadOnly || (o.min === o.max && o.amount === o.min)
      o.isHidden ||= (sd.isReadOnly || o.isReadOnly) && o.amount === 0
    }
    sd.isHidden ||= sd.isReadOnly && !sec.mandatoryComment && sd.options.every((o) => o.isDisabled || o.isHidden)
    if (sd.isHidden) sd.clearComments()
    if (sec.isSubconfig && sd.options.length > 0) {
      const sc = this.data.subconfigs.find((s) => s.itemName === sd.options[0].name)
      if (sc && member(sc.el, 'IsHidden') !== null) setText(sc.el, 'IsHidden', sd.isHidden ? 'true' : 'false')
    }
    stack.updateSelections(this.dl, sd)
    stack.updateImplications(this.dl, sd)
    sd.isChanged ||= image(sd) !== before
  }
}

function rightSide(ops: Operand[], target: OptionState): void {
  for (let n = ops.length - 1; n > 0; n--) {
    const p = ops[n]
    if (p.op === '=' && p.value === null) {
      const prev = ops[n - 1]
      if (prev.op === '#') {
        p.value = prev.value
        tryParse(p, target)
      }
    }
  }
  for (const c of '/*-+') {
    for (let n = ops.length - 1; n > 0; n--) {
      if (n < ops.length && ops[n].op === c && basicOp(ops[n - 1], ops[n])) ops.splice(n, 1)
    }
  }
}

function apply(ops: Operand[], target: OptionState, allowed: number, mode: AmountMode): void {
  let left: Operand | null = null
  for (const p of ops) {
    if (!left) {
      left = p.op === '#' ? p : null
      continue
    }
    if (p.op === '=') setParam(left, p, target, allowed, mode)
    left = null
  }
}

function setParam(left: Operand, right: Operand, t: OptionState, allowed: number, mode: AmountMode): void {
  if (typeof right.value !== 'number') return
  let val = right.value
  switch (left.value) {
    case 'amount': {
      val *= t.step
      const n = Math.min(Math.min(Math.max(val, t.min), t.max), allowed)
      if (allowed > 0) {
        t.amount = n
        t.mode = mode === 'Implication' || t.mode === 'Implication' ? 'Implication' : 'SoftImplication'
        if (t.mode === 'Implication') {
          t.min = t.amount
          t.isReadOnly = true
        }
      }
      break
    }
    case 'default': t.defaultAmount = Math.min(val, t.max); break
    case 'min': t.min = Math.min(val, t.max); break
    case 'max': t.max = val; break
    case 'step': t.step = Math.min(Math.max(val, 1), t.max); break
  }
}

/** SectionScreenDataValidatorExt.Validate, minus the comment-format check. */
export function sectionComplete(sd: SectionState): boolean {
  if (sd.isHidden || sd.isRestricted) return true
  const live = sd.options.filter((o) => !o.isDisabled && !o.isHidden)
  if (live.length === 0 || live.every((o) => o.isReadOnly)) return true
  const picked = live.filter((o) => o.amount > 0).length
  switch (sd.selection.mode) {
    case 'ExactlyOne': return picked === 1
    case 'ZeroOrOne': return picked <= 1
    case 'AtLeastOne': return picked >= 1
    case 'MinXMaxY': {
      const total = live.reduce((s, o) => s + o.amount, 0)
      const lo = live.reduce((s, o) => s + o.min, 0)
      const hi = live.reduce((s, o) => s + o.max, 0)
      const { x, y } = sd.selection
      return x !== null && (total >= x || total === hi) && y !== null && (total <= y || total === lo)
    }
    default: return true
  }
}

// ── prices ────────────────────────────────────────────────────────────────────

export interface ListTotals {
  msrp: Dec | null
  dp: Dec | null
  /** Anything the roll-up cannot price; non-empty means the totals are not trustworthy. */
  problems: string[]
}

/**
 * ChildControlMultipleViewModel.TotalMsrp/TotalDp: the sum of each picked
 * option's `SumMsrp`. Every option carries the price the configurator computed
 * from the order's own catalog, picked or not, so re-pricing is a sum — it
 * needs no pricing engine and cannot drift from the file's catalog.
 */
export function listTotals(list: ListState): ListTotals {
  let msrp: Dec | null = null
  let dp: Dec | null = null
  const problems: string[] = []
  for (const sd of list.sections) {
    for (const o of sd.options) {
      if (o.amount <= 0) continue
      const a = o.article
      if (o.additionalArticleName) problems.push(`'${o.name}' carries an additional-choice article`)
      let n = o.amount
      if (n > 1 && a && a.unit.toLowerCase() === 'months') n = Math.trunc(n / (o.step || 1))
      let factor: Dec = fromInt(1)
      if (a) {
        const qd = quantityDiscount(a, o.amount)
        if (qd < 1 && a.itemWideQuantityDiscount) {
          problems.push(`'${o.name}' has an item-wide quantity discount`)
        } else if (a.hasMaxQuantityDiscount) {
          const custom = parseDecimalOrNull(o.customQuantityDiscount)
          if (custom === null) continue
          factor = subtract(fromInt(1), divide(custom, fromInt(100)))
        } else if (qd !== 1) {
          factor = parseDecimal(String(Number(qd.toPrecision(15))))
        }
      }
      const m = parseDecimalOrNull(o.msrp)
      const d = parseDecimalOrNull(o.dp)
      if (m) msrp = add(msrp ?? fromInt(0), multiply(multiply(m, fromInt(n)), factor))
      if (d) dp = add(dp ?? fromInt(0), multiply(multiply(d, fromInt(n)), factor))
    }
  }
  return { msrp, dp, problems }
}

function orderItems(order: OrderDocument): ElementValue[] {
  const out: ElementValue[] = []
  for (const group of ['DependentListsData', 'FreeArticlesData', 'FreeListArticlesData', 'SupportArticlesData']) {
    for (const item of kids(sub(order.root, group))) {
      const use = (text(item, 'UseInCalculation') ?? 'true').toLowerCase() === 'true'
      if (!use) continue
      out.push(item)
      out.push(...kids(sub(item, 'SubConfigurations')))
    }
  }
  return out
}

/**
 * MainScreenViewModel.UpdateTotals over the items' stored totals: the final
 * price, the customer discount and `OrderValueToGom` under the user's split
 * model. The handling fee is carried, not recomputed.
 */
export function orderTotals(order: OrderDocument, catalog: EngineCatalog): Record<string, Dec> {
  let msrp = fromInt(0)
  let dp = fromInt(0)
  for (const item of orderItems(order)) {
    msrp = add(msrp, parseDecimalOrNull(text(item, 'TotalMsrp')) ?? fromInt(0))
    dp = add(dp, parseDecimalOrNull(text(item, 'TotalDp')) ?? fromInt(0))
  }
  const root = order.root
  const fee = parseDecimalOrNull(text(root, 'HandlingFee')) ?? fromInt(0)
  const checked = (text(root, 'DifferentFinalPriceForEndCustomerChecked') ?? '') === 'true'
  const custom = checked ? parseDecimalOrNull(text(root, 'FinalPriceForEndCustomerLocalCurrency')) : null
  const positive = compare(msrp, fromInt(0)) > 0
  const margin = positive ? subtract(fromInt(1), divide(dp, msrp)) : fromInt(0)
  const final = custom ?? msrp
  const discount = positive ? subtract(fromInt(1), divide(final, msrp)) : fromInt(0)
  const user = catalog.users.get(text(root, 'Username') ?? '')
  const model = user ? str(user, 'OrderValueToGomModel') : 'NoSplit'
  let toGom: Dec
  if (model === 'ApplySplit') {
    const factor = add(subtract(fromInt(1), margin), divide(discount, fromInt(2)))
    toGom = checked ? multiply(final, factor) : isZero(msrp) ? dp : multiply(msrp, factor)
  } else if (model === 'Direct' && checked) {
    toGom = final
  } else {
    toGom = dp
  }
  const directAllowed = !!user && bool(user, 'DirectSales')
  if (directAllowed && (text(root, 'DirectSalesChecked') ?? '') === 'true') toGom = final
  else if (custom && compare(custom, msrp) > 0) toGom = dp
  return {
    Msrp: msrp,
    Dp: dp,
    FinalPriceForEndCustomer: final,
    FinalPriceForEndCustomerWithHandlingFee: add(final, fee),
    DiscountForCustomer: discount,
    OrderValueToGom: toGom,
    OrderValueToGomWithHandlingFee: add(toGom, fee),
  }
}

// ── the public surface ────────────────────────────────────────────────────────

/** One option as the editor shows it. */
export interface OptionView {
  index: number
  name: string
  amount: number
  mode: AmountMode
  min: number
  max: number
  /** Largest amount the section still allows for this option. */
  allowed: number
  msrp: string | null
  dp: string | null
  disabled: boolean
  hidden: boolean
  readOnly: boolean
  original: number
}

export interface SectionView {
  index: number
  name: string
  description: string
  mode: SelectionMode
  selection: Selection
  isQuantity: boolean
  isSubconfig: boolean
  hidden: boolean
  readOnly: boolean
  complete: boolean
  overridden: string[]
  options: OptionView[]
}

export interface ListView {
  no: string
  itemName: string
  listName: string
  totals: ListTotals
  storedMsrp: string | null
  storedDp: string | null
  sections: SectionView[]
}

export interface OptionChange {
  no: string
  section: string
  option: string
  from: number
  to: number
  mode: AmountMode
}

export interface ReplayDiff {
  no: string
  section: string
  option: string
  stored: { amount: number; mode: AmountMode }
  engine: { amount: number; mode: AmountMode }
}

function contextOf(order: OrderDocument): EngineContext {
  const dest = sub(order.root, 'DestinationNew')
  return { username: text(order.root, 'Username') ?? '', iso: (dest && text(dest, 'Iso')) ?? '' }
}

function findItem(order: OrderDocument, no: string): { el: ElementValue; container: ElementValue } {
  const container = sub(order.root, 'DependentListsData')
  const walk = (list: ElementValue | null): { el: ElementValue; container: ElementValue } | null => {
    for (const item of kids(list)) {
      if (text(item, 'No') === no) return { el: item, container: list! }
      const hit = walk(sub(item, 'SubConfigurations'))
      if (hit) return hit
    }
    return null
  }
  const hit = walk(container)
  if (!hit) throw new Error(`No configured system numbered ${no} in this order.`)
  return hit
}

/**
 * An open system, as the configurator holds it while its window is open: the
 * option tree, the rules engine's state, and what the operator has changed.
 *
 * It works on the document it was given. Discard the document to cancel;
 * `commit()` writes amounts and totals into it.
 */
export class SystemEditor {
  readonly order: OrderDocument
  readonly catalog: EngineCatalog
  readonly root: ListState
  private readonly handler: ListHandler

  constructor(order: OrderDocument, config: ElementValue | EngineCatalog, no: string) {
    this.order = order
    this.catalog = config instanceof EngineCatalog ? config : new EngineCatalog(config)
    const { el, container } = findItem(order, no)
    this.root = new ListState(el, this.catalog, container)
    // Opening the item's window runs the list once.
    this.handler = new ListHandler(contextOf(order), this.root, this.catalog)
    this.handler.process()
  }

  /** Stored selections the engine does not reproduce. Empty for a file the configurator saved. */
  replayDiffs(): ReplayDiff[] {
    const out: ReplayDiff[] = []
    for (const list of this.root.tree()) {
      list.sections.forEach((sd, i) => {
        const isSub = list.sectionDefs[i].type === 'SubConfiguration'
        for (const o of sd.options) {
          // InitRuntimeData re-marks an existing sub-configuration UserChoice on
          // open, so a stored Default there is not a disagreement.
          if (isSub && o.amount === o.original.amount) continue
          if (o.amount !== o.original.amount || (o.amount !== 0 && o.mode !== o.original.mode)) {
            out.push({
              no: list.no,
              section: sd.name,
              option: o.name,
              stored: o.original,
              engine: { amount: o.amount, mode: o.mode },
            })
          }
        }
      })
    }
    return out
  }

  view(): ListView[] {
    const out: ListView[] = []
    for (const list of this.root.tree()) {
      out.push({
        no: list.no,
        itemName: list.itemName,
        listName: list.listName,
        totals: listTotals(list),
        storedMsrp: text(list.el, 'TotalMsrp'),
        storedDp: text(list.el, 'TotalDp'),
        sections: list.sections.map((sd, i) => {
          const def = list.sectionDefs[i]
          return {
            index: i,
            name: sd.name,
            description: def.description,
            mode: sd.selection.mode,
            selection: sd.selection,
            isQuantity: def.type === 'Amount' || def.type === 'AmountWithAdditionalChoice',
            isSubconfig: def.type === 'SubConfiguration',
            hidden: sd.isHidden || sd.isRestricted,
            readOnly: sd.isReadOnly,
            complete: sectionComplete(sd),
            overridden: [...sd.overridden],
            options: sd.options.map((o, j) => ({
              index: j,
              name: o.name,
              amount: o.amount,
              mode: o.mode,
              min: o.min,
              max: o.max,
              allowed: maxAllowedAmount(sd, o),
              msrp: o.msrp,
              dp: o.dp,
              disabled: o.isDisabled,
              hidden: o.isHidden,
              readOnly: o.isReadOnly,
              original: o.original.amount,
            })),
          }
        }),
      })
    }
    return out
  }

  /**
   * What a click does. Refuses what the configurator would not let the operator
   * do, then sets the amount as a user choice, clears radio and tech-category
   * siblings, and re-runs the whole list so implications follow.
   */
  pick(sectionIndex: number, optionIndex: number, amount: number): void {
    const sd = this.root.sections[sectionIndex]
    const o = sd?.options[optionIndex]
    if (!o) throw new PickError('No such option.')
    const label = `${sd.name}: ${o.name}`
    if (o.isDisabled) throw new PickError(`${label} is not available with the current configuration.`)
    if (sd.isHidden || o.isHidden) throw new PickError(`${label} is not shown by the configurator right now.`)
    if ((o.mode === 'Implication' || o.mode === 'SectionSpecialFunction') && amount !== o.amount) {
      throw new PickError(`${label} is set by another choice — change that choice instead.`)
    }
    if (o.isReadOnly && amount !== o.amount) throw new PickError(`${label} is read-only.`)
    if (amount < 0) throw new PickError('A quantity cannot be negative.')
    if (amount > o.max) throw new PickError(`${label}: at most ${o.max}.`)
    if (amount > 0 && sd.selection.mode === 'MinXMaxY' && amount > maxAllowedAmount(sd, o)) {
      const def = this.root.sectionDefs[sectionIndex]
      throw new PickError(
        `'${sd.name}' allows ${sd.selection.minAmount}–${sd.selection.maxAmount} and is full.` +
          (def.description ? ` ${def.description}` : '')
      )
    }
    for (const s of this.root.sections) s.overridden = []
    o.amount = amount
    o.mode = 'UserChoice'
    if (sd.type !== 'SubConfiguration') {
      const tc = o.sa.techCategory
      if (tc > 0) {
        for (const x of sd.options) {
          if (!x.isDisabled && x !== o && x.sa.techCategory === tc) {
            x.amount = 0
            x.mode = 'None'
          }
        }
      }
      if (sd.selection.mode === 'ExactlyOne' || sd.selection.mode === 'ZeroOrOne') {
        for (const x of sd.options) {
          if (!x.isDisabled && x !== o) {
            x.amount = 0
            x.mode = 'None'
          }
        }
      }
    }
    this.handler.process()
  }

  /** Every option whose amount differs from the file as opened. */
  changes(): OptionChange[] {
    const out: OptionChange[] = []
    for (const list of this.root.tree()) {
      for (const sd of list.sections) {
        for (const o of sd.options) {
          if (o.amount !== o.original.amount) {
            out.push({ no: list.no, section: sd.name, option: o.name, from: o.original.amount, to: o.amount, mode: o.amount ? o.mode : o.original.mode })
          }
        }
      }
    }
    return out
  }

  get removedSubconfigs(): string[] {
    return this.handler.removedSubconfigs
  }

  /** Sections the configurator would paint as incomplete. */
  incomplete(): Array<{ no: string; section: string; selection: Selection; description: string }> {
    const out: Array<{ no: string; section: string; selection: Selection; description: string }> = []
    for (const list of this.root.tree()) {
      list.sections.forEach((sd, i) => {
        if (!sectionComplete(sd)) {
          out.push({ no: list.no, section: sd.name, selection: sd.selection, description: list.sectionDefs[i].description })
        }
      })
    }
    return out
  }

  /**
   * Writes the result into the order: every option's Amount and AmountMode, each
   * list's TotalMsrp/TotalDp, and the order totals. Refuses when a total
   * cannot be priced here, rather than write a wrong one.
   */
  commit(): void {
    this.handler.process() // the configurator runs the list again when the item is saved
    const problems: string[] = []
    for (const list of this.root.tree()) problems.push(...listTotals(list).problems)
    if (problems.length > 0) {
      throw new NeedsGpcError(`This change cannot be priced here: ${problems.join('; ')}. Make it in GPC.`)
    }
    for (const list of this.root.tree()) {
      for (const sd of list.sections) {
        for (const o of sd.options) {
          setText(o.el, 'Amount', String(o.amount))
          setText(o.el, 'AmountMode', o.mode)
        }
      }
      const t = listTotals(list)
      list.el.members = list.el.members.map((m) => {
        if (m.name === 'TotalMsrp') return { name: m.name, value: t.msrp ? { kind: 'text', type: null, value: formatDecimal(t.msrp) } : { kind: 'nil' } }
        if (m.name === 'TotalDp') return { name: m.name, value: t.dp ? { kind: 'text', type: null, value: formatDecimal(t.dp) } : { kind: 'nil' } }
        return m
      })
    }
    for (const [name, value] of Object.entries(orderTotals(this.order, this.catalog))) {
      if (member(this.order.root, name) !== null) setText(this.order.root, name, formatDecimal(value))
    }
  }
}

/** Replays every configured system in an order; the proof the engine agrees with the configurator. */
export function replayOrder(order: OrderDocument, config: ElementValue): ReplayDiff[] {
  const catalog = new EngineCatalog(config)
  const out: ReplayDiff[] = []
  for (const item of kids(sub(order.root, 'DependentListsData'))) {
    const no = text(item, 'No')
    if (no === null) continue
    out.push(...new SystemEditor(order, catalog, no).replayDiffs())
  }
  return out
}

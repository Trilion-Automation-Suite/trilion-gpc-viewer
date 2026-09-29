/**
 * Turning a list of articles into the configured system they describe.
 *
 * A sales order lists a system as parts — sensor base, sensor head,
 * controller, cable, measuring volume, stand, computer — and each part is a
 * catalog article in its own right. Pasted one by one they become a dozen loose
 * lines. GPC's own model for the same order is one configured system with
 * those parts as its options, priced and constrained by the system's rules.
 *
 * Which system is decided the way a salesperson decides it: by the **camera**
 * and the **base**. A 24M head on an adjustable base is an ARAMIS Adjustable;
 * an SRX head on a fixed camera frame is an ARAMIS SRX; an ARAMIS 1 is its own.
 * The catalog tags both sections — `A300_GOM_SENSORTYPE` for the sensor head
 * (and the camera section it implies), `A300_GOM_CAMERAFRAME` for an
 * adjustable base; the fixed systems carry their frames and basic units in
 * sections named for them — so the template is the one system whose option tree
 * holds both. Nothing else votes: a workstation or a stand is an option of two
 * dozen lists and says nothing about which one.
 *
 * The rest of the order is then placed into that system through its own rules
 * (`SystemEditor.place`), in catalog order, so the camera is chosen before the
 * volumes that depend on it. A line the rules already set — the in-system twin
 * of an article, a part implied by the camera — counts as placed. A line that
 * is not an option of the system stays a line of its own.
 */
import type { GpcContainer } from './container.ts'
import type { ElementValue, OrderDocument } from './orderXml.ts'
import type { EngineCatalog, Section } from './dependentListEngine.ts'
import { SystemEditor } from './dependentListEngine.ts'
import {
  addSubConfiguration,
  buildableItems,
  optionPricer,
  renumberSubConfigurations,
  startDependentList,
} from './dependentList.ts'

const SENSOR_TRAIT = 'A300_GOM_SENSORTYPE'
const FRAME_TRAIT = 'A300_GOM_CAMERAFRAME'
/** Fixed systems carry their base as frames or a basic unit, untagged. */
const FIXED_BASE_SECTION = /camera frame|basic unit/i

/** One article line of the order, as the block resolved it. */
export interface ArticleLine {
  /** Position in the block's items, so a report can point at it. */
  index: number
  /** The catalog LongName the line resolved to. */
  articleName: string
  /** The line's own SAP number and name, which may name the in-system twin's stand-alone article. */
  sapNr?: string
  name?: string
  amount: number
}

export interface SystemMatch {
  /** The configuration item to start, e.g. "ARAMIS Adjustable". */
  itemName: string
  listName: string
  /** The line that named the camera, and the one that named the base (null for a system with a built-in base). */
  camera: number
  base: number | null
  /** Every line that is an option of this system, in catalog section order. */
  members: number[]
}

interface Hit {
  section: number
  option: number
}

function optionMatches(catalog: EngineCatalog, optionName: string, line: ArticleLine): boolean {
  if (optionName === line.articleName || (line.name !== undefined && optionName === line.name)) return true
  return line.sapNr !== undefined && line.sapNr !== '' && catalog.sapOf(optionName) === line.sapNr
}

/** Every (section, option) in a list that a line can mean, best first: exact name before a SAP twin. */
function hitsIn(catalog: EngineCatalog, sections: Section[], line: ArticleLine): Hit[] {
  const exact: Hit[] = []
  const twin: Hit[] = []
  sections.forEach((sec, si) => {
    if (sec.isSubconfig) return
    sec.articles.forEach((a, oi) => {
      if (!optionMatches(catalog, a.longName, line)) return
      const byName = a.longName === line.articleName || a.longName === line.name
      ;(byName ? exact : twin).push({ section: si, option: oi })
    })
  })
  return [...exact, ...twin]
}

/**
 * Sections that name the camera: the sensor-type section, and a camera section
 * it implies — an ARAMIS Adjustable picks "ARAMIS Camera 24M - select" under
 * Sensor Head, which sets "ARAMIS Adjustable 24M" under Cameras. Only camera
 * sections count: a sensor type also implies its controller, cable and
 * computer, and a workstation says nothing about which system this is.
 */
const CAMERA_SECTION = /camera|sensor head/i

function cameraSections(sections: Section[], listName: string): Set<number> {
  const out = new Set<number>()
  sections.forEach((sec, si) => {
    if (!sec.traits.includes(SENSOR_TRAIT)) return
    out.add(si)
    for (const a of sec.articles) {
      for (const imp of a.implications) {
        if (imp.dlRef !== listName && imp.dlRef !== '') continue
        const target = sections.findIndex((s) => s.longName === imp.secRef)
        if (target >= 0 && CAMERA_SECTION.test(sections[target].longName) && !FIXED_BASE_SECTION.test(sections[target].longName)) {
          out.add(target)
        }
      }
    }
  })
  return out
}

function baseSections(sections: Section[]): Set<number> {
  const out = new Set<number>()
  sections.forEach((sec, si) => {
    if (sec.traits.includes(FRAME_TRAIT) || FIXED_BASE_SECTION.test(sec.longName)) out.add(si)
  })
  return out
}

/**
 * The systems a set of lines describes. A system is recognised only from a
 * camera line together with a base line — or from the camera alone when the
 * system has no base to choose. A line claimed by one system is not offered to
 * the next.
 */
export function findSystems(catalog: EngineCatalog, config: ElementValue, lines: ArticleLine[]): SystemMatch[] {
  const systems = buildableItems(config).filter((b) => b.group === 'System')
  const matches: SystemMatch[] = []
  const claimed = new Set<number>()

  for (const system of systems) {
    const item = catalog.configItems.get(system.name)
    if (!item) continue
    const listName = item.filter.slice(item.filter.lastIndexOf('>') + 1) || system.name
    let sections: Section[]
    try {
      sections = catalog.dependentList(listName)
    } catch {
      continue
    }
    const cams = cameraSections(sections, listName)
    const bases = baseSections(sections)
    if (cams.size === 0) continue

    const free = lines.filter((l) => !claimed.has(l.index))
    const camera = free.find((l) => hitsIn(catalog, sections, l).some((h) => cams.has(h.section)))
    if (!camera) continue
    const base = free.find((l) => l !== camera && hitsIn(catalog, sections, l).some((h) => bases.has(h.section)))
    // A system with base sections needs a base line to be recognised: a bare
    // camera could be a spare or an additional sensor.
    if (bases.size > 0 && !base) continue

    const members = free
      .map((l) => ({ l, hits: hitsIn(catalog, sections, l) }))
      .filter((x) => x.hits.length > 0)
      .sort((a, b) => a.hits[0].section - b.hits[0].section)
      .map((x) => x.l.index)
    for (const m of members) claimed.add(m)
    matches.push({ itemName: system.name, listName, camera: camera.index, base: base ? base.index : null, members })
  }
  return matches
}

export interface AssemblyResult {
  /** The new line's number in the order. */
  no: string
  itemName: string
  /** Block lines the system took, as options or as parts its rules set. */
  placed: number[]
  /** Block lines that are options of the system but the rules would not take. */
  refused: Array<{ index: number; reason: string }>
  /** Options the rules added that the order did not list — defaults, software, the in-system SMA. */
  addedByRules: string[]
  /** Sections the configurator will show as incomplete. */
  incomplete: string[]
  /**
   * Every option the finished system holds, its sub-configurations included,
   * by name. A line elsewhere in the order that names one of these is already
   * in the system — a licence the camera implies, the eLearning its Training
   * carries — and must not be added a second time.
   */
  contains: Set<string>
}

/**
 * Builds one matched system on the order and places its lines. Works on the
 * order it is given; the caller keeps a copy to fall back to.
 */
export function assembleSystem(
  order: OrderDocument,
  pdb: GpcContainer,
  catalog: EngineCatalog,
  match: SystemMatch,
  lines: ArticleLine[]
): AssemblyResult {
  const no = startDependentList(order, pdb, match.itemName)
  const editor = new SystemEditor(order, catalog, no, {
    pricer: optionPricer(order, pdb),
    buildSubconfig: (parent, itemName) => addSubConfiguration(order, pdb, parent, itemName),
    renumber: () => renumberSubConfigurations(order),
    fresh: true,
  })
  const sections = editor.root.sectionDefs
  const byIndex = new Map(lines.map((l) => [l.index, l]))

  // Several passes: an option is often only offered once an earlier pick has
  // been made, and the catalog order is a good guess but not a guarantee.
  const pending = new Set(match.members)
  const hitOf = new Map<number, Hit>()
  /** Lines the rules filled with a variant of the option rather than the option itself. */
  const variant = new Set<number>()
  /** Options the operator's side picked for a line, which the report must not call the rules' doing. */
  const pickedFor = new Set<string>()
  const snapshot = () => editor.root.sections.map((sec) => sec.options.map((o) => o.amount))
  for (let pass = 0; pass < 4 && pending.size > 0; pass++) {
    let progress = false
    for (const index of [...pending]) {
      const line = byIndex.get(index)!
      for (const hit of hitsIn(catalog, sections, line)) {
        const before = snapshot()
        if (editor.place(hit.section, hit.option, line.amount)) {
          pending.delete(index)
          hitOf.set(index, hit)
          if (editor.root.sections[hit.section].options[hit.option].amount < line.amount) variant.add(index)
          editor.root.sections.forEach((sec, si) => sec.options.forEach((o, oi) => {
            if (o.amount > 0 && before[si][oi] === 0 && o.mode === 'UserChoice') pickedFor.add(`${sec.name}\u0000${o.name}`)
          }))
          progress = true
          break
        }
      }
    }
    if (!progress) break
  }

  // A later pick can undo an earlier one — a second option in a pick-one
  // section — so what counts is what is set at the end.
  const placed: number[] = []
  const refused: AssemblyResult['refused'] = []
  for (const index of match.members) {
    const hit = hitOf.get(index)
    const line = byIndex.get(index)!
    const landed = hit ? editor.root.sections[hit.section] : null
    const held = hit && landed
      ? variant.has(index)
        ? landed.options.some((o) => o.amount > 0)
        : landed.options[hit.option].amount >= line.amount
      : false
    if (held) {
      placed.push(index)
      continue
    }
    const where = hitsIn(catalog, sections, line)[0]
    const section = where ? editor.root.sections[where.section].name : ''
    refused.push({
      index,
      reason: hit
        ? `a later pick in "${section}" replaced it`
        : `the rules of ${match.itemName} do not offer it here${section ? ` (section "${section}")` : ''}`,
    })
  }

  // What the order listed is known by where it landed, which for an in-system
  // twin is not the article's own name.
  const listed = new Set(pickedFor)
  for (const i of placed) {
    const hit = hitOf.get(i)!
    const sec = editor.root.sections[hit.section]
    listed.add(`${sec.name}\u0000${sec.options[hit.option].name}`)
    // A variant stands in for the line: whatever the section holds is the order's.
    if (variant.has(i)) for (const o of sec.options) if (o.amount > 0) listed.add(`${sec.name}\u0000${o.name}`)
  }
  // Only what costs something or is a line of its own is worth reporting:
  // selectors like "None -" and "New system" are how the rules keep state.
  const priced = new Set<string>()
  for (const l of editor.view()) {
    for (const sec of l.sections) {
      for (const o of sec.options) {
        if (sec.isSubconfig || (o.msrp !== null && o.msrp !== '0')) priced.add(`${l.no}\u0000${sec.name}\u0000${o.name}`)
      }
    }
  }
  const addedByRules = editor
    .changes()
    .filter((c) => c.to > 0 && !listed.has(`${c.section}\u0000${c.option}`) && priced.has(`${c.no}\u0000${c.section}\u0000${c.option}`))
    .map((c) => (c.no === no ? c.option : `${c.option} (${c.no})`))

  const incomplete = editor.incomplete().map((i) => `${i.no} ${i.section}`)
  const contains = new Set<string>()
  for (const l of editor.view()) {
    for (const sec of l.sections) for (const o of sec.options) if (o.amount > 0) contains.add(o.name)
  }
  editor.commit()
  return { no, itemName: match.itemName, placed, refused, addedByRules, incomplete, contains }
}

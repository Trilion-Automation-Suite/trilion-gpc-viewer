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
  /**
   * What GPC's defaults put in that the order does not list, taken out again:
   * a recommended touch probe, a Training sub-configuration, a tripod.
   */
  removedDefaults: string[]
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
  // The order decides what the system contains. GPC's defaults are a
  // salesperson's starting point — a probe to match the volume, Training, a
  // tripod to hold the calibration object — and an order that does not list
  // them did not sell them. So a priced default the order does not name is
  // taken out wherever its section offers a way out ("None -", or "I want a
  // different one!" and then "None -"); a default with no way out is part of
  // the system and stays. The same for a sub-configuration the rules added
  // that no line of the order belongs to.
  const removedDefaults = dropUnorderedDefaults(editor, catalog, listed, lines)

  // Only what costs something or is a line of its own is worth reporting:
  // selectors like "None -" and "New system" are how the rules keep state.
  const priced = new Set<string>()
  const childName = new Map<string, string>()
  for (const l of editor.view()) {
    childName.set(l.no, l.itemName)
    for (const sec of l.sections) {
      for (const o of sec.options) {
        if (sec.isSubconfig || (o.msrp !== null && o.msrp !== '0')) priced.add(`${l.no}\u0000${sec.name}\u0000${o.name}`)
      }
    }
  }
  // A line of the order that turned up inside a sub-configuration (an
  // eLearning inside Training) is the order's, not the rules'.
  const ordered = new Set<string>()
  for (const l of lines) {
    ordered.add(l.articleName)
    if (l.name) ordered.add(l.name)
  }
  const addedByRules = editor
    .changes()
    .filter((c) => c.to > 0 && !listed.has(`${c.section}\u0000${c.option}`) && !ordered.has(c.option) &&
      priced.has(`${c.no}\u0000${c.section}\u0000${c.option}`))
    // By sub-configuration name, not number: numbers move when one is removed.
    .map((c) => (c.no === no ? c.option : `${c.option} (in ${childName.get(c.no) ?? 'a sub-configuration'})`))

  const incomplete = editor.incomplete().map((i) => `${i.no} ${i.section}`)
  const contains = new Set<string>()
  for (const l of editor.view()) {
    for (const sec of l.sections) for (const o of sec.options) if (o.amount > 0) contains.add(o.name)
  }
  editor.commit()
  return { no, itemName: match.itemName, placed, refused, addedByRules, removedDefaults, incomplete, contains }
}

const WAY_OUT = /^none\b|different one/i
const NONE = /^none\b/i

function isPriced(msrp: string | null): boolean {
  return msrp !== null && msrp !== '' && msrp !== '0'
}

/** Takes out what GPC's defaults added and the order did not list. Returns what went. */
function dropUnorderedDefaults(
  editor: SystemEditor,
  catalog: EngineCatalog,
  listed: Set<string>,
  lines: ArticleLine[]
): string[] {
  const removed: string[] = []
  const root = editor.root
  const tryPick = (si: number, oi: number, amount: number): boolean => {
    try {
      editor.pick(si, oi, amount)
      return true
    } catch {
      return false
    }
  }

  // Sub-configurations the rules added: kept only when they hold a line of
  // the order (an eLearning inside Training).
  for (const name of [...editor.addedSubconfigs]) {
    const child = root.subconfigs.find((c) => c.itemName === name)
    if (!child || !('sectionDefs' in child)) continue
    // Kept only for a line of the order that it actually holds. GPC may list
    // an option and still not offer it — an ARAMIS 1's Training has the
    // CORRELATE eLearning, but only once CORRELATE Pro is on the system — and
    // a Training kept empty would sell a course nobody ordered while the
    // eLearning is added beside it anyway.
    let holds = false
    for (const line of lines) {
      for (const hit of hitsIn(catalog, child.sectionDefs, line)) {
        const opt = child.sections[hit.section].options[hit.option]
        if (opt.amount < line.amount) {
          try {
            editor.pick(hit.section, hit.option, line.amount, child)
          } catch {
            continue
          }
        }
        if (opt.amount >= line.amount) {
          holds = true
          break
        }
      }
    }
    if (holds) continue
    const si = root.sections.findIndex((sec, i) => root.sectionDefs[i].isSubconfig && sec.options[0]?.name === name)
    if (si < 0) continue
    const opt = root.sections[si].options[0]
    // A mandatory one — the in-system SMA — is set by the section itself and refuses.
    if (opt.mode === 'Implication' || opt.mode === 'SectionSpecialFunction') continue
    if (tryPick(si, 0, 0) && opt.amount === 0) removed.push(name)
  }

  // Priced defaults, then whatever section a "different one" opened.
  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    root.sections.forEach((sec, si) => {
      if (root.sectionDefs[si].isSubconfig || sec.isHidden) return
      for (const o of sec.options) {
        if (o.amount === 0 || listed.has(`${sec.name}\u0000${o.name}`)) continue
        if (o.mode !== 'Default') continue
        if (!isPriced(o.msrp)) continue
        const out = sec.options.findIndex((x) => x !== o && !x.isDisabled && WAY_OUT.test(x.name))
        if (out >= 0 && tryPick(si, out, 1)) {
          removed.push(o.name)
          changed = true
        }
      }
    })
    // A section left waiting for a pick the order never made — the probe list
    // "I want a different one!" opens — is answered with its "None".
    root.sections.forEach((sec, si) => {
      if (root.sectionDefs[si].isSubconfig || sec.isHidden) return
      if (sec.options.some((o) => o.amount > 0)) return
      if (sec.options.some((o) => listed.has(`${sec.name}\u0000${o.name}`))) return
      const none = sec.options.findIndex((x) => !x.isDisabled && NONE.test(x.name))
      if (none >= 0 && tryPick(si, none, 1)) changed = true
    })
    if (!changed) break
  }
  return removed
}

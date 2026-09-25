/**
 * Checks an order.xml against the member order GPC's own classes declare.
 *
 * .NET's XmlSerializer writes and reads a class as a *sequence*. An element
 * that names no member, or a declared member that arrives out of order, fails
 * the whole document — and GPC reports every such failure with one catch-all
 * message, "This file has no Order-Part". The artifacts cannot be used to infer
 * the order on their own: a member left null is simply absent, so a file can
 * look right until the first time someone fills in an address.
 *
 * So the order comes from the declarations, and this checks our output against
 * them before a person has to find out from GPC.
 */
import { CHILD_CLASS, ENUM_VALUES, MEMBER_ORDER } from './memberOrder.ts'

export interface OrderViolation {
  /** Element path, e.g. `OrderData/AccountDetailsData`. */
  path: string
  kind: 'unknown-member' | 'out-of-order' | 'bad-enum'
  element: string
  /** For `out-of-order`: the element it should have come before. */
  before?: string
  /** For `bad-enum`: the offending text and what the enum accepts. */
  value?: string
  allowed?: readonly string[]
}

interface Node {
  name: string
  /** Text content, when the element holds a simple value. */
  text?: string
  /** `xsi:type`, when the element declares which subclass it really is. */
  xsiType: string | null
  children: Node[]
}

/**
 * Minimal tree of element names. Enough for this check and far cheaper than a
 * DOM over a 38 MB order — attributes, text and namespaces are irrelevant here.
 */
function parseTree(xml: string): Node | null {
  const root: Node = { name: '#document', xsiType: null, children: [] }
  const stack: Node[] = [root]
  let lastEnd = 0
  const re = /<(\/?)([A-Za-z_][\w.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const [, close, name, attributes, selfClosing] = m
    if (close) {
      const finished = stack.length > 1 ? stack.pop() : null
      if (finished && finished.children.length === 0) {
        finished.text = xml.slice(lastEnd, m.index)
      }
      lastEnd = re.lastIndex
      continue
    }
    const node: Node = {
      name,
      xsiType: /\bxsi:type="([^"]+)"/.exec(attributes)?.[1] ?? null,
      children: [],
    }
    stack[stack.length - 1].children.push(node)
    if (!selfClosing) { stack.push(node); lastEnd = re.lastIndex }
  }
  return root.children[0] ?? null
}

/** Every way the produced XML departs from what the declarations allow. */
export function validateOrderXml(xml: string): OrderViolation[] {
  const tree = parseTree(xml.replace(/<\?[^?]*\?>/g, ''))
  if (!tree) return [{ path: '', kind: 'unknown-member', element: '(no root element)' }]

  const violations: OrderViolation[] = []

  function visit(node: Node, className: string, path: string): void {
    const order = MEMBER_ORDER[className]
    if (!order) return
    const kids = CHILD_CLASS[className] ?? {}
    let highest = -1
    let highestName = ''
    for (const child of node.children) {
      const index = order.indexOf(child.name)
      if (index < 0) {
        violations.push({ path, kind: 'unknown-member', element: child.name })
        continue
      }
      if (index < highest) {
        violations.push({ path, kind: 'out-of-order', element: child.name, before: highestName })
      } else {
        highest = index
        highestName = child.name
      }
      // An enum travels as its member name. A display label here is an
      // "Instance validation error" in .NET and the whole file fails to read —
      // which is not obvious from looking at the XML, since the text is a
      // perfectly reasonable-looking string.
      const allowed = ENUM_VALUES[`${className}.${child.name}`]
      if (allowed && child.text !== undefined) {
        const text = child.text.trim()
        if (text !== '' && !allowed.includes(text)) {
          violations.push({ path, kind: 'bad-enum', element: child.name, value: text, allowed })
        }
      }

      const declared = kids[child.name]
      if (!declared) continue
      const childPath = `${path}/${child.name}`
      if (declared.startsWith('[]')) {
        const itemClass = declared.slice(2)
        for (const item of child.children) {
          // A list's children are each named after the item type; anything else
          // is a member name in the wrong place.
          if (item.name !== itemClass) {
            violations.push({ path: childPath, kind: 'unknown-member', element: item.name })
            continue
          }
          // A list of an abstract type carries xsi:type to say which subclass
          // each item is, and the subclass adds its own members after the
          // base's. SubConfigurations is such a list.
          visit(item, item.xsiType ?? itemClass, `${childPath}/${item.name}`)
        }
      } else {
        visit(child, declared, childPath)
      }
    }
  }

  visit(tree, 'OrderData', 'OrderData')
  return violations
}

/** One line per violation, for a test failure message or a log. */
export function describeViolations(violations: OrderViolation[]): string {
  return violations
    .map((v) =>
      v.kind === 'unknown-member'
        ? `${v.path}: <${v.element}> names no member of the class`
        : v.kind === 'bad-enum'
          ? `${v.path}: <${v.element}> is ${JSON.stringify(v.value)}, which is not a value of its enum — it accepts ${v.allowed?.join(', ')}`
          : `${v.path}: <${v.element}> comes after <${v.before}>, which the declaration puts later`
    )
    .join('\n')
}

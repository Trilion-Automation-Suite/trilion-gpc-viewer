import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { SystemEditorModal } from '../SystemEditorModal.tsx'
import { SystemEditor } from '../../lib/gpc/dependentListEngine.ts'
import { text } from '../../lib/gpc/orderXml.ts'
import { config, savedRig } from '../../lib/gpc/__tests__/rigFixture.ts'

/**
 * The editor as an operator meets it: tick, untick, see what followed, apply.
 * Drives the real component in jsdom against the fictional rig catalog.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function control(name: string): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)
  if (!input) throw new Error(`no control for ${name}`)
  return input
}

function section(name: string): HTMLElement {
  const heading = [...host.querySelectorAll('.sysed-section h4')].find(h => h.textContent === name)
  if (!heading) throw new Error(`no section ${name}`)
  return heading.closest('section')!
}

function button(label: RegExp): HTMLButtonElement {
  const b = [...host.querySelectorAll('button')].find(x => label.test(x.textContent ?? ''))
  if (!b) throw new Error(`no button ${label}`)
  return b as HTMLButtonElement
}

describe('SystemEditorModal', () => {
  it('shows the cascade of a click, flags what it leaves incomplete, and applies it', () => {
    const doc = savedRig({ 'V400 medium': 1, 'V600 medium': 1, 'Probe A': 1 })
    const editor = new SystemEditor(doc, config(), '1')
    let applied: SystemEditor | null = null
    act(() => root.render(
      <SystemEditorModal editor={editor} onApply={e => { e.commit(); applied = e }} onCancel={() => {}} />
    ))

    expect(button(/^Apply/).disabled).toBe(true)
    // Implied options are shown ticked and cannot be changed by hand.
    expect(control('Frame M').checked).toBe(true)
    expect(control('Frame M').disabled).toBe(true)

    act(() => control('V400 medium').click())

    // Probe A needed V400; it is gone, and the pick-one section is flagged.
    expect(section('Probe').classList.contains('sysed-section--incomplete')).toBe(true)
    expect(host.textContent).toContain('GPC will show this section as incomplete: Probe.')
    expect(host.querySelector('.sysed-changes')?.textContent).toContain('Probe A')

    act(() => control('Probe B').click())
    expect(section('Probe').classList.contains('sysed-section--incomplete')).toBe(false)
    expect(button(/^Apply/).textContent).toBe('Apply 3 changes')

    act(() => button(/^Apply/).click())
    expect(applied).toBe(editor)
    expect(text(doc.root, 'Msrp')).toBe('1490') // 200 + 60 + 1200 + 30: one medium volume swapped a probe
  })

  it('says why a click is refused instead of silently ignoring it', () => {
    const editor = new SystemEditor(
      savedRig({ 'V100 small': 1, 'V400 medium': 1, 'V600 medium': 1, 'Probe A': 1 }), config(), '1')
    act(() => root.render(<SystemEditorModal editor={editor} onApply={() => {}} onCancel={() => {}} />))
    act(() => control('V900 large').click())
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/allows 1–3 and is full/)
    expect(control('V900 large').checked).toBe(false)
  })

  it('changes a quantity', () => {
    const doc = savedRig({ 'V400 medium': 1, 'Probe A': 1 })
    const editor = new SystemEditor(doc, config(), '1')
    act(() => root.render(<SystemEditorModal editor={editor} onApply={e => e.commit()} onCancel={() => {}} />))
    const qty = host.querySelector<HTMLInputElement>('input[aria-label="Quantity of Light"]')!
    act(() => {
      // React listens for the native value setter, not the property.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(qty, '4')
      qty.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(editor.changes().map(c => `${c.option} ${c.from}->${c.to}`)).toEqual(['Light 0->4'])
    act(() => button(/^Apply/).click())
    expect(text(doc.root, 'Msrp')).toBe('1530')
  })
})

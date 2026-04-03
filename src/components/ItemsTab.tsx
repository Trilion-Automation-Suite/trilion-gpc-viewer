import { useState, useCallback } from 'react'
import type { OrderSummary } from '../types/order.ts'
import { ConfigItemsTable } from './ConfigItemsTable.tsx'
import './ItemsTab.css'

interface ItemsTabProps {
  order: OrderSummary
}

export function ItemsTab({ order }: ItemsTabProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const expandableKeys = order.items
    .filter((i) => i.sections.length > 0)
    .map((i) => i.no + '-' + i.name)

  const allExpanded = expandableKeys.length > 0 && expandableKeys.every((k) => expanded.has(k))
  const anyExpanded = expanded.size > 0

  const toggleItem = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }, [])

  return (
    <div className="items-tab">
      <div className="items-toolbar">
        <button
          className="toolbar-pill-btn icon-only"
          onClick={() => setExpanded(new Set(expandableKeys))}
          disabled={allExpanded || expandableKeys.length === 0}
          title="Expand all"
          aria-label="Expand all"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
            <polyline points="6 15 12 21 18 15" />
          </svg>
        </button>
        <button
          className="toolbar-pill-btn icon-only"
          onClick={() => setExpanded(new Set())}
          disabled={!anyExpanded}
          title="Collapse all"
          aria-label="Collapse all"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 15 12 9 18 15" />
            <polyline points="6 9 12 3 18 9" />
          </svg>
        </button>
      </div>
      <ConfigItemsTable order={order} expanded={expanded} onToggle={toggleItem} />
    </div>
  )
}

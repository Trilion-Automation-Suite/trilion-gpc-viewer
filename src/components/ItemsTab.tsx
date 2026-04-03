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
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  return (
    <div className="items-tab">
      <div className="items-toolbar">
        <button
          className="toolbar-icon-btn"
          onClick={() => setExpanded(new Set(expandableKeys))}
          disabled={allExpanded || expandableKeys.length === 0}
          title="Expand all"
          aria-label="Expand all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="7 14 12 9 17 14" />
            <line x1="12" y1="20" x2="12" y2="9" />
            <polyline points="7 4 12 9 17 4" transform="rotate(180 12 6.5)" />
          </svg>
        </button>
        <button
          className="toolbar-icon-btn"
          onClick={() => setExpanded(new Set())}
          disabled={!anyExpanded}
          title="Collapse all"
          aria-label="Collapse all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="4" x2="12" y2="15" />
            <polyline points="7 20 12 15 17 20" transform="rotate(180 12 17.5)" />
          </svg>
        </button>
      </div>
      <ConfigItemsTable order={order} expanded={expanded} onToggle={toggleItem} />
    </div>
  )
}

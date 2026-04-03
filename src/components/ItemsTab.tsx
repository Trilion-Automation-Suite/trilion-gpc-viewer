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
          className="toolbar-pill-btn"
          onClick={() => setExpanded(new Set(expandableKeys))}
          disabled={allExpanded || expandableKeys.length === 0}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="21" y1="10" x2="7" y2="10" />
            <line x1="21" y1="6" x2="3" y2="6" />
            <line x1="21" y1="14" x2="3" y2="14" />
            <line x1="21" y1="18" x2="7" y2="18" />
            <polyline points="3 10 7 6 3 6" />
          </svg>
          Expand all
        </button>
        <button
          className="toolbar-pill-btn"
          onClick={() => setExpanded(new Set())}
          disabled={!anyExpanded}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="21" y1="10" x2="7" y2="10" />
            <line x1="21" y1="6" x2="3" y2="6" />
            <line x1="21" y1="14" x2="3" y2="14" />
            <line x1="21" y1="18" x2="7" y2="18" />
            <polyline points="7 6 3 10 7 10" />
          </svg>
          Collapse all
        </button>
      </div>
      <ConfigItemsTable order={order} expanded={expanded} onToggle={toggleItem} />
    </div>
  )
}

import { useState, useCallback } from 'react'
import type { OrderSummary } from '../types/order.ts'
import { InfoGrid } from './InfoGrid.tsx'
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

  const toggleItem = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  const expandAll = () => setExpanded(new Set(expandableKeys))
  const collapseAll = () => setExpanded(new Set())

  const creationDateShort = order.creationDate ? order.creationDate.split('T')[0] : ''

  return (
    <div className="items-tab">
      <InfoGrid
        fields={[
          { label: 'Order #', value: order.orderNumber },
          { label: 'Opportunity ID', value: order.opportunityId },
          { label: 'Case ID', value: order.caseId },
          { label: 'Order Date', value: order.orderDate },
          { label: 'Created', value: creationDateShort },
          { label: 'Type', value: order.contractType },
          { label: 'Status', value: order.orderStatus },
          { label: 'HOM Center', value: order.homCenter },
          { label: 'Price List', value: order.priceList },
          { label: 'Distributor', value: order.distributor },
          { label: 'Destination', value: order.destination },
          { label: 'Currency', value: order.currency },
          { label: 'Created by', value: order.username },
        ]}
      />
      <div className="items-toolbar">
        <button
          className="toolbar-btn"
          onClick={expandAll}
          disabled={allExpanded || expandableKeys.length === 0}
        >
          Expand all
        </button>
        <button
          className="toolbar-btn"
          onClick={collapseAll}
          disabled={expanded.size === 0}
        >
          Collapse all
        </button>
      </div>
      <ConfigItemsTable order={order} expanded={expanded} onToggle={toggleItem} />
    </div>
  )
}

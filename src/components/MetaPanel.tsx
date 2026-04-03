import { useState } from 'react'
import type { OrderSummary } from '../types/order.ts'
import './MetaPanel.css'

interface MetaPanelProps {
  order: OrderSummary
}

interface MetaField {
  label: string
  value: string | null | undefined
}

export function MetaPanel({ order }: MetaPanelProps) {
  const [open, setOpen] = useState(true)

  const fields: MetaField[] = [
    { label: 'Order #', value: order.orderNumber },
    { label: 'Case ID', value: order.caseId },
    { label: 'Opportunity ID', value: order.opportunityId },
    { label: 'Distributor', value: order.distributor },
    { label: 'HOM Center', value: order.homCenter },
    { label: 'Price List', value: order.priceList },
    { label: 'Destination', value: order.destination },
    { label: 'Created by', value: order.username },
    { label: 'Order date', value: order.orderDate },
    { label: 'Currency', value: order.currency },
  ]

  const visible = fields.filter((f) => f.value && f.value.trim() !== '')

  return (
    <div className="meta-panel">
      <button
        className="meta-panel-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="meta-panel-body"
      >
        <h2>Order Details</h2>
        <span className={`meta-panel-toggle${open ? ' open' : ''}`}>
          {open ? 'Hide' : 'Show'}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="meta-panel-body" id="meta-panel-body">
          <dl className="meta-grid">
            {visible.map((field) => (
              <div className="meta-row" key={field.label}>
                <dt className="meta-label">{field.label}</dt>
                <dd className="meta-value">{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

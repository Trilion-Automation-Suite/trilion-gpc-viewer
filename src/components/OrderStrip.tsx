import type { OrderSummary } from '../types/order.ts'
import './OrderStrip.css'

interface OrderStripProps {
  order: OrderSummary
}

interface StripField {
  label: string
  value: string
  always?: boolean
}

export function OrderStrip({ order }: OrderStripProps) {
  const fields: StripField[] = [
    { label: 'Order #', value: order.orderNumber || '—', always: true },
    { label: 'Opportunity ID', value: order.opportunityId || '—', always: true },
    { label: 'Case ID', value: order.caseId || '—', always: true },
    { label: 'Type', value: order.contractType },
    { label: 'Order Date', value: order.orderDate },
    { label: 'Status', value: order.orderStatus !== 'Editing' ? order.orderStatus : '' },
  ]

  const visible = fields.filter((f) => f.always || (f.value && f.value.trim() !== ''))

  return (
    <div className="order-strip">
      {visible.map((f) => (
        <div key={f.label} className="order-strip-card">
          <span className="order-strip-label">{f.label}</span>
          <span className="order-strip-value">{f.value}</span>
        </div>
      ))}
    </div>
  )
}

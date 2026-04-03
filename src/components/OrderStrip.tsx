import type { OrderSummary } from '../types/order.ts'
import './OrderStrip.css'

interface OrderStripProps {
  order: OrderSummary
  isEditing?: boolean
  onChange?: (patch: Pick<OrderSummary, 'orderNumber' | 'caseId' | 'opportunityId'>) => void
}

export function OrderStrip({ order, isEditing, onChange }: OrderStripProps) {
  const fields: { label: string; value: string; always?: boolean }[] = [
    { label: 'Order #',        value: order.orderNumber  || '—', always: true },
    { label: 'Opportunity ID', value: order.opportunityId || '—', always: true },
    { label: 'Case ID',        value: order.caseId        || '—', always: true },
    { label: 'Partner',        value: order.distributor },
    { label: 'Order Date',     value: order.orderDate },
    { label: 'Type',           value: order.contractType },
    { label: 'Status',         value: order.orderStatus !== 'Editing' ? order.orderStatus : '' },
  ]

  const visible = fields.filter((f) => f.always || (f.value && f.value.trim() !== ''))

  const emitHeaderChange = (key: 'orderNumber' | 'caseId' | 'opportunityId', val: string) => {
    if (!onChange) return
    const n = order.orderNumber, c = order.caseId, o = order.opportunityId
    if      (key === 'orderNumber')   onChange({ orderNumber: val, caseId: c, opportunityId: o })
    else if (key === 'caseId')        onChange({ orderNumber: n, caseId: val, opportunityId: o })
    else                              onChange({ orderNumber: n, caseId: c, opportunityId: val })
  }

  return (
    <div className={`order-strip${isEditing ? ' order-strip--editing' : ''}`}>
      {visible.map((f) => {
        const editKey =
          isEditing && f.label === 'Order #'        ? 'orderNumber'   :
          isEditing && f.label === 'Case ID'         ? 'caseId'        :
          isEditing && f.label === 'Opportunity ID'  ? 'opportunityId' :
          null

        return (
          <div
            key={f.label}
            className={`order-strip-card${editKey ? ' order-strip-card--editable' : ''}`}
          >
            <span className="order-strip-label">{f.label}</span>
            {editKey ? (
              <input
                className="order-strip-input"
                type="text"
                value={editKey === 'orderNumber'   ? order.orderNumber   :
                       editKey === 'caseId'         ? order.caseId        :
                                                      order.opportunityId}
                placeholder="—"
                aria-label={f.label}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => emitHeaderChange(editKey, e.target.value)}
              />
            ) : (
              <span className="order-strip-value">{f.value}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

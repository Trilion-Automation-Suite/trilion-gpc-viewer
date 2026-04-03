import type { OrderSummary } from '../types/order.ts'
import './CommentsTab.css'

interface CommentsTabProps {
  comments: OrderSummary['comments']
  isEditing?: boolean
  onChange?: (v: string) => void
}

export function CommentsTab({ comments, isEditing, onChange }: CommentsTabProps) {
  if (isEditing && onChange) {
    return (
      <div className="tab-panel">
        <section className="info-section">
          <h3 className="info-section-title">Comments</h3>
          <textarea
            className="comments-textarea"
            value={comments}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            rows={8}
          />
        </section>
      </div>
    )
  }

  return (
    <div className="tab-panel">
      <section className="info-section">
        <h3 className="info-section-title">Comments</h3>
        {comments ? (
          <p className="comments-text">{comments}</p>
        ) : (
          <p className="comments-empty">No comments.</p>
        )}
      </section>
    </div>
  )
}

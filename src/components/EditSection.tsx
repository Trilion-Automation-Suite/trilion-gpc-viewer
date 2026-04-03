/**
 * EditSection — mirrors InfoGrid visually but renders labelled inputs.
 * Used in place of InfoGrid when the tab panel is in edit mode.
 */

import './EditSection.css'

export type EditField =
  | {
      label: string
      value: string
      onChange: (v: string) => void
      type?: 'text' | 'email' | 'tel' | 'url'
    }
  | {
      label: string
      value: boolean
      onChange: (v: boolean) => void
      type: 'checkbox'
    }
  | {
      label: string
      value: string
      onChange: (v: string) => void
      type: 'radio'
      options: readonly string[]
    }

interface EditSectionProps {
  title?: string
  fields: EditField[]
}

export function EditSection({ title, fields }: EditSectionProps) {
  return (
    <section className="info-section">
      {title && <h3 className="info-section-title">{title}</h3>}
      <div className="edit-grid">
        {fields.map((f) =>
          f.type === 'checkbox' ? (
            <div key={f.label} className="edit-row edit-row--bool">
              <span className="edit-label">{f.label}</span>
              <input
                id={`ef-${f.label}`}
                type="checkbox"
                checked={f.value}
                onChange={(e) => f.onChange(e.target.checked)}
                className="edit-checkbox"
                aria-label={f.label}
              />
            </div>
          ) : f.type === 'radio' ? (
            <div key={f.label} className="edit-row edit-row--radio">
              <span className="edit-label">{f.label}</span>
              <div className="edit-radio-group">
                {f.options.map((opt) => (
                  <label key={opt} className="edit-radio-item">
                    <input
                      type="radio"
                      name={`ef-${f.label}`}
                      value={opt}
                      checked={f.value === opt}
                      onChange={() => f.onChange(opt)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div key={f.label} className="edit-row">
              <label className="edit-label" htmlFor={`ef-${f.label}`}>
                {f.label}
              </label>
              <input
                id={`ef-${f.label}`}
                type={f.type ?? 'text'}
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                className="edit-input"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )
        )}
      </div>
    </section>
  )
}

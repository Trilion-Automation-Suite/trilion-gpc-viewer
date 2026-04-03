import './InfoGrid.css'

export interface InfoField {
  label: string
  value: string | boolean | null | undefined
}

export function formatPhone(countryCode: string, prefix: string, direct: string): string {
  return [countryCode, prefix, direct].filter((p) => p?.trim()).join(' ')
}

export function InfoGrid({ fields, title }: { fields: InfoField[]; title?: string }) {
  const visible = fields.filter((f) => {
    if (f.value === null || f.value === undefined) return false
    if (typeof f.value === 'string') return f.value.trim() !== ''
    return true
  })

  return (
    <section className="info-section">
      {title && <h3 className="info-section-title">{title}</h3>}
      {visible.length === 0 ? (
        <p className="info-empty">No information on file.</p>
      ) : (
        <dl className="info-grid">
          {visible.map((f) => (
            <div key={f.label} className="info-row">
              <dt className="info-label">{f.label}</dt>
              <dd className="info-value">
                {typeof f.value === 'boolean' ? (f.value ? 'Yes' : 'No') : f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

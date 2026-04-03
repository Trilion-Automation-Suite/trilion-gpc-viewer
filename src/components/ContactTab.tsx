import type { TechnicalContact } from '../types/order.ts'
import { InfoGrid, formatPhone } from './InfoGrid.tsx'
import { EditSection } from './EditSection.tsx'

interface ContactTabProps {
  contact: TechnicalContact
  isEditing?: boolean
  onChange?: (patch: Partial<TechnicalContact>) => void
}

export function ContactTab({ contact, isEditing, onChange }: ContactTabProps) {
  const ch = <K extends keyof TechnicalContact>(key: K) => (val: TechnicalContact[K]) =>
    onChange?.({ [key]: val } as Partial<TechnicalContact>)

  if (isEditing && onChange) {
    return (
      <div className="tab-panel">
        <EditSection
          title="Identity"
          fields={[
            { label: 'Title',           value: contact.title,          onChange: ch('title') },
            { label: 'Academic Degree', value: contact.academicDegree, onChange: ch('academicDegree') },
            { label: 'First Name',      value: contact.firstName,      onChange: ch('firstName') },
            { label: 'Last Name',       value: contact.lastName,       onChange: ch('lastName') },
            { label: 'Gender',          value: contact.gender,         onChange: ch('gender') },
            { label: 'Position',        value: contact.position,       onChange: ch('position') },
            { label: 'Department',      value: contact.department,     onChange: ch('department') },
            { label: 'Source',          value: contact.source,         onChange: ch('source') },
          ]}
        />
        <EditSection
          title="Contact"
          fields={[
            { label: 'Email',                   value: contact.email,                      onChange: ch('email'),                      type: 'email' },
            { label: 'Additional Email',         value: contact.additionalEmail,            onChange: ch('additionalEmail'),            type: 'email' },
            { label: 'Business Country Code',    value: contact.businessPhoneCountryCode,   onChange: ch('businessPhoneCountryCode'),   type: 'tel' },
            { label: 'Business Prefix',          value: contact.businessPhonePrefix,        onChange: ch('businessPhonePrefix'),        type: 'tel' },
            { label: 'Business Phone',           value: contact.businessPhone,              onChange: ch('businessPhone'),              type: 'tel' },
            { label: 'Mobile Country Code',      value: contact.mobilePhoneCountryCode,     onChange: ch('mobilePhoneCountryCode'),     type: 'tel' },
            { label: 'Mobile Prefix',            value: contact.mobilePhonePrefix,          onChange: ch('mobilePhonePrefix'),          type: 'tel' },
            { label: 'Mobile Phone',             value: contact.mobilePhone,                onChange: ch('mobilePhone'),                type: 'tel' },
            { label: 'Additional Country Code',  value: contact.additionalPhoneCountryCode, onChange: ch('additionalPhoneCountryCode'), type: 'tel' },
            { label: 'Additional Prefix',        value: contact.additionalPhonePrefix,      onChange: ch('additionalPhonePrefix'),      type: 'tel' },
            { label: 'Additional Phone',         value: contact.additionalPhone,            onChange: ch('additionalPhone'),            type: 'tel' },
          ]}
        />
      </div>
    )
  }

  const fullName = [contact.title, contact.academicDegree, contact.firstName, contact.lastName]
    .filter(Boolean).join(' ')
  const businessPhone = formatPhone(contact.businessPhoneCountryCode, contact.businessPhonePrefix, contact.businessPhone)
  const mobilePhone = formatPhone(contact.mobilePhoneCountryCode, contact.mobilePhonePrefix, contact.mobilePhone)
  const additionalPhone = formatPhone(contact.additionalPhoneCountryCode, contact.additionalPhonePrefix, contact.additionalPhone)

  return (
    <div className="tab-panel">
      <InfoGrid
        title="Identity"
        fields={[
          { label: 'Name', value: fullName },
          { label: 'Gender', value: contact.gender },
          { label: 'Position', value: contact.position },
          { label: 'Department', value: contact.department },
          { label: 'Source', value: contact.source },
        ]}
      />
      <InfoGrid
        title="Contact"
        fields={[
          { label: 'Email', value: contact.email },
          { label: 'Additional Email', value: contact.additionalEmail },
          { label: 'Business Phone', value: businessPhone },
          { label: 'Mobile Phone', value: mobilePhone },
          { label: 'Additional Phone', value: additionalPhone },
        ]}
      />
    </div>
  )
}

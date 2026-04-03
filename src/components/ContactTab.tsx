import type { TechnicalContact } from '../types/order.ts'
import { InfoGrid, formatPhone } from './InfoGrid.tsx'

interface ContactTabProps {
  contact: TechnicalContact
}

export function ContactTab({ contact }: ContactTabProps) {
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

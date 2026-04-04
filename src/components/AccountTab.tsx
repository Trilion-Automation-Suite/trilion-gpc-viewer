import type { AccountDetails } from '../types/order.ts'
import { InfoGrid, formatPhone } from './InfoGrid.tsx'
import { EditSection } from './EditSection.tsx'
import { COUNTRIES } from '../lib/countries.ts'

interface AccountTabProps {
  account: AccountDetails
  isEditing?: boolean
  onChange?: (patch: Partial<AccountDetails>) => void
}

export function AccountTab({ account, isEditing, onChange }: AccountTabProps) {
  const ch = <K extends keyof AccountDetails>(key: K) => (val: AccountDetails[K]) =>
    onChange?.({ [key]: val } as Partial<AccountDetails>)

  const handleGomPartner = (v: boolean) =>
    onChange?.({ isGomPartner: v, ...(v ? { accountNumber: '2104995' } : {}) })

  if (isEditing && onChange) {
    return (
      <div className="tab-panel">
        <EditSection
          title="Company"
          fields={[
            { label: 'GOM Partner',    value: account.isGomPartner,  onChange: handleGomPartner,   type: 'checkbox' },
            { label: 'Company Name',   value: account.companyName,   onChange: ch('companyName') },
            { label: 'Company Name 2', value: account.companyNameTwo, onChange: ch('companyNameTwo') },
            { label: 'Company Type',   value: account.companyType,   onChange: ch('companyType') },
            { label: 'Department',     value: account.department,    onChange: ch('department') },
            { label: 'Department 2',   value: account.departmentTwo, onChange: ch('departmentTwo') },
            { label: 'Reference',      value: account.reference,     onChange: ch('reference') },
            { label: 'Is Distributor', value: account.isDistributor, onChange: ch('isDistributor'), type: 'checkbox' },
            { label: 'New Customer',   value: account.isNewCustomer, onChange: ch('isNewCustomer'), type: 'checkbox' },
          ]}
        />
        <EditSection
          title="Address"
          fields={[
            { label: 'Street',          value: account.street,         onChange: ch('street') },
            { label: 'Street 2',        value: account.streetTwo,      onChange: ch('streetTwo') },
            { label: 'Street 3',        value: account.streetThree,    onChange: ch('streetThree') },
            { label: 'P.O. Box',        value: account.hpcPoBox,       onChange: ch('hpcPoBox') },
            { label: 'City',            value: account.city,           onChange: ch('city') },
            { label: 'State/Province',  value: account.stateProvince,  onChange: ch('stateProvince') },
            { label: 'ZIP/Postal Code', value: account.zipPostalCode,  onChange: ch('zipPostalCode') },
            { label: 'Country',         value: account.country,        onChange: ch('country'),        type: 'select', options: COUNTRIES },
          ]}
        />
        <EditSection
          title="Contact"
          fields={[
            { label: 'Country Code', value: account.phoneCountryCode, onChange: ch('phoneCountryCode'), type: 'tel' },
            { label: 'Phone Prefix', value: account.phonePrefix,      onChange: ch('phonePrefix'),      type: 'tel' },
            { label: 'Phone',        value: account.phone,            onChange: ch('phone'),            type: 'tel' },
            { label: 'Email',        value: account.email,            onChange: ch('email'),            type: 'email' },
            { label: 'Website',      value: account.website,          onChange: ch('website'),          type: 'url' },
          ]}
        />
        <EditSection
          title="Identifiers"
          fields={[
            { label: 'Account Number',     value: account.accountNumber,   onChange: ch('accountNumber') },
            { label: 'Customer ID at GOM', value: account.customerIdAtGom, onChange: ch('customerIdAtGom') },
            { label: 'VAT ID',             value: account.vatId,           onChange: ch('vatId') },
          ]}
        />
      </div>
    )
  }

  const phone = formatPhone(account.phoneCountryCode, account.phonePrefix, account.phone)

  const addressParts = [
    account.street,
    account.streetTwo,
    account.streetThree,
    account.hpcPoBox ? `P.O. Box ${account.hpcPoBox}` : '',
    [account.city, account.stateProvince, account.zipPostalCode].filter(Boolean).join(', '),
    account.country,
  ].filter(Boolean).join(' · ')

  return (
    <div className="tab-panel">
      <InfoGrid
        title="Company"
        fields={[
          { label: 'Company Name', value: account.companyName },
          { label: 'Company Name 2', value: account.companyNameTwo },
          { label: 'Company Type', value: account.companyType },
          { label: 'Department', value: account.department },
          { label: 'Department 2', value: account.departmentTwo },
          { label: 'Reference', value: account.reference },
          { label: 'GOM Partner', value: account.isGomPartner || null },
          { label: 'Is Distributor', value: account.isDistributor || null },
          { label: 'New Customer', value: account.isNewCustomer || null },
        ]}
      />
      <InfoGrid
        title="Address"
        fields={[
          { label: 'Address', value: addressParts },
        ]}
      />
      <InfoGrid
        title="Contact"
        fields={[
          { label: 'Phone', value: phone },
          { label: 'Email', value: account.email },
          { label: 'Website', value: account.website },
        ]}
      />
      <InfoGrid
        title="Identifiers"
        fields={[
          { label: 'Account Number', value: account.accountNumber },
          { label: 'Customer ID at GOM', value: account.customerIdAtGom },
          { label: 'VAT ID', value: account.vatId },
        ]}
      />
    </div>
  )
}

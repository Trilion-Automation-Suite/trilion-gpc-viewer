import type { OrderAdministration } from '../types/order.ts'
import { InfoGrid } from './InfoGrid.tsx'
import { EditSection } from './EditSection.tsx'

interface AdminTabProps {
  admin: OrderAdministration
  isEditing?: boolean
  onChange?: (patch: Partial<OrderAdministration>) => void
}

const ADDRESS_TYPES = ['Customer', 'GOM Partner', 'Order Process Center', 'Other Address'] as const

function formatAddress(street: string, streetTwo: string, streetThree: string, poBox: string, city: string, state: string, zip: string, country: string): string {
  return [
    street,
    streetTwo,
    streetThree,
    poBox ? `P.O. Box ${poBox}` : '',
    [city, state, zip].filter(Boolean).join(', '),
    country,
  ].filter(Boolean).join(' · ')
}

export function AdminTab({ admin, isEditing, onChange }: AdminTabProps) {
  const ch = <K extends keyof OrderAdministration>(key: K) => (val: OrderAdministration[K]) =>
    onChange?.({ [key]: val } as Partial<OrderAdministration>)

  if (isEditing && onChange) {
    return (
      <div className="tab-panel">
        <EditSection
          title="Invoice"
          fields={[
            { label: 'Address Type', value: admin.invoiceAddressType, onChange: ch('invoiceAddressType'), type: 'radio' as const, options: ADDRESS_TYPES },
            { label: 'Account Number', value: admin.invoiceAccountNumber,  onChange: ch('invoiceAccountNumber') },
            { label: 'Company',        value: admin.invoiceCompanyName,    onChange: ch('invoiceCompanyName') },
            { label: 'Company 2',      value: admin.invoiceCompanyNameTwo, onChange: ch('invoiceCompanyNameTwo') },
            { label: 'Department',     value: admin.invoiceDepartment,     onChange: ch('invoiceDepartment') },
            { label: 'Department 2',   value: admin.invoiceDepartmentTwo,  onChange: ch('invoiceDepartmentTwo') },
            { label: 'Street',         value: admin.invoiceStreet,         onChange: ch('invoiceStreet') },
            { label: 'Street 2',       value: admin.invoiceStreetTwo,      onChange: ch('invoiceStreetTwo') },
            { label: 'Street 3',       value: admin.invoiceStreetThree,    onChange: ch('invoiceStreetThree') },
            { label: 'P.O. Box',       value: admin.invoiceHpcPoBox,       onChange: ch('invoiceHpcPoBox') },
            { label: 'City',           value: admin.invoiceCity,           onChange: ch('invoiceCity') },
            { label: 'State',          value: admin.invoiceState,          onChange: ch('invoiceState') },
            { label: 'ZIP',            value: admin.invoiceZip,            onChange: ch('invoiceZip') },
            { label: 'Country',        value: admin.invoiceCountry,        onChange: ch('invoiceCountry') },
            { label: 'Payment Term',   value: admin.invoicePaymentTerm,    onChange: ch('invoicePaymentTerm') },
            { label: 'New Customer',   value: admin.invoiceNewCustomer,    onChange: ch('invoiceNewCustomer'),   type: 'checkbox' },
          ]}
        />
        <EditSection
          title="Shipping"
          fields={[
            { label: 'Address Type', value: admin.shippingAddressType, onChange: ch('shippingAddressType'), type: 'radio' as const, options: ADDRESS_TYPES },
            { label: 'Account Number',        value: admin.shippingAccountNumber,       onChange: ch('shippingAccountNumber') },
            { label: 'Company',              value: admin.shippingCompanyName,         onChange: ch('shippingCompanyName') },
            { label: 'Company 2',            value: admin.shippingCompanyNameTwo,      onChange: ch('shippingCompanyNameTwo') },
            { label: 'Department',           value: admin.shippingDepartment,          onChange: ch('shippingDepartment') },
            { label: 'Department 2',         value: admin.shippingDepartmentTwo,       onChange: ch('shippingDepartmentTwo') },
            { label: 'Contact Person',       value: admin.shippingContactPerson,       onChange: ch('shippingContactPerson') },
            { label: 'Street',               value: admin.shippingStreet,              onChange: ch('shippingStreet') },
            { label: 'Street 2',             value: admin.shippingStreetTwo,           onChange: ch('shippingStreetTwo') },
            { label: 'Street 3',             value: admin.shippingStreetThree,         onChange: ch('shippingStreetThree') },
            { label: 'P.O. Box',             value: admin.shippingHpcPoBox,            onChange: ch('shippingHpcPoBox') },
            { label: 'City',                 value: admin.shippingCity,                onChange: ch('shippingCity') },
            { label: 'State',                value: admin.shippingState,               onChange: ch('shippingState') },
            { label: 'ZIP',                  value: admin.shippingZip,                 onChange: ch('shippingZip') },
            { label: 'Country',              value: admin.shippingCountry,             onChange: ch('shippingCountry') },
            { label: 'Freight Term',         value: admin.shippingFreightTerm,         onChange: ch('shippingFreightTerm') },
            { label: 'Shipping Method',      value: admin.shippingMethod,              onChange: ch('shippingMethod') },
            { label: 'Special Instructions', value: admin.specialShippingInstructions, onChange: ch('specialShippingInstructions') },
            { label: 'New Customer',         value: admin.shippingNewCustomer,         onChange: ch('shippingNewCustomer'),         type: 'checkbox' },
          ]}
        />
      </div>
    )
  }

  const invoiceAddress = formatAddress(
    admin.invoiceStreet, admin.invoiceStreetTwo, admin.invoiceStreetThree,
    admin.invoiceHpcPoBox, admin.invoiceCity, admin.invoiceState, admin.invoiceZip, admin.invoiceCountry
  )
  const shippingAddress = formatAddress(
    admin.shippingStreet, admin.shippingStreetTwo, admin.shippingStreetThree,
    admin.shippingHpcPoBox, admin.shippingCity, admin.shippingState, admin.shippingZip, admin.shippingCountry
  )

  return (
    <div className="tab-panel">
      <InfoGrid
        title="Invoice"
        fields={[
          { label: 'Address Type', value: admin.invoiceAddressType },
          { label: 'Account Number', value: admin.invoiceAccountNumber },
          { label: 'Company', value: admin.invoiceCompanyName },
          { label: 'Company 2', value: admin.invoiceCompanyNameTwo },
          { label: 'Department', value: admin.invoiceDepartment },
          { label: 'Department 2', value: admin.invoiceDepartmentTwo },
          { label: 'Address', value: invoiceAddress },
          { label: 'Payment Term', value: admin.invoicePaymentTerm },
          { label: 'New Customer', value: admin.invoiceNewCustomer || null },
        ]}
      />
      <InfoGrid
        title="Shipping"
        fields={[
          { label: 'Address Type', value: admin.shippingAddressType },
          { label: 'Account Number', value: admin.shippingAccountNumber },
          { label: 'Company', value: admin.shippingCompanyName },
          { label: 'Company 2', value: admin.shippingCompanyNameTwo },
          { label: 'Department', value: admin.shippingDepartment },
          { label: 'Department 2', value: admin.shippingDepartmentTwo },
          { label: 'Contact Person', value: admin.shippingContactPerson },
          { label: 'Address', value: shippingAddress },
          { label: 'Shipping Method', value: admin.shippingMethod },
          { label: 'Freight Term', value: admin.shippingFreightTerm },
          { label: 'Special Instructions', value: admin.specialShippingInstructions },
          { label: 'New Customer', value: admin.shippingNewCustomer || null },
        ]}
      />
    </div>
  )
}

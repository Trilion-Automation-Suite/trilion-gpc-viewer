import type { OrderAdministration } from '../types/order.ts'
import { InfoGrid } from './InfoGrid.tsx'

interface AdminTabProps {
  admin: OrderAdministration
}

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

export function AdminTab({ admin }: AdminTabProps) {
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

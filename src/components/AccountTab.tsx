import type { AccountDetails } from '../types/order.ts'
import { InfoGrid, formatPhone } from './InfoGrid.tsx'

interface AccountTabProps {
  account: AccountDetails
}

export function AccountTab({ account }: AccountTabProps) {
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

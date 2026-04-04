/**
 * Creates a minimal blank order.xml string pre-filled with Trilion defaults.
 * Used when the user clicks "New Order".
 *
 * Defaults:
 *   - Distributor: 2104995 (GOM Partner ID)
 *   - PriceList: Partner
 *   - Currency: USD
 *   - Country: United States of America
 *   - InvoiceAddressType: GOM Partner
 *   - ShippingAddressType: GOM Partner
 *   - ShippingMethod: Air
 *   - ShippingFreightTerm: FCA
 *   - InvoicePaymentTerm: 90 days without deduction
 */
export function createBlankOrderXml(): string {
  const now = new Date().toISOString()
  return `<?xml version="1.0" encoding="utf-8"?>
<OrderData xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <DependentListsData />
  <FreeArticlesData />
  <FreeListArticlesData />
  <SupportArticlesData />
  <AccountDetailsData>
    <Country>United States of America</Country>
    <IsGomPartner>true</IsGomPartner>
    <IsDistributor>false</IsDistributor>
    <IsNewCustomer>false</IsNewCustomer>
    <AccountNumber>2104995</AccountNumber>
  </AccountDetailsData>
  <AttachedFiles />
  <CleanOrder>false</CleanOrder>
  <ContractType>Purchase</ContractType>
  <CreationDate>${now}</CreationDate>
  <Currency>
    <Iso>USD</Iso>
    <Display>USD</Display>
    <Description>US Dollar</Description>
    <ExchangeRate>1</ExchangeRate>
  </Currency>
  <DestinationNew>
    <Country>United States of America</Country>
    <CountryCode>+1</CountryCode>
    <Iso>US</Iso>
    <PriceFactor>1</PriceFactor>
    <ExportControl>false</ExportControl>
  </DestinationNew>
  <DiscountForCustomer>0</DiscountForCustomer>
  <Distributor>2104995</Distributor>
  <FinalPriceForEndCustomer>0</FinalPriceForEndCustomer>
  <LocalTechnicalContact>
    <IsOtherDepartment>false</IsOtherDepartment>
    <IsOtherPosition>false</IsOtherPosition>
    <IsOtherSource>false</IsOtherSource>
  </LocalTechnicalContact>
  <Msrp>0</Msrp>
  <Dp>0</Dp>
  <OrderAdministration>
    <InvoiceAddressType>GOM Partner</InvoiceAddressType>
    <InvoiceNewCustomer>false</InvoiceNewCustomer>
    <InvoicePaymentTerm>90 days without deduction</InvoicePaymentTerm>
    <IsTarifNumberToggler>false</IsTarifNumberToggler>
    <ShippingAddressType>GOM Partner</ShippingAddressType>
    <ShippingNewCustomer>false</ShippingNewCustomer>
    <ShippingMethod>Air</ShippingMethod>
    <ShippingFreightTerm>FCA</ShippingFreightTerm>
  </OrderAdministration>
  <OrderStatus>Editing</OrderStatus>
  <OrderValueToGom>0</OrderValueToGom>
  <PriceList>Partner</PriceList>
</OrderData>`
}

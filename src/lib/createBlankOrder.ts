/**
 * Creates a blank order.xml pre-filled with Trilion defaults, for "New Order".
 *
 * Element order here is not cosmetic. .NET's XmlSerializer reads a class as a
 * sequence, so every child must appear in the order its class declares it —
 * `src/lib/gpc/memberOrder.ts` holds those declarations, generated from GPC's
 * own assemblies, and `validateOrderXml` checks this template against them.
 *
 * Members with no value are left out rather than written empty, which is what
 * GPC does: a null string is simply absent from its files. Writing them as
 * empty elements set them to "" instead of null, and made every new order
 * carry about 1.2 kB of placeholders.
 *
 * `AccountNumber` is deliberately absent: it is the *customer's* number at
 * GOM, and GPC writes none. The distributor's id goes in `Distributor`.
 *
 * Defaults:
 *   - Distributor: 2104995 (GOM Partner ID)
 *   - PriceList: Partner
 *   - Currency: USD
 *   - Country: United States of America
 *   - InvoiceAddressType / ShippingAddressType: GOMPartner (the enum's
 *     member name — "GOM Partner" is only the label the UI shows)
 *   - ShippingMethod: Air, ShippingFreightTerm: FCA
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
    <IsDistributor>false</IsDistributor>
    <IsNewCustomer>false</IsNewCustomer>
  </AccountDetailsData>
  <AttachedFiles />
  <CleanOrder>false</CleanOrder>
  <CreationDate>${now}</CreationDate>
  <DestinationNew>
    <Country>United States of America</Country>
    <CountryCode>+1</CountryCode>
    <ExportControl>false</ExportControl>
    <Iso>US</Iso>
    <PriceFactor>1</PriceFactor>
  </DestinationNew>
  <DiscountForCustomer>0</DiscountForCustomer>
  <Distributor>2104995</Distributor>
  <FinalPriceForEndCustomer>0</FinalPriceForEndCustomer>
  <Currency>
    <Iso>USD</Iso>
    <Display>USD</Display>
    <Description>US Dollar</Description>
    <ExchangeRate>1</ExchangeRate>
  </Currency>
  <ContractType>Purchase</ContractType>
  <LocalTechnicalContact>
    <IsOtherDepartment>false</IsOtherDepartment>
    <IsOtherPosition>false</IsOtherPosition>
    <IsOtherSource>false</IsOtherSource>
  </LocalTechnicalContact>
  <Msrp>0</Msrp>
  <Dp>0</Dp>
  <OrderAdministration>
    <InvoiceAddressType>GOMPartner</InvoiceAddressType>
    <InvoiceNewCustomer>false</InvoiceNewCustomer>
    <InvoicePaymentTerm>90 days without deduction</InvoicePaymentTerm>
    <IsTarifNumberToggler>false</IsTarifNumberToggler>
    <ShippingAddressType>GOMPartner</ShippingAddressType>
    <ShippingMethod>Air</ShippingMethod>
    <ShippingNewCustomer>false</ShippingNewCustomer>
    <ShippingFreightTerm>FCA</ShippingFreightTerm>
  </OrderAdministration>
  <OrderStatus>Editing</OrderStatus>
  <OrderValueToGom>0</OrderValueToGom>
  <PriceList>Partner</PriceList>
</OrderData>`
    // The configurator writes CRLF throughout; the template is authored with
    // plain newlines, so they are normalised here rather than in every caller.
    .replace(/\r?\n/g, '\r\n')
}

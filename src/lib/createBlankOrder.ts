/**
 * Creates a minimal blank order.xml string pre-filled with Trilion defaults.
 * Used when the user clicks "New Order".
 *
 * ALL fields that patchOrderXml may write must exist here with empty/default
 * values so that setDocTag / setChildTag updates them in-place instead of
 * appending them at the wrong position (which causes GPC to reject the file).
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
    <CompanyName />
    <CompanyNameTwo />
    <CompanyType />
    <Department />
    <DepartmentTwo />
    <Street />
    <StreetTwo />
    <StreetThree />
    <HpcPoBox />
    <City />
    <StateProvince />
    <ZipPostalCode />
    <Country>United States of America</Country>
    <Phone />
    <PhonePrefix />
    <PhoneCountryCode />
    <Email />
    <Website />
    <AccountNumber>2104995</AccountNumber>
    <VatId />
    <CustomerIdAtGom />
    <Reference />
    <IsGomPartner>true</IsGomPartner>
    <IsDistributor>false</IsDistributor>
    <IsNewCustomer>false</IsNewCustomer>
  </AccountDetailsData>
  <AttachedFiles />
  <CaseId />
  <CleanOrder>false</CleanOrder>
  <Comments />
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
    <FirstName />
    <LastName />
    <Title />
    <AcademicDegree />
    <Gender />
    <Position />
    <Department />
    <Source />
    <Email />
    <AdditionalEmail />
    <BusinessPhone />
    <BusinessPhonePrefix />
    <BusinessPhoneCountryCode />
    <MobilePhone />
    <MobilePhonePrefix />
    <MobilePhoneCountryCode />
    <AdditionalPhone />
    <AdditionalPhonePrefix />
    <AdditionalPhoneCountryCode />
    <IsOtherDepartment>false</IsOtherDepartment>
    <IsOtherPosition>false</IsOtherPosition>
    <IsOtherSource>false</IsOtherSource>
  </LocalTechnicalContact>
  <Msrp>0</Msrp>
  <Dp>0</Dp>
  <OpportunityID />
  <OrderAdministration>
    <InvoiceAddressType>GOM Partner</InvoiceAddressType>
    <InvoiceAccountNumber />
    <InvoiceCompanyName />
    <InvoiceCompanyNameTwo />
    <InvoiceDepartment />
    <InvoiceDepartmentTwo />
    <InvoiceStreet />
    <InvoiceStreetTwo />
    <InvoiceStreetThree />
    <InvoiceHPCPOBox />
    <InvoiceCity />
    <InvoiceState />
    <InvoiceZIP />
    <InvoiceCountry />
    <InvoicePaymentTerm>90 days without deduction</InvoicePaymentTerm>
    <InvoiceNewCustomer>false</InvoiceNewCustomer>
    <IsTarifNumberToggler>false</IsTarifNumberToggler>
    <ShippingAddressType>GOM Partner</ShippingAddressType>
    <ShippingAccountNumber />
    <ShippingCompanyName />
    <ShippingCompanyNameTwo />
    <ShippingDepartment />
    <ShippingDepartmentTwo />
    <ShippingContactPerson />
    <ShippingStreet />
    <ShippingStreetTwo />
    <ShippingStreetThree />
    <ShippingHPCPOBox />
    <ShippingCity />
    <ShippingState />
    <ShippingZIP />
    <ShippingCountry />
    <ShippingFreightTerm>FCA</ShippingFreightTerm>
    <ShippingMethod>Air</ShippingMethod>
    <SpecialShippingInstructions />
    <ShippingNewCustomer>false</ShippingNewCustomer>
  </OrderAdministration>
  <OrderNumber />
  <OrderStatus>Editing</OrderStatus>
  <OrderValueToGom>0</OrderValueToGom>
  <PriceList>Partner</PriceList>
</OrderData>`
}

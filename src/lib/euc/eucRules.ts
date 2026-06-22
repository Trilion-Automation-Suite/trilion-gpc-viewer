/**
 * The Trilion EUC build guide encoded as data.
 * Edit the `rules` array to change what gets checked — no engine changes needed.
 * Grounded in "Trilion's Guide to Filling Out the EUC Form (2026)" plus ZEISS
 * export-control feedback.
 */

export type Severity = 'critical' | 'warning' | 'manual'

export type RuleType =
  | 'manual'
  | 'all_present'
  | 'regex_present'
  | 'section_nonempty'
  | 'country_present'
  | 'value_rounded_1000'
  | 'value_crosscheck'
  | 'gpc_crosscheck'

export interface SectionAnchor {
  id: string
  label: string
  patterns: string[]
}

export interface EucRule {
  id: string
  section: string
  title: string
  severity: Severity
  type: RuleType
  scope?: string
  patterns?: string[]
  pattern?: string
  between?: [string, string]
  feedback: string
}

export interface RuleSet {
  rulesetVersion: string
  formName: string
  sectionAnchors: SectionAnchor[]
  rules: EucRule[]
}

export const EUC_RULES: RuleSet = {
  rulesetVersion: '2026.06.22',
  formName: 'End-Use Certificate (EUC) — Federal Republic of Germany / BAFA',
  sectionAnchors: [
    { id: 'A', label: 'Section A – Parties', patterns: ['section a', 'parties'] },
    { id: 'B', label: 'Section B – Items', patterns: ['section b', 'items'] },
    { id: 'C', label: 'Section C – Final destination', patterns: ['section c', 'final destination'] },
    { id: 'D', label: 'Section D – End-use', patterns: ['section d', 'end-use'] },
    { id: 'E', label: 'Section E – Declaration (goods and software)', patterns: ['section e', 'declaration of commitment with regard to goods'] },
    { id: 'F', label: 'Section F – Declaration (technology)', patterns: ['section f', 'declaration of commitment with regard to technology'] },
  ],
  rules: [
    {
      id: 'A-supplier-name',
      section: 'A',
      title: 'Supplier must be Carl Zeiss GOM Metrology GmbH',
      severity: 'critical',
      type: 'all_present',
      scope: 'A',
      patterns: ['carl zeiss gom metrology gmbh'],
      feedback:
        'Section A (Supplier) must be the exporter of record. Use exactly:\nCarl Zeiss GOM Metrology GmbH\nSchmitzstr. 2\n38122 Braunschweig, Germany',
    },
    {
      id: 'A-supplier-address',
      section: 'A',
      title: 'Supplier address (Schmitzstr. 2, 38122 Braunschweig, Germany)',
      severity: 'critical',
      type: 'all_present',
      scope: 'A',
      patterns: ['schmitz', '38122', 'braunschweig', 'germany'],
      feedback: 'The Supplier address in Section A is incomplete or incorrect. It must read: Schmitzstr. 2, 38122 Braunschweig, Germany.',
    },
    {
      id: 'A-consignee-present',
      section: 'A',
      title: 'Consignee filled in (name + address)',
      severity: 'critical',
      type: 'section_nonempty',
      scope: 'A',
      between: ['Consignee', 'End-user'],
      feedback: 'Section A (Consignee) is blank. Enter the recipient entity and shipping address exactly as on the Purchase Order. Use the formal company name — no acronyms, department, or facility names.',
    },
    {
      id: 'A-enduser-email',
      section: 'A',
      title: 'End-user contact email present',
      severity: 'warning',
      type: 'regex_present',
      scope: 'A',
      pattern: '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}',
      feedback: 'Section A (End-user) should include the name and email address of the End User — the person/site where the system will live.',
    },
    {
      id: 'A-no-acronym-hint',
      section: 'A',
      title: 'Formal company name (avoid acronyms)',
      severity: 'manual',
      type: 'manual',
      feedback: "Confirm all company names use the FORMAL legal entity name (e.g. 'Lockheed Martin Corporation'), not acronyms, departments, or facility nicknames. ZEISS cross-references this against the order Trilion submits.",
    },
    {
      id: 'B-item-description',
      section: 'B',
      title: "Item description = 'Complete ARAMIS system with all accessories'",
      severity: 'warning',
      type: 'all_present',
      scope: 'B',
      patterns: ['aramis'],
      feedback: "Section B (Description of items) should read: 'Complete ARAMIS system with all accessories'.",
    },
    {
      id: 'B-quantity',
      section: 'B',
      title: "Quantity stated as '[n] Set'",
      severity: 'warning',
      type: 'regex_present',
      scope: 'B',
      pattern: '\\[?\\d+\\]?\\s*set',
      feedback: "Section B (Quantity) should be a discrete quantity in the form '[1] Set'.",
    },
    {
      id: 'B-value-eur',
      section: 'B',
      title: 'Value present and in EUR',
      severity: 'critical',
      type: 'regex_present',
      scope: 'B',
      pattern: '(eur|€)\\s?[0-9][0-9.,\\s]{2,}|[0-9][0-9.,\\s]{2,}\\s?(eur|€)',
      feedback: "Section B (Value) is missing or not in Euros. Take the system value from the 'ARAMIS' heading of the Trilion Quotation, convert to EUR, and round to the nearest 1,000. Do not include add-ons/services.",
    },
    {
      id: 'B-value-rounded',
      section: 'B',
      title: 'EUR value rounded to nearest 1,000',
      severity: 'warning',
      type: 'value_rounded_1000',
      scope: 'B',
      feedback: 'The EUR value should be rounded to the nearest 1,000 (e.g. 142,000 EUR, not 142,317 EUR).',
    },
    {
      id: 'B-value-crosscheck',
      section: 'B',
      title: 'EUR value reconciles with the GPC order',
      severity: 'warning',
      type: 'value_crosscheck',
      scope: 'B',
      feedback: "The EUR value does not reconcile with the ARAMIS system value from the open GPC order at the catalog FX rate. Confirm you used the system value (not the full order total) and the current rate.",
    },
    {
      id: 'C-destination-present',
      section: 'C',
      title: 'Final destination country + physical address filled',
      severity: 'critical',
      type: 'section_nonempty',
      scope: 'C',
      feedback: 'Section C (Final destination) is blank. Enter the country and physical address. It must match the End-user in Section A and use the formal company name.',
    },
    {
      id: 'C-matches-enduser',
      section: 'C',
      title: 'Final destination matches Section A End-user',
      severity: 'manual',
      type: 'manual',
      feedback: 'Confirm the Section C address matches the End-user field in Section A (formal company name). Mismatched addresses between the EUC and the order/GPC are the most common rejection reason.',
    },
    {
      id: 'D-responses',
      section: 'D',
      title: 'Section D Yes/No responses completed with X marks',
      severity: 'manual',
      type: 'manual',
      feedback: "Section D needs three Yes/No responses marked with an 'X' (not a filled-in square — BAFA rejects filled squares). For ARAMIS: used only for testing materials and structures, civil purposes only, not in any weapons/manufacturing chain.",
    },
    {
      id: 'E-country-blank',
      section: 'E',
      title: "Section E 'remain in country' filled (UNITED STATES OF AMERICA)",
      severity: 'critical',
      type: 'country_present',
      scope: 'E',
      feedback: "Section E is missing the country. On the 'items will remain in country ____' line, enter: UNITED STATES OF AMERICA.",
    },
    {
      id: 'F-country-blank',
      section: 'F',
      title: "Section F 'remain in country' filled (UNITED STATES OF AMERICA)",
      severity: 'critical',
      type: 'country_present',
      scope: 'F',
      feedback: "Section F is missing the country. On the 'goods derived ... remain in country ____' line, enter: UNITED STATES OF AMERICA.",
    },
    {
      id: 'EF-signature-block',
      section: 'E/F',
      title: 'Place/Date, signature, stamp, and signer name/title',
      severity: 'manual',
      type: 'manual',
      feedback: "Confirm the signature block(s) are complete on the printed copy: Place & Date, original signature of the End User, company stamp/official seal, and the signer's name and title in block letters. The signer must be an Authorized End User (department manager, senior administrator, or lead engineer).",
    },
    {
      id: 'FMT-letterhead-stamp',
      section: 'Format',
      title: 'Printed on end-customer letterhead AND/OR company seal',
      severity: 'manual',
      type: 'manual',
      feedback: 'The EUC must be on the end customer’s official letterhead and/or bear the company seal/stamp. Do not use letterhead that overlaps the EUC template text. (For defense end customers such as Lockheed Martin, ZEISS requires both letterhead and stamp.)',
    },
    {
      id: 'FMT-x-marks',
      section: 'Format',
      title: 'Checkboxes use (X), not filled squares',
      severity: 'manual',
      type: 'manual',
      feedback: "All Yes/No checkboxes must be filled with an 'X'. BAFA rejects filled-in/blacked-out squares.",
    },
    {
      id: 'XREF-consignee-gpc',
      section: 'A/C',
      title: 'Consignee/end-user addresses match the GPC order',
      severity: 'warning',
      type: 'gpc_crosscheck',
      feedback: 'The consignee and end-user company names in the EUC must match the open GPC order. If they differ, either the EUC or the GPC record must be corrected so they agree (city and ZIP should follow USPS).',
    },
  ],
}

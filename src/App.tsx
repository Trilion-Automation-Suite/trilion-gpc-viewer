declare const __APP_VERSION__: string

import { useState, useCallback, useEffect, useRef } from 'react'
import type { AccountDetails, OrderAdministration, OrderSummary, ParseResult, TechnicalContact } from './types/order.ts'
import type { ArticleCatalogEntry } from './lib/parseConfig.ts'
import { buildArticleCatalog } from './lib/parseConfig.ts'
import { parseOrder } from './lib/parseOrder.ts'
import { parseOrderXml, serializeOrderXml } from './lib/gpc/orderXml.ts'
import {
  addSmaExtension,
  addSmaExtensionToDongle,
  removeSmaExtension,
  setSmaContract,
  smaListName,
  smaOptions,
} from './lib/gpc/sma.ts'
import type { SmaContractEdit } from './lib/gpc/sma.ts'
import { addLicense, licenseOptionsFromConfig } from './lib/gpc/licenses.ts'
import { applyOrderBlockFields, applyOrderBlockItems } from './lib/gpc/applyOrderBlock.ts'
import { catalogOfLink, clearOrderLink, readOrderLink } from './lib/orderLink.ts'
import type { OrderBlockPlan } from './lib/gpc/orderBlock.ts'
import type { GpcContainer } from './lib/gpc/container.ts'
import type { LicenseOption } from './lib/gpc/licenses.ts'
import { readPdbConfig } from './lib/gpc/blankOrder.ts'
import type { OrderDocument } from './lib/gpc/orderXml.ts'
import { addCatalogArticle } from './lib/gpc/addItem.ts'
import { catalogContainer } from './lib/gpc/catalogContainer.ts'
import { loadGpcFile, createNewOrder, parseDecryptedPackage } from './lib/index.ts'
import { loadPdbFile } from './lib/loadPdbFile.ts'
import { addPdbToLibrary, listPdbLibrary, getPdbFromLibrary, loadLatestPdb, pdbVersionName } from './lib/pdbCache.ts'
import type { PdbLibraryEntry } from './lib/pdbCache.ts'
import { convertToDecryptedCatalog } from './lib/gpc/convertGpcFile.ts'
import type { ConversionReport } from './lib/gpc/convertCatalog.ts'
import { saveGpcFile, saveGpcFileAs } from './lib/saveGpcFile.ts'
import { FilePicker } from './components/FilePicker.tsx'
import { SummaryBar } from './components/SummaryBar.tsx'
import { ErrorBanner } from './components/ErrorBanner.tsx'
import { OrderStrip } from './components/OrderStrip.tsx'
import type { AddProductFields } from './components/ItemsTab.tsx'
import { ItemsTab } from './components/ItemsTab.tsx'
import { AccountTab } from './components/AccountTab.tsx'
import { ContactTab } from './components/ContactTab.tsx'
import { AdminTab } from './components/AdminTab.tsx'
import { CommentsTab } from './components/CommentsTab.tsx'
import { EucTab } from './components/EucTab.tsx'
import { PdbSwitcher } from './components/PdbSwitcher.tsx'
import { SaveBar } from './components/SaveBar.tsx'
import { InstallBanner } from './components/InstallBanner.tsx'
import './App.css'

type Tab = 'items' | 'account' | 'contact' | 'admin' | 'comments' | 'euc'
const TAB_LABELS: Record<Tab, string> = {
  items: 'Items',
  account: 'Account Details',
  contact: 'Technical Contact',
  admin: 'Administration Information',
  comments: 'Comments',
  euc: 'EUC Check',
}

type AppState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'loaded'
      result: ParseResult
      /**
       * Bumped only when a *different* file is opened. Editing the open order
       * replaces `result` too, and the sync effect below must not treat that as
       * a fresh load — doing so threw away the edit and cleared the unsaved
       * flag, which is why an added product vanished without an error.
       */
      loadId: number
    }
  | { status: 'error'; message: string }

let nextLoadId = 1
/** A newly opened file: the sync effect should adopt it wholesale. */
function opened(result: ParseResult): AppState {
  return { status: 'loaded', result, loadId: nextLoadId++ }
}

export function App() {
  const [state, setState] = useState<AppState>({ status: 'idle' })
  const [darkMode, setDarkMode] = useState(false)
  const [tab, setTab] = useState<Tab>('items')
  const [pdbCached, setPdbCached] = useState<boolean | null>(null)  // null = not checked yet
  const [pdbLibrary, setPdbLibrary] = useState<PdbLibraryEntry[]>([])
  const [converting, setConverting] = useState(false)
  const [conversionReport, setConversionReport] = useState<ConversionReport | null>(null)
  const [addItemError, setAddItemError] = useState<string | null>(null)
  /** A block that arrived in the address bar, waiting for its preview. */
  const [linkedOrder, setLinkedOrder] = useState<string | null>(null)

  // Mutable order copy — this is what the tab components read/write in edit mode
  const [order, setOrder] = useState<OrderSummary | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | undefined>(undefined)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    loadLatestPdb().then(cached => setPdbCached(cached !== null)).catch(() => setPdbCached(false))
  }, [])

  /**
   * An order handed over in the address bar.
   *
   * Read once, on load: a catalog is opened for it if none is, and the block
   * then goes through the same preview a paste does. A link changes a
   * customer's order and can arrive from anywhere, so it never applies itself.
   *
   * The block leaves the address bar immediately — a refresh should not
   * re-offer an order that has already been applied, and the customer's
   * details should not sit in the browser history.
   */
  useEffect(() => {
    const text = readOrderLink(window.location.href)
    if (!text) return
    clearOrderLink()
    let cancelled = false
    void (async () => {
      try {
        const wanted = catalogOfLink(text)
        const pdb = (wanted ? await getPdbFromLibrary(wanted) : null) ?? (await loadLatestPdb())
        if (cancelled) return
        if (!pdb) {
          setState({
            status: 'error',
            message:
              'This link carries an order, but no product database is loaded yet. ' +
              'Drop a .gproducts catalog first, then open the link again.',
          })
          return
        }
        setState(opened(await createNewOrder(pdb)))
        setLinkedOrder(text)
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Adopt a newly opened file. Keyed on loadId, so editing the order already
  // open does not reset it.
  const loadId = state.status === 'loaded' ? state.loadId : 0
  useEffect(() => {
    if (state.status === 'loaded') {
      setOrder(state.result.order)
      setIsEditing(state.result.openInEditMode ?? false)
      setIsDirty(false)
      setFileHandle(state.result.fileHandle)
    } else {
      setOrder(null)
      setIsEditing(false)
      setIsDirty(false)
      setFileHandle(undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, loadId])

  const handlePdbFile = useCallback(async (file: File) => {
    setState({ status: 'loading' })
    try {
      const pdb = await loadPdbFile(file)
      setPdbCached(true)
      // Also remember it as a switchable catalog, so a PDB loaded once for a new
      // order is available later when re-targeting an existing one.
      await addPdbToLibrary(pdbVersionName(pdb.configXml), { ...pdb, cachedAt: Date.now() })
      setPdbLibrary(await listPdbLibrary())
      const result = await createNewOrder(pdb)
      setState(opened(result))
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  const handleFile = useCallback(async (file: File, handle?: FileSystemFileHandle) => {
    if (file.name.endsWith('.gproducts')) {
      await handlePdbFile(file)
      return
    }
    setState({ status: 'loading' })
    try {
      const result = await loadGpcFile(file, handle)
      setState(opened(result))
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'An unknown error occurred while reading the file.'
      setState({ status: 'error', message })
    }
  }, [handlePdbFile])

  const handleRetry = useCallback(() => {
    setState({ status: 'idle' })
  }, [])

  const handleNewOrder = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      // Newest catalog available, not merely the last one loaded.
      const cached = await loadLatestPdb()
      const result = await createNewOrder(cached)
      setState(opened(result))
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  // Clipboard paste — fires when the user copies a file in Explorer/Outlook and presses Ctrl+V
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const file = e.clipboardData?.files[0]
      if (file) handleFile(file)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handleFile])

  // ---------------------------------------------------------------------------
  // Edit mode handlers
  // ---------------------------------------------------------------------------

  const handleEditToggle = useCallback(() => {
    setIsEditing((v) => !v)
  }, [])

  const handleHeaderChange = useCallback(
    (patch: Pick<OrderSummary, 'orderNumber' | 'caseId' | 'opportunityId'>) => {
      setOrder((prev) => (prev ? { ...prev, ...patch } : null))
      setIsDirty(true)
    },
    []
  )

  const handleAccountChange = useCallback((patch: Partial<AccountDetails>) => {
    setOrder((prev) => (prev ? { ...prev, account: { ...prev.account, ...patch } } : null))
    setIsDirty(true)
  }, [])

  const handleContactChange = useCallback((patch: Partial<TechnicalContact>) => {
    setOrder((prev) => (prev ? { ...prev, contact: { ...prev.contact, ...patch } } : null))
    setIsDirty(true)
  }, [])

  const handleAdminChange = useCallback((patch: Partial<OrderAdministration>) => {
    setOrder((prev) =>
      prev ? { ...prev, administration: { ...prev.administration, ...patch } } : null
    )
    setIsDirty(true)
  }, [])

  const handleItemDelete = useCallback((no: string) => {
    setOrder(prev => prev ? { ...prev, items: prev.items.filter(i => i.no !== no) } : null)
    setIsDirty(true)
  }, [])

  /**
   * Adds a product through the catalog model rather than by fabricating a line
   * item from the picker's fields.
   *
   * The old path invented a ConfigurationItem named after the article's MPG,
   * which put support articles under "SMA (Stand-alone / Extension)" instead of
   * the catalog's "Software Maintenance Agreement". addCatalogArticle clones the
   * real catalog item the article belongs to and nests the article inside it,
   * which is what GPC itself does.
   *
   * The insertion happens here, against order.xml, rather than at save time, so
   * what the table shows is what the file contains.
   */
  /**
   * Commits a mutated order document back into state.
   *
   * Every structural edit goes through here: serialize, reparse, keep `loadId`
   * so the sync effect leaves the result alone, and mark the file dirty.
   */
  const applyDocument = useCallback((doc: OrderDocument) => {
    setState(prev => {
      if (prev.status !== 'loaded') return prev
      const orderXml = new TextDecoder().decode(serializeOrderXml(doc))
      const parsed = parseOrder(orderXml)
      setOrder(parsed)
      return { ...prev, result: { ...prev.result, rawOrderXml: orderXml, order: parsed } }
    })
    setIsDirty(true)
  }, [])

  /**
   * The licences a catalog offers, which are options inside its dependent
   * lists rather than a flat list. Built on demand and cached, like the article
   * catalog — walking the lists costs a parse of the product database.
   */
  const licenseCache = useRef<{ key: string; entries: LicenseOption[] } | null>(null)
  const getLicenseCatalog = useCallback((): LicenseOption[] => {
    if (state.status !== 'loaded' || !state.result.configXml) return []
    const configXml = state.result.configXml
    const key = String(configXml.length)
    if (licenseCache.current?.key !== key) {
      licenseCache.current = { key, entries: licenseOptionsFromConfig(catalogContainer(configXml)) }
    }
    return licenseCache.current.entries
  }, [state])

  /** Changes a dongle row's serial, its term or its licence user. */
  const handleSmaContractChange = useCallback((dongleIndex: number, patch: SmaContractEdit) => {
    if (state.status !== 'loaded' || !state.result.configXml) return
    setAddItemError(null)
    try {
      const doc = parseOrderXml(new TextEncoder().encode(state.result.rawOrderXml))
      setSmaContract(doc, catalogContainer(state.result.configXml), dongleIndex, patch)
      applyDocument(doc)
    } catch (err) {
      setAddItemError(err instanceof Error ? err.message : String(err))
    }
  }, [state, applyDocument])

  /** Puts another agreement on a dongle already on the order. */
  const handleAddSmaExtension = useCallback((dongleIndex: number, articleName: string) => {
    if (state.status !== 'loaded' || !state.result.configXml) return
    setAddItemError(null)
    try {
      const doc = parseOrderXml(new TextEncoder().encode(state.result.rawOrderXml))
      addSmaExtensionToDongle(doc, catalogContainer(state.result.configXml), dongleIndex, articleName)
      applyDocument(doc)
    } catch (err) {
      setAddItemError(err instanceof Error ? err.message : String(err))
    }
  }, [state, applyDocument])

  /** Takes an agreement off a dongle row. */
  const handleRemoveSmaExtension = useCallback((dongleIndex: number, articleName: string) => {
    if (state.status !== 'loaded' || !state.result.configXml) return
    setAddItemError(null)
    try {
      const doc = parseOrderXml(new TextEncoder().encode(state.result.rawOrderXml))
      removeSmaExtension(doc, catalogContainer(state.result.configXml), dongleIndex, articleName)
      applyDocument(doc)
    } catch (err) {
      setAddItemError(err instanceof Error ? err.message : String(err))
    }
  }, [state, applyDocument])

  /**
   * The open catalog as a container, cached: the paste preview resolves every
   * item against it, and re-reading the product database per keystroke would
   * be unusable.
   */
  const pdbCache = useRef<{ key: string; pdb: GpcContainer } | null>(null)
  const getPdb = useCallback((): GpcContainer | null => {
    if (state.status !== 'loaded' || !state.result.configXml) return null
    const configXml = state.result.configXml
    const key = String(configXml.length)
    if (pdbCache.current?.key !== key) {
      pdbCache.current = { key, pdb: catalogContainer(configXml) }
    }
    return pdbCache.current.pdb
  }, [state])

  /**
   * Applies a pasted order: the configuration onto the document, the customer
   * and addresses onto the summary, as one edit.
   *
   * Items that failed are surfaced rather than swallowed — the operator has
   * already seen the preview and chosen to go ahead without them, but they
   * still need to know which ones did not make it.
   */
  const handlePasteOrder = useCallback((plan: OrderBlockPlan) => {
    if (state.status !== 'loaded') return
    const pdb = getPdb()
    if (!pdb) {
      setAddItemError('Cannot paste an order without the product database this order was built on.')
      return
    }
    setAddItemError(null)
    try {
      const doc = parseOrderXml(new TextEncoder().encode(state.result.rawOrderXml))
      const report = applyOrderBlockItems(doc, pdb, plan)
      const orderXml = new TextDecoder().decode(serializeOrderXml(doc))
      const withFields = applyOrderBlockFields(parseOrder(orderXml), plan)

      setState(prev => (prev.status === 'loaded'
        ? { ...prev, result: { ...prev.result, rawOrderXml: orderXml, order: withFields } }
        : prev))
      setOrder(withFields)
      setIsDirty(true)

      if (report.failed.length > 0) {
        setAddItemError(
          `Pasted, without ${report.failed.length} item${report.failed.length === 1 ? '' : 's'}: ` +
          report.failed.map(f => `${f.what} — ${f.problem}`).join('; ')
        )
      }
    } catch (err) {
      setAddItemError(err instanceof Error ? err.message : String(err))
    }
  }, [state, getPdb])

  /** The agreements `SMA_EXT` offers, for the per-dongle picker. */
  const getSmaCatalog = useCallback((): string[] => {
    if (state.status !== 'loaded' || !state.result.configXml) return []
    try {
      const config = readPdbConfig(catalogContainer(state.result.configXml))
      return smaOptions(config, smaListName(config))
        .filter(o => o.sectionName !== 'License model')
        .map(o => o.articleName)
    } catch {
      return []
    }
  }, [state])

  const handleAddProduct = useCallback((fields: AddProductFields) => {
    if (state.status !== 'loaded' || !state.result.configXml) {
      setAddItemError('Cannot add a product without the product database this order was built on.')
      return
    }
    setAddItemError(null)
    try {
      const doc = parseOrderXml(new TextEncoder().encode(state.result.rawOrderXml))
      const pdb = catalogContainer(state.result.configXml)
      if (fields.sma) {
        // A maintenance agreement is a group, not a row: the licence-model row
        // carries the dongle and the term, and the agreements hang off it.
        addSmaExtension(doc, pdb, fields.name, {
          dongleId: fields.sma.dongleId,
          endOldContract: fields.sma.endOldContract,
          startNewContract: fields.sma.startNewContract,
          months: fields.sma.months,
          licenseUserEmail: fields.sma.licenseUserEmail,
          licenseUserName: fields.sma.licenseUserName,
        })
      } else {
        addCatalogArticle(doc, pdb, fields.name, { amount: fields.amount })
      }
      const orderXml = new TextDecoder().decode(serializeOrderXml(doc))
      const parsed = parseOrder(orderXml)
      // Same file, edited: keep loadId so the sync effect leaves our new order
      // and the unsaved flag alone.
      setState({ ...state, result: { ...state.result, rawOrderXml: orderXml, order: parsed } })
      setOrder(parsed)
      setIsDirty(true)
    } catch (err) {
      // Never replace the loaded order with an error screen: a product that
      // cannot be added is a message, not a reason to close the file.
      setAddItemError(err instanceof Error ? err.message : String(err))
    }
  }, [state])

  const handleAddLicense = useCallback((fields: { option: LicenseOption; userZeissId: string; userName: string }) => {
    if (state.status !== 'loaded' || !state.result.configXml) {
      setAddItemError('Cannot add a license without the product database this order was built on.')
      return
    }
    setAddItemError(null)
    try {
      // A licence is an option inside a dependent list, so adding one means
      // adding the line that owns it with that option selected. The previous
      // version only added rows to the in-memory summary, which the save path
      // had no way to write.
      const doc = parseOrderXml(new TextEncoder().encode(state.result.rawOrderXml))
      addLicense(doc, catalogContainer(state.result.configXml), fields.option, {
        userZeissId: fields.userZeissId,
        userName: fields.userName,
      })
      applyDocument(doc)
    } catch (err) {
      setAddItemError(err instanceof Error ? err.message : String(err))
    }
  }, [state, applyDocument])


  const handleLicenseUserChange = useCallback((no: string, patch: { userZeissId?: string; userName?: string }) => {
    setOrder(prev => prev ? { ...prev, items: prev.items.map(i => i.no === no ? { ...i, ...patch } : i) } : null)
    setIsDirty(true)
  }, [])

  const handleDiscard = useCallback(() => {
    if (state.status === 'loaded') {
      setOrder(state.result.order)
      setIsDirty(false)
    }
  }, [state])

  const handleSave = useCallback(async () => {
    if (state.status !== 'loaded' || !order) return
    setIsSaving(true)
    try {
      await saveGpcFile(
        state.result.rawDecryptedBuffer,
        state.result.rawOrderXml,
        order,
        state.result.sourceFile,
        fileHandle,
        state.result.originalItemNos
      )
      setIsDirty(false)
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsSaving(false)
    }
  }, [state, order, fileHandle])

  const handleSaveAs = useCallback(async () => {
    if (state.status !== 'loaded' || !order) return
    setIsSaving(true)
    try {
      const newHandle = await saveGpcFileAs(
        state.result.rawDecryptedBuffer,
        state.result.rawOrderXml,
        order,
        state.result.sourceFile,
        state.result.originalItemNos
      )
      if (newHandle) {
        setFileHandle(newHandle)
      }
      setIsDirty(false)
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsSaving(false)
    }
  }, [state, order])

  // File Handling API — fires when the PWA is launched by opening a file
  // (e.g. double-clicking a .gconfiguration attachment in Outlook or Finder).
  // Works in installed PWAs on Chrome/Edge. Silently no-ops elsewhere.
  useEffect(() => {
    if (!('launchQueue' in window)) return
    ;(window as unknown as { launchQueue: { setConsumer: (fn: (p: { files: FileSystemFileHandle[] }) => void) => void } })
      .launchQueue.setConsumer(async (launchParams) => {
        if (launchParams.files.length === 0) return
        try {
          const file = await launchParams.files[0].getFile()
          handleFile(file, launchParams.files[0])
        } catch {
          // launchQueue errors are non-fatal — user can still drag/drop
        }
      })
  }, [handleFile])

  // ---------------------------------------------------------------------------
  // Cmd+K search palette
  // ---------------------------------------------------------------------------
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchActiveIdx, setSearchActiveIdx] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Build search index from current order data
  const searchItems = (() => {
    if (!order) return []
    const items: { type: string; text: string; sub?: string; action: () => void }[] = []
    // Tabs
    ;(Object.keys(TAB_LABELS) as Tab[]).forEach((t) => {
      items.push({ type: 'tab', text: TAB_LABELS[t], action: () => { setTab(t); setSearchOpen(false) } })
    })
    // Order fields
    if (order.orderNumber) items.push({ type: 'field', text: `Order: ${order.orderNumber}`, action: () => { setTab('items'); setSearchOpen(false) } })
    if (order.caseId) items.push({ type: 'field', text: `Case: ${order.caseId}`, action: () => { setTab('items'); setSearchOpen(false) } })
    if (order.opportunityId) items.push({ type: 'field', text: `Opportunity: ${order.opportunityId}`, action: () => { setTab('items'); setSearchOpen(false) } })
    // Account
    if (order.account?.companyName) items.push({ type: 'account', text: order.account.companyName, sub: 'Account name', action: () => { setTab('account'); setSearchOpen(false) } })
    if (order.account?.city) items.push({ type: 'account', text: `${order.account.city}${order.account.stateProvince ? ', ' + order.account.stateProvince : ''}`, sub: 'Location', action: () => { setTab('account'); setSearchOpen(false) } })
    // Contact
    if (order.contact?.firstName || order.contact?.lastName) items.push({ type: 'contact', text: `${order.contact.firstName} ${order.contact.lastName}`.trim(), sub: 'Technical contact', action: () => { setTab('contact'); setSearchOpen(false) } })
    if (order.contact?.email) items.push({ type: 'contact', text: order.contact.email, sub: 'Contact email', action: () => { setTab('contact'); setSearchOpen(false) } })
    // Line items
    order.items?.forEach((item, i) => {
      items.push({ type: 'item', text: item.name || item.label || `Item ${i + 1}`, sub: item.no, action: () => { setTab('items'); setSearchOpen(false) } })
    })
    return items
  })()

  const filteredSearchItems = searchQuery
    ? searchItems.filter((item) => {
        const q = searchQuery.toLowerCase()
        return item.text.toLowerCase().includes(q) || (item.sub?.toLowerCase().includes(q) ?? false)
      })
    : searchItems

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
        setSearchQuery('')
        setSearchActiveIdx(0)
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchOpen])

  // Auto-focus search input when opened
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSearchActiveIdx((i) => Math.min(i + 1, filteredSearchItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSearchActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filteredSearchItems[searchActiveIdx]?.action()
    }
  }

  // Catalogs the user has loaded before, offered in the header switcher.
  useEffect(() => { void listPdbLibrary().then(setPdbLibrary) }, [])

  /**
   * Re-targets the open order at another catalog and keeps it open, so the
   * normal Save path writes it. Converting is an edit, not an export.
   */
  const applyConversion = useCallback(async (targetZip: ArrayBuffer) => {
    if (state.status !== 'loaded') return
    setConverting(true)
    try {
      const converted = await convertToDecryptedCatalog(
        state.result.rawDecryptedBuffer, targetZip, state.result.sourceFile
      )
      const reparsed = await parseDecryptedPackage(
        converted.decryptedZip, state.result.sourceFile, state.result.fileHandle
      )
      // A conversion rewrites the open order; it is an edit, not a new file.
      setState({ ...state, result: reparsed })
      setOrder(reparsed.order)
      setIsDirty(true)
      setConversionReport(converted.report)
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setConverting(false)
    }
  }, [state])

  const convertToCatalog = useCallback(async (name: string) => {
    const pdb = await getPdbFromLibrary(name)
    if (pdb) await applyConversion(pdb.rawBuffer)
  }, [applyConversion])

  const loadCatalogFile = useCallback(async (file: File) => {
    setConverting(true)
    try {
      const pdb = await loadPdbFile(file)
      const entry = { ...pdb, cachedAt: Date.now() }
      const name = pdbVersionName(pdb.configXml)
      await addPdbToLibrary(name, entry)
      setPdbLibrary(await listPdbLibrary())
      await applyConversion(pdb.rawBuffer)
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      setConverting(false)
    }
  }, [applyConversion])

  /**
   * The product-search catalog, built the first time it is needed and cached
   * per (catalog, price list). Scanning the product database takes tens of
   * milliseconds, which is fine on a click and wasteful on every file open.
   */
  const catalogCache = useRef<{ key: string; entries: ArticleCatalogEntry[] } | null>(null)
  const getArticleCatalog = useCallback((): ArticleCatalogEntry[] => {
    if (state.status !== 'loaded') return []
    const configXml = state.result.configXml
    if (!configXml) return []
    const key = `${configXml.length}:${order?.priceList ?? ''}`
    if (catalogCache.current?.key !== key) {
      catalogCache.current = { key, entries: buildArticleCatalog(configXml, order?.priceList ?? '') }
    }
    return catalogCache.current.entries
  }, [state, order?.priceList])

  const loadedFilename =
    state.status === 'loaded' ? state.result.sourceFile : undefined
  const loadedPdb = state.status === 'loaded' ? state.result.pdbVersion : ''


  return (
    <>
      <header className="app-header">
        <img
          src={`${import.meta.env.BASE_URL}trilion-logo-2017_RGB-white-medium.png`}
          alt="Trilion"
          className="header-logo"
        />
        <h1 className="header-app-name">GPC Viewer</h1>
        <span className="badge-beta">BETA</span>
        {loadedFilename && (
          <span className="filename" title={loadedFilename}>
            {loadedFilename}
          </span>
        )}
        {state.status === 'loaded' && (
          <PdbSwitcher
            current={loadedPdb}
            library={pdbLibrary}
            canConvert={isEditing}
            busy={converting}
            onConvertTo={convertToCatalog}
            onLoadCatalog={loadCatalogFile}
            report={conversionReport}
            onDismissReport={() => setConversionReport(null)}
          />
        )}
        <div className="header-right">
          <button
            className="header-icon-btn"
            onClick={() => { setSearchOpen(true); setSearchQuery(''); setSearchActiveIdx(0) }}
            title="Search (Cmd+K)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
          </button>
          {state.status === 'loaded' && order && isDirty && (
            <div className="header-actions">
              <button className="header-action-btn header-action-btn--ghost" onClick={handleDiscard} disabled={isSaving}>Discard</button>
              <button className="header-action-btn header-action-btn--ghost" onClick={handleSaveAs} disabled={isSaving}>Save As</button>
              <button className="header-action-btn header-action-btn--primary" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
          {state.status === 'loaded' && order && (
            <button
              className={`header-action-btn header-action-btn--edit${isEditing ? ' header-action-btn--edit-active' : ''}`}
              onClick={handleEditToggle}
              title={isEditing ? 'Exit edit mode' : 'Edit order fields'}
              aria-pressed={isEditing}
            >
              {isEditing ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Done
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit
                </>
              )}
            </button>
          )}
          <button
            className="theme-toggle"
            onClick={() => setDarkMode((d) => !d)}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={darkMode ? 'Light mode' : 'Dark mode'}
          >
            {darkMode ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {isDirty && state.status === 'loaded' && (
        <SaveBar sourceFile={state.result.sourceFile} />
      )}

      {addItemError && (
        <ErrorBanner message={addItemError} onRetry={() => setAddItemError(null)} />
      )}

      <main className="app">
        {state.status === 'idle' && (
          <div className="app-idle">
            {pdbCached !== null && (
              <div className="new-order-bar">
                <button
                  className="new-order-btn"
                  onClick={handleNewOrder}
                  title={pdbCached ? 'Create a new blank order using cached PDB' : 'Drop a .gproducts file to create a new order'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  New Order
                </button>
                {!pdbCached && (
                  <span className="new-order-hint">Drop a .gproducts file here or use the button above to create a new order. The PDB will be cached locally.</span>
                )}
              </div>
            )}
            <FilePicker onFile={handleFile} />
          </div>
        )}

        {state.status === 'loading' && (
          <div className="app-loading" aria-live="polite" aria-busy="true">
            <div className="spinner" role="status" aria-label="Loading" />
            <span>Reading file…</span>
          </div>
        )}

        {state.status === 'error' && (
          <div className="app-error">
            <ErrorBanner message={state.message} onRetry={handleRetry} />
          </div>
        )}

        {state.status === 'loaded' && order && (
          <div className="app-loaded">
            <SummaryBar order={order} />
            <OrderStrip
              order={order}
              isEditing={isEditing}
              onChange={handleHeaderChange}
            />
            <nav className="tab-bar" aria-label="Sections">
              {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
                <button
                  key={t}
                  className={`tab-btn${tab === t ? ' active' : ''}`}
                  onClick={() => setTab(t)}
                  aria-current={tab === t ? 'page' : undefined}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </nav>
            <div className="tab-content">
              {tab === 'items' && (
                <ItemsTab
                  order={order}
                  isEditing={isEditing}
                  onDelete={handleItemDelete}
                  onAddProduct={handleAddProduct}
                  onAddLicense={handleAddLicense}
                  onLicenseUserChange={handleLicenseUserChange}
                  getArticleCatalog={getArticleCatalog}
                  getLicenseCatalog={getLicenseCatalog}
                  getSmaCatalog={getSmaCatalog}
                  onSmaContractChange={handleSmaContractChange}
                  onAddSmaExtension={handleAddSmaExtension}
                  onRemoveSmaExtension={handleRemoveSmaExtension}
                  getPdb={getPdb}
                  openCatalog={state.status === 'loaded' ? state.result.pdbVersion : ''}
                  onPasteOrder={handlePasteOrder}
                  linkedOrder={linkedOrder}
                  onLinkedOrderHandled={() => setLinkedOrder(null)}
                />
              )}
              {tab === 'account' && (
                <AccountTab
                  account={order.account}
                  isEditing={isEditing}
                  onChange={handleAccountChange}
                />
              )}
              {tab === 'contact' && (
                <ContactTab
                  contact={order.contact}
                  isEditing={isEditing}
                  onChange={handleContactChange}
                />
              )}
              {tab === 'admin' && (
                <AdminTab
                  admin={order.administration}
                  isEditing={isEditing}
                  onChange={handleAdminChange}
                />
              )}
              {tab === 'comments' && (
                <CommentsTab
                  comments={order.comments}
                  isEditing={isEditing}
                  onChange={(v) => { setOrder((prev) => prev ? { ...prev, comments: v } : null); setIsDirty(true) }}
                />
              )}
              {tab === 'euc' && (
                <EucTab
                  order={order}
                  currencyRates={state.status === 'loaded' ? state.result.currencyRates : {}}
                />
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span className="footer-version">v{__APP_VERSION__}</span>
        <div className="footer-legal-block">
          <span className="footer-legal-heading">INTERNAL USE ONLY — PROPRIETARY &amp; CONFIDENTIAL</span>
          <span className="footer-legal">
            This tool and all information displayed herein are strictly for internal use by authorized
            personnel of Trilion Quality Systems only. All data, pricing, configurations, and customer
            information are proprietary and confidential. Sharing, forwarding, reproducing, or
            disclosing any information provided through this tool to any third party is completely
            forbidden without a signed NDA with ZEISS and/or Trilion Quality Systems.
            Unauthorized use or distribution may result in legal action.
            Use at your own risk — no warranties expressed or implied.
          </span>
        </div>
      </footer>

      <InstallBanner />

      {searchOpen && (
        <div className="search-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSearchOpen(false) }}>
          <div className="search-palette">
            <input
              ref={searchInputRef}
              className="search-input"
              placeholder="Search sections, fields, items..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchActiveIdx(0) }}
              onKeyDown={handleSearchKeyDown}
            />
            <div className="search-results">
              {filteredSearchItems.length === 0 && (
                <div className="search-empty">No results found</div>
              )}
              {filteredSearchItems.map((item, i) => (
                <div
                  key={i}
                  className={`search-result${i === searchActiveIdx ? ' active' : ''}`}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSearchActiveIdx(i)}
                >
                  <span className="search-result-type">{item.type}</span>
                  <div>
                    <div className="search-result-text">{item.text}</div>
                    {item.sub && <div className="search-result-sub">{item.sub}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="search-hint">Navigate with arrow keys, Enter to select, Esc to close</div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Wraps a bare config.xml as a container, so catalog lookups can take the same
 * shape whether the catalog came from a `.gproducts` package or from the
 * `config.xml` an open order already carries.
 */
import { METHOD_DEFLATE } from './container.ts'
import type { GpcContainer } from './container.ts'

export function catalogContainer(configXml: string): GpcContainer {
  return {
    dosTime: 0,
    dosDate: 0,
    entries: [{ name: 'config.xml', data: new TextEncoder().encode(configXml), method: METHOD_DEFLATE }],
  }
}

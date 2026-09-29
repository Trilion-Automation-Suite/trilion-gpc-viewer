/**
 * Who a licence is issued to when nobody says otherwise.
 *
 * GPC asks for a licence user on every in-system SMA and every licence line
 * (the SMA configuration item's Question1/Question2: the user's e-mail and
 * name). Trilion registers licences to its own licensing desk and hands them
 * over, so that is the answer unless an order names someone else.
 */
export const DEFAULT_LICENSE_USER = {
  email: 'licensing@trilion.com',
  name: 'Trilion Licensing',
} as const

/**
 * Whether a configuration item's questions are the licence-user pair: an
 * e-mail first, a name second. Recognised by what GPC asks rather than by the
 * item's name, so a renamed or new item that asks the same gets the same answer.
 */
export function asksForLicenseUser(question1: string | null, question2: string | null): boolean {
  return /e-?mail/i.test(question1 ?? '') && /name/i.test(question2 ?? '')
}

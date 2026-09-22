/**
 * A decimal number with an explicit scale, the way .NET's `decimal` behaves.
 *
 * JS numbers cannot do this job. Two reasons, both of which showed up as byte
 * differences against real files:
 *
 *  - **Scale is part of the value.** .NET carries it through arithmetic and
 *    serializes it, so an order can record `1771.0` or even
 *    `4145.0000000000000000000000000`. A JS number has no scale to preserve.
 *  - **Binary floating point rounds differently.** Prices are rounded to a
 *    quantum (see roundingRules.ts), and a value that lands exactly on a half —
 *    2610.5 — decides the result. Binary floats cannot represent 0.5 of a tenth
 *    reliably, so the answer drifts by one unit.
 *
 * Values are held as a scaled BigInt: `unscaled * 10^-scale`. Only the
 * operations the pricing path needs are implemented.
 */
export interface Dec {
  unscaled: bigint
  scale: number
}

const TEN = 10n

function pow10(n: number): bigint {
  return TEN ** BigInt(n)
}

export function parseDecimal(text: string): Dec {
  const s = text.trim()
  if (!/^[+-]?\d*(\.\d*)?$/.test(s) || s === '' || s === '+' || s === '-') {
    throw new Error(`decimal: cannot parse ${JSON.stringify(text)}`)
  }
  const negative = s.startsWith('-')
  const body = s.replace(/^[+-]/, '')
  const dot = body.indexOf('.')
  const digits = dot < 0 ? body : body.slice(0, dot) + body.slice(dot + 1)
  const scale = dot < 0 ? 0 : body.length - dot - 1
  const unscaled = BigInt(digits === '' ? '0' : digits)
  return { unscaled: negative ? -unscaled : unscaled, scale }
}

/** Parses, or returns null for absent/blank — the shape catalog fields come in. */
export function parseDecimalOrNull(text: string | null | undefined): Dec | null {
  if (text === null || text === undefined || text.trim() === '') return null
  try {
    return parseDecimal(text)
  } catch {
    return null
  }
}

export function fromInt(n: number | bigint): Dec {
  return { unscaled: BigInt(n), scale: 0 }
}

/** Renders with exactly `scale` decimal places, as .NET does. */
export function formatDecimal(d: Dec): string {
  const negative = d.unscaled < 0n
  const digits = (negative ? -d.unscaled : d.unscaled).toString().padStart(d.scale + 1, '0')
  const whole = digits.slice(0, digits.length - d.scale) || '0'
  const frac = d.scale > 0 ? '.' + digits.slice(digits.length - d.scale) : ''
  return `${negative ? '-' : ''}${whole}${frac}`
}

/** Multiplication: scales add, as in .NET. */
export function multiply(a: Dec, b: Dec): Dec {
  return { unscaled: a.unscaled * b.unscaled, scale: a.scale + b.scale }
}

/** Addition: the result takes the larger scale. */
export function add(a: Dec, b: Dec): Dec {
  const scale = Math.max(a.scale, b.scale)
  return {
    unscaled: a.unscaled * pow10(scale - a.scale) + b.unscaled * pow10(scale - b.scale),
    scale,
  }
}

export function isZero(d: Dec): boolean {
  return d.unscaled === 0n
}

export function compare(a: Dec, b: Dec): number {
  const scale = Math.max(a.scale, b.scale)
  const x = a.unscaled * pow10(scale - a.scale)
  const y = b.unscaled * pow10(scale - b.scale)
  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * Division to a fixed number of decimal places, rounded half away from zero.
 *
 * .NET's decimal division carries about 28 significant digits, which is the
 * default here. The pricing path needs it for the discount ratio: a price list
 * of 394 against 493 is not a round fraction, and truncating it early moves the
 * final price.
 */
export function divide(a: Dec, b: Dec, scale = 28): Dec {
  if (b.unscaled === 0n) throw new Error('decimal: division by zero')
  // Shift the numerator so the integer division lands at the wanted scale.
  const shift = scale + b.scale - a.scale
  const numerator = shift >= 0 ? a.unscaled * pow10(shift) : a.unscaled / pow10(-shift)
  const denominator = b.unscaled
  const negative = (numerator < 0n) !== (denominator < 0n)
  const n = numerator < 0n ? -numerator : numerator
  const dd = denominator < 0n ? -denominator : denominator
  let q = n / dd
  if ((n % dd) * 2n >= dd) q += 1n
  return { unscaled: negative ? -q : q, scale }
}

export type RoundingMode = 'commercial' | 'up' | 'down'

/**
 * Rounds to a multiple of `quantum`, the way the catalog's rounding rules mean it.
 *
 * The result takes the quantum's scale, which is what gives prices their shape:
 * a quantum of `10` yields `2610`, a quantum of `0.1` yields `12.3`.
 *
 * `commercial` is half away from zero — .NET's MidpointRounding.AwayFromZero,
 * not banker's rounding.
 */
export function roundToQuantum(value: Dec, quantum: Dec, mode: RoundingMode): Dec {
  if (isZero(quantum)) return value

  // Work in a common scale so the division is exact integer arithmetic.
  const scale = Math.max(value.scale, quantum.scale)
  const v = value.unscaled * pow10(scale - value.scale)
  const q = quantum.unscaled * pow10(scale - quantum.scale)
  const qAbs = q < 0n ? -q : q

  const quotient = v / qAbs
  const remainder = v % qAbs

  let steps = quotient
  if (remainder !== 0n) {
    const negative = v < 0n
    if (mode === 'down') {
      if (negative) steps -= 1n
    } else if (mode === 'up') {
      if (!negative) steps += 1n
    } else {
      const twice = (remainder < 0n ? -remainder : remainder) * 2n
      if (twice >= qAbs) steps += negative ? -1n : 1n
    }
  }

  // steps * quantum, expressed at the quantum's own scale.
  return { unscaled: steps * quantum.unscaled, scale: quantum.scale }
}

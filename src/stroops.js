/**
 * Convert arbitrary stringified amount to int64 representation
 * @param {string|number} value
 * @param {boolean} throwIfInvalid
 * @return {BigInt}
 */
export function toStroops(value, throwIfInvalid = false) {
    if (typeof value === 'number') {
        if (value === 0)
            return 0n
        value = value.toFixed(7)
    }
    if (typeof value !== 'string' || !/^-?[\d.,]+$/.test(value)) {
        if (throwIfInvalid)
            throw new TypeError('Invalid number format')
        return 0n
    }
    try {
        let [int, decimal = '0'] = value.split('.', 2)
        let negative = false
        if (int.startsWith('-')) {
            negative = true
            int = int.slice(1)
        }
        let res = BigInt(int) * 10000000n + BigInt(decimal.slice(0, 7).padEnd(7, '0'))
        if (negative) {
            res *= -1n
            if (res < -0x8000000000000000n) {//overflow
                if (throwIfInvalid)
                    throw new TypeError('Invalid number: Int64 overflow')
                return 0n
            }
        } else if (res > 0xFFFFFFFFFFFFFFFFn) {//overflow
            if (throwIfInvalid)
                throw new TypeError('Invalid number: UInt64 overflow')
            return 0n
        }
        return res
    } catch (e) {
        if (throwIfInvalid) {
            if (e.message.startsWith('Invalid number: '))
                throw e
            throw new TypeError('Invalid number format')
        }
        return 0n
    }
}


/**
 * Format int64 value representation in stroops as string
 * @param {bigint} valueInStroops
 * @return {string}
 */
export function fromStroops(valueInStroops) {
    if (valueInStroops < 0n)
        throw new TypeError('Invalid amount: ' + valueInStroops.toString())
    const int = valueInStroops / 10000000n
    const fract = valueInStroops % 10000000n
    let res = int.toString()
    if (fract) {
        res += '.' + fract.toString().padStart(7, '0').replace(/0+$/, '')
    }
    return res
}
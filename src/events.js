/**
 * @param {string} type
 * @param {{}} data
 * @param {string} [key]
 * @return {CustomEvent}
 */
export function buildEvent(type, data, key) {
    const evt = new CustomEvent(type, {detail: data})
    evt[key || type] = data
    return evt
}
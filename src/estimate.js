import errors, {StellarBrokerError} from './errors.js'
import {validateQuoteRequest} from './quote-request.js'

/**
 * Estimate price swap without trading
 * @param {SwapQuoteParams} params
 * @return {Promise<SwapQuoteResult>}
 */
export async function estimateSwap(params) {
    const query = Object.entries(validateQuoteRequest(params)).map(([param, value]) => encodeURIComponent(param) + '=' + encodeURIComponent(value))
    const url = (params.origin || 'https://api.stellar.broker') + '/quote?' + query.join('&')
    try {
        const res = await fetch(url).then(r => r.json())
        if (res.status !== 'success')
            throw errors.quoteError(res.error || 'Quote not available')
        return res
    } catch (e) {
        if (e instanceof StellarBrokerError)
            throw e
        throw errors.quoteError('Failed to fetch quote')
        return null
    }
}
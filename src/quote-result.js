import {fromStroops, toStroops} from './stroops.js'

/**
 * @typedef {'unfeasible'|'rejected'|'success'} QuoteResultStatus - Result status code returned by the server
 */

/**
 * @typedef {Object} QuoteDirectTradeResult - Emulated single `path_payment` trades result corresponding to the quote
 * @property {string} selling - Estimated amount to sell
 * @property {string} buying - Estimated amount to buy
 * @property {string[]} path - Conversion path
 */

/**
 * Quote received from the server
 */
export class QuoteResult {
    /**
     * @param {{}} result
     * @package
     */
    constructor(result) {
        Object.assign(this, result)
        if (result.estimatedBuyingAmount && result.directTrade) {
            const profit = toStroops(result.estimatedBuyingAmount) - toStroops(result.directTrade.buying)
            if (profit > 0) {
                this.profit = fromStroops(profit)
            }
        }
        this.ts = new Date()
    }

    /**
     * Quote timestamp
     * @type {Date}
     * @readonly
     */
    ts
    /**
     * Quote status code
     * @type {QuoteResultStatus}
     * @readonly
     */
    status
    /**
     * Asset to sell
     * @type {string}
     * @readonly
     */
    sellingAsset
    /**
     * Asset to buy
     * @type {string}
     * @readonly
     */
    buyingAsset
    /**
     * Swap slippage tolerance
     * @type {number}
     * @readonly
     */
    slippageTolerance
    /**
     * Amount of the selling asset
     * @type {string}
     * @readonly
     */
    sellingAmount
    /**
     * Estimated amount of buyingAsset to receive
     * @type {string}
     * @readonly
     */
    estimatedBuyingAmount
    /**
     * Equivalent direct path_payment trade estimate
     * @type {QuoteDirectTradeResult}
     * @readonly
     */
    directTrade
    /**
     * Difference between quoted price and estimated direct trade
     * @type {string}
     * @readonly
     */
    profit = '0'
    /**
     * Error details from the server (for rejected quote requests)
     * @type {string}
     * @readonly
     */
    error
}
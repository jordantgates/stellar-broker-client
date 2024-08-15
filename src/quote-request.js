import {StrKey} from '@stellar/stellar-base'
import errors from './errors.js'

/**
 * @typedef {object} SwapQuoteParams
 * @property {string} sellingAsset - Asset to sell
 * @property {string} buyingAsset - Asset to buy
 * @property {string} [sellingAmount] - Amount of selling asset
 * @property {string} [buyingAmount] - Amount of buying asset
 * @property {number} [slippageTolerance] - Swap slippage tolerance (0.02 by default - 2%)
 * @property {string} [destination] - Trader account address
 */

/**
 * @param {SwapQuoteParams} params
 * @return {SwapQuoteParams}
 */
export function validateQuoteRequest(params) {
    const {
        destination, sellingAsset, selling_asset, buyingAsset, buying_asset, sellingAmount, selling_amount,
        buyingAmount, buying_amount, slippageTolerance, slippage_tolerance, ...other
    } = params
    const res = {
        sellingAsset: parseAsset(sellingAsset || selling_asset, 'sellingAsset'),
        buyingAsset: parseAsset(buyingAsset || buying_asset, 'buyingAsset'),
        sellingAmount: parseAmount(sellingAmount || selling_amount, 'sellingAmount'),
        buyingAmount: parseAmount(buyingAmount || buying_amount, 'buyingAmount'),
        slippageTolerance: parseSlippageTolerance(slippageTolerance || slippage_tolerance || 0.02, 'slippageTolerance'),
        flow: 'direct'
    }
    if (destination) {
        res.destination = validateAccount(destination, 'destination', true)
    }
    if (res.buyingAsset === res.sellingAsset)
        throw errors.invalidQuoteParam('buyingAsset', 'Buying asset can\'t be the same as selling asset')
    if (res.buyingAmount === undefined && res.sellingAmount === undefined)
        throw errors.invalidQuoteParam('sellingAmount', 'Either "buyingAmount" or "sellingAmount" parameter is required')
    if (res.buyingAmount !== undefined && res.sellingAmount !== undefined)
        throw errors.invalidQuoteParam('sellingAmount', 'Parameters "buyingAmount" and "sellingAmount" are mutually exclusive')
    Object.assign(res, other) //add remaining optional params
    return res
}

function parseAsset(asset, parameter) {
    if (typeof asset === 'string') {
        if (asset === 'XLM' || asset === 'xlm' || asset === 'native')
            return 'XLM'
        if (asset.includes(':')) {
            const [code, issuer] = asset.split(':')
            validateCode(code)
            validateAccount(issuer, parameter)
            return code + '-' + issuer
        }
        if (asset.includes('-')) {
            const [code, issuer] = asset.split('-')
            validateCode(code)
            validateAccount(issuer, parameter)
            return asset
        }
    }
    throw errors.invalidQuoteParam(parameter, 'Invalid asset')
}

function validateCode(code, parameter) {
    if (!/^[a-zA-Z0-9]{1,12}$/.test(code))
        throw errors.invalidQuoteParam(parameter, 'Invalid asset code: ' + (code === undefined ? 'missing' : code))
    return code
}

function validateAccount(account, param, optional = false) {
    if (account === undefined && optional)
        return undefined
    if (!StrKey.isValidEd25519PublicKey(account))
        throw errors.invalidQuoteParam(param, 'Invalid account address: ' + (account === undefined ? 'missing' : account))
    return account
}

function parseAmount(amount, parameter) {
    if (amount === undefined)
        return undefined
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0)
        throw errors.invalidQuoteParam(parameter, 'Invalid asset amount: ' + amount)
    return amount
}

function parseSlippageTolerance(src, parameter) {
    const tolerance = parseFloat(src)
    if (isNaN(tolerance))
        throw errors.invalidQuoteParam(parameter, 'Invalid slippage tolerance, number expected')
    if (tolerance < 0)
        throw errors.invalidQuoteParam(parameter, 'Slippage tolerance is too small, expected value >= 0')
    if (tolerance > 0.5)
        throw errors.invalidQuoteParam(parameter, 'Slippage tolerance is too large, expected value < 0.5 (50%)')
    return tolerance
}
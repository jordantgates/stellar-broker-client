import {Networks, TransactionBuilder, Keypair, FeeBumpTransaction, StrKey} from '@stellar/stellar-base'
import errors from './errors.js'
import {buildEvent} from './events.js'
import {validateQuoteRequest} from './quote-request.js'
import {estimateSwap} from './estimate.js'

export default class StellarBrokerClient {
    /**
     * @param {ClientInitializationParams} params
     */
    constructor(params) {
        this.partnerKey = params.partnerKey
        this.emitter = new EventTarget()
        this.network = Networks[(params.network || 'PUBLIC').toUpperCase()] || params.network
        this.flow = params.flow || 'direct'
    }

    /**
     * @type {ClientStatus}
     * @readonly
     */
    status = 'disconnected'
    /**
     * @type {WebSocket}
     * @private
     */
    socket
    /**
     * @type {EventTarget}
     * @private
     */
    emitter
    /**
     * @type {string}
     * @private
     */
    origin = 'https://api.stellar.broker'
    /**
     * Stellar network passphrase
     * @type {string}
     * @readonly
     */
    network = ''
    /**
     * Last quote request submitted by the client
     * @type {SwapQuoteParams}
     * @readonly
     */
    quoteRequest
    /**
     * Last quote received from the sever
     * @type {SwapQuoteResult}
     * @readonly
     */
    lastQuote
    /**
     * Current quote accepted for the trading
     * @private
     */
    tradeQuote
    /**
     * API key of the partner
     * @type {string}
     * @readonly
     */
    partnerKey
    /**
     * Account secret key (for direct swap flow)
     * @type {Keypair|ClientAuthorizationCallback}
     * @private
     */
    authorization

    /**
     * Trader account public key
     * @type {string}
     * @readonly
     */
    source

    /**
     * Connect to the StellarBroker server
     * @return {Promise<StellarBrokerClient>}
     */
    connect() {
        if (this.socket?.readyState === WebSocket.OPEN)
            return Promise.resolve(this) //already opened

        this.socket = new WebSocket(this.origin + '/ws?partner=' + encodeURIComponent(this.partnerKey))
        this.socket.onmessage = this.processMessage.bind(this)
        this.socket.onclose = () => {
            console.log('Connection closed')
            this.status = 'disconnected'
        }

        this.socket.onerror = e => console.error(e)

        return new Promise((confirm, reject) => { //TODO: use 'once'
            const expirationTimeout = setTimeout(() => reject(this), 2000) // 2s timeout
            this.onSocketOpen = () => {
                this.status = 'ready'
                this.heartbeat()
                this.onSocketOpen = undefined
                clearTimeout(expirationTimeout)
                confirm(this)
            }
        })
    }

    /**
     * Process incoming message
     * @param message
     * @private
     */
    processMessage(message) {
        const raw = JSON.parse(message.data)
        switch (raw.type) {
            case 'connected':
                if (this.onSocketOpen) {
                    this.onSocketOpen()
                }
                break
            case 'quote':
                this.lastQuote = raw.quote
                this.lastQuote.ts = new Date()
                //send event to the client app
                this.emitter.dispatchEvent(buildEvent('quote', this.lastQuote))
                break
            case 'tx':
                if (this.status !== 'trade') {
                    console.log('Received tx in non-trading state', this.status, raw)
                    return //skip unless trading is in progress
                }
                this.processTxRequest(raw)
                break
            case 'stop':
                this.emitter.dispatchEvent(buildEvent('finished', {
                    status: raw.status,
                    sold: raw.sold,
                    bought: raw.bought
                }, 'result'))
                this.status = 'ready'
                this.tradeQuote = undefined
                this.source = undefined
                break
            case 'progress':
                this.emitter.dispatchEvent(buildEvent('progress', {
                    sold: raw.sold,
                    bought: raw.bought
                }, 'status'))
                break
            case 'ping':
                this.heartbeat()
                this.send({type: 'pong'})
                break
            case 'error':
                this.stop()
                this.emitter.dispatchEvent(buildEvent('error', 'Server error: ' + raw.error))
                break
            default:
                console.log('Unknown message type: ' + raw.type)
                break
        }
    }

    /**
     * Request swap quote
     * @param {SwapQuoteParams} params - Quote parameters
     */
    quote(params) {
        if (this.status === 'trade')
            throw errors.tradeInProgress()
        this.quoteRequest = validateQuoteRequest(params)
        this.status = 'quote'
        this.connect()
            .then(() => {
                this.send({
                    type: 'quote',
                    ...this.quoteRequest
                })
            })
    }

    /**
     * Stop quotation/trading
     */
    stop() {
        if (this.status !== 'trade' && this.status !== 'quote')
            return
        this.send({
            type: 'stop'
        })
        this.tradeQuote = undefined
        this.source = undefined
        this.status = 'ready'
    }

    /**
     * Confirm current quote and start trading
     * @param {string} account - Trader account address
     * @param {string|ClientAuthorizationCallback} authorization - Authorization method, either account secret key or an authorization callback
     */
    confirmQuote(account, authorization) {
        if (this.status !== 'quote')
            throw errors.tradeInProgress()
        if (!this.lastQuote)
            throw errors.quoteNotSet()
        if ((new Date() - this.lastQuote.ts) > 7000) //do not allow stale quotes quoted more than 7s ago
            throw errors.quoteExpired()
        if (this.lastQuote.status !== 'success')
            throw errors.quoteError(this.lastQuote.error || 'quote not available')
        if (!account || !StrKey.isValidEd25519PublicKey(account))
            throw errors.invalidQuoteParam('account', 'Invalid trader account address: ' + (!account ? 'missing' : account))
        if (typeof authorization === 'string') {
            try {
                this.authorization = Keypair.fromSecret(authorization)
            } catch (e) {
                throw errors.invalidAuthorizationParam()
            }
        } else if (typeof authorization === 'function') {
            this.authorization = authorization
        }
        this.tradeQuote = this.lastQuote
        this.source = account
        this.send({
            type: 'trade',
            account
        })
        this.status = 'trade'
    }

    /**
     * @param {{xdr: string, hash: string}} raw
     * @private
     */
    processTxRequest(raw) {
        //parse incoming transaction
        let tx
        try {
            tx = TransactionBuilder.fromXDR(raw.xdr, this.network)
        } catch (e) {
            throw errors.invalidSwapTx()
        }
        //check that transaction is correct
        if (!this.validateTransaction(tx))
            throw errors.invalidSwapTx()
        //sign transaction
        this.authorizeTx(tx, raw.networkFee)
            .then(tx => {
                if (!tx || tx.signatures.length < 1)
                    return console.error(`Transaction ${raw.hash} not signed`)
                //respond with signed transaction
                this.send({
                    type: 'tx',
                    hash: raw.hash,
                    xdr: tx.toXDR()
                })
            })
            .catch(e => {
                console.error(e)
                throw errors.failedToSignTx()
            })
    }

    /**
     * @param {Transaction} tx
     * @param {string} networkFee
     * @return {Promise<FeeBumpTransaction>}
     * @private
     */
    async authorizeTx(tx, networkFee) {
        //sign tx
        if (this.authorization instanceof Keypair) {
            tx.sign(this.authorization)
        } else {
            tx = await ensurePromise(this.authorization(tx))
        }
        //wrap with fee bump
        let wrapped = TransactionBuilder.buildFeeBumpTransaction(this.source, networkFee, tx, this.network)
        //sign fee bump wrapper tx
        if (this.authorization instanceof Keypair) {
            wrapped.sign(this.authorization)
        } else {
            wrapped = await ensurePromise(this.authorization(wrapped))
        }
        return wrapped
    }

    /**
     * @param {Transaction} tx
     * @throws {StellarBrokerError} Invalid swap transaction received
     */
    validateTransaction(tx) {
        /*if (!(tx instanceof FeeBumpTransaction))
            return false
        const {innerTransaction} = tx
        if (tx.feeSource !== this.source)
            return false*/
        for (let swap of tx.operations) {
            if (swap.type !== 'pathPaymentStrictSend' && swap.type !== 'pathPaymentStrictReceive')
                return false
            const isFee = swap.destination !== this.source
            if (isFee) {
                if (swap.type !== 'pathPaymentStrictSend')
                    return false
                if ((swap.source && swap.source !== this.source))
                    return false
            } else {
                if ((swap.source && swap.source !== swap.destination) || swap.destination !== this.source)
                    return false
            }
        }
        //TODO: check assets and amounts
        return true
    }

    /**
     * @param {{}} data
     * @private
     */
    send(data) {
        this.socket.send(JSON.stringify(data))
    }

    heartbeat() {
        clearTimeout(this.pingHandler)
        this.pingHandler = setTimeout(() => {
            console.warn('Lost connection with the server')
            this.socket.close()
        }, 11_000) // 11 seconds heartbeat timeout
    }

    /**
     * Add event listener
     * @param {StellarBrokerClientEvent} type
     * @param {function} callback
     */
    on(type, callback) {
        if (!StellarBrokerEvents.includes(type))
            throw errors.unsupportedEventType(type)
        this.emitter.addEventListener(type, callback)
    }

    /**
     * Add event listener that will be executed once
     * @param {StellarBrokerClientEvent} type
     * @param {function} callback
     */
    once(type, callback) {
        if (!StellarBrokerEvents.includes(type))
            throw errors.unsupportedEventType(type)
        this.emitter.addEventListener(type, callback, {once: true})
    }

    /**
     * Remove event listener
     * @param {StellarBrokerClientEvent} type
     * @param {function} callback
     */
    off(type, callback) {
        if (!StellarBrokerEvents.includes(type))
            throw errors.unsupportedEventType(type)
        this.emitter.removeEventListener(type, callback)
    }

    /**
     * Close underlying connection and finalize the client
     */
    close() {
        try {
            this.socket.close()
        } catch (e) {
        }
    }

    /**
     * Request single swap quote estimate without trading
     * @param {SwapQuoteParams} params - Quote parameters
     * @return {Promise<SwapQuoteResult>}
     */
    static estimateSwap(params) {
        return estimateSwap(params)
    }
}

export const StellarBrokerEvents = ['quote', 'finished', 'progress', 'error']

function ensurePromise(callResult) {
    if (!callResult instanceof Promise) {
        if (callResult)
            return Promise.resolve(callResult)
        return Promise.reject()
    }
    return callResult
}

/**
 * @typedef {object} ClientInitializationParams
 * @property {string} [network] - Stellar network identifier or passphrase
 * @property {string} [partnerKey] - Partner key
 * @property {SwapFlowMode} [flow] - Swap flow mode
 */

/**
 * @typedef {'disconnected'|'ready'|'quote'|'trade'} ClientStatus
 */

/**
 * @typedef {'quote'|'finished'|'progress'|'error'} StellarBrokerClientEvent
 */

/**
 * @typedef {'direct'} SwapFlowMode
 */

/**
 * @typedef {object} SwapQuoteResult
 * @property {string} sellingAsset
 * @property {string} buyingAsset
 * @property {number} slippageTolerance
 * @property {string} destination
 * @property {number} ledger
 * @property {string} [sellingAmount]
 * @property {string} [estimatedBuyingAmount]
 * @property {string} [buyingAmount]
 * @property {string} [estimatedSellingAmount]
 * @property {{selling: string, buying: string, path: string[]}} [directTrade]
 */

/**
 * @typedef {function(FeeBumpTransaction):Promise<FeeBumpTransaction>} ClientAuthorizationCallback
 */
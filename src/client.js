import {Networks, StrKey} from '@stellar/stellar-sdk'
import errors from './errors.js'
import {buildEvent} from './events.js'
import {processTxRequest} from './tx-processor.js'
import {validateQuoteRequest} from './quote-request.js'
import {QuoteResult} from './quote-result.js'
import {AuthorizationWrapper} from './authorization.js'

/**
 * Client for StellarBroker service
 */
export class StellarBrokerClient {
    /**
     * @param {ClientInitializationParams} params
     */
    constructor(params) {
        this.partnerKey = params.partnerKey
        this.emitter = new EventTarget()
        this.network = Networks.PUBLIC
        this.trader = params.account
        if (params.authorization) {
            this.authorization = new AuthorizationWrapper(params.authorization)
        }
    }

    /**
     * @type {string}
     * @private
     */
    uid
    /**
     * @type {ClientSessionStatus}
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
     * @type {QuoteParams}
     * @readonly
     */
    quoteRequest
    /**
     * Last quote received from the sever
     * @type {QuoteResult}
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
     * Account secret key or authorization callback
     * @type {AuthorizationWrapper}
     * @private
     */
    authorization
    /**
     * Trader account public key
     * @type {string}
     * @readonly
     */
    trader

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
            if (this.status !== 'disconnected') {
                this.status = 'disconnected'
                this.notifyError(errors.notConnected())
            }
            console.log('Connection closed')
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
                this.uid = raw.uid
                if (this.onSocketOpen) {
                    this.onSocketOpen()
                }
                if (this.status === 'disconnected') {
                    this.status = 'ready'
                }
                break
            case 'quote':
                this.lastQuote = new QuoteResult(raw.quote)
                //send event to the client app
                this.emitter.dispatchEvent(buildEvent('quote', this.lastQuote))
                break
            case 'paused':
                //quotation paused due to inactivity
                this.emitter.dispatchEvent(buildEvent('paused', {}))
                break
            case 'tx':
                if (this.status !== 'trade') {
                    console.log('Received tx in a non-trading state', this.status, raw)
                    return //skip unless trading is in progress
                }
                processTxRequest(this, raw)
                    .then(xdr => {
                        this.send({
                            type: 'tx',
                            hash: raw.hash,
                            xdr
                        })
                    })
                    .catch(e => this.notifyError(e))
                break
            case 'stop':
                this.emitter.dispatchEvent(buildEvent('finished', {
                    status: raw.status,
                    sold: raw.sold,
                    bought: raw.bought
                }, 'result'))
                this.status = 'ready'
                this.tradeQuote = undefined
                break
            case 'progress':
                this.emitter.dispatchEvent(buildEvent('progress', {
                    sold: raw.sold,
                    bought: raw.bought
                }, 'status'))
                break
            case 'ping':
                if (raw.uid === this.uid) {
                    this.heartbeat()
                    this.send({type: 'pong', uid: this.uid})
                }
                break
            case 'error':
                this.stop()
                this.notifyError(raw.error)
                break
            default:
                console.log('Unknown message type: ' + raw.type)
                break
        }
    }

    /**
     * Request swap quote
     * @param {QuoteParams} params - Quote parameters
     */
    quote(params) {
        if (this.status === 'trade')
            throw errors.tradeInProgress()
        this.quoteRequest = validateQuoteRequest(params)

        this.status = 'quote'
        this.connect()
            .then(() => {
                this.status = 'quote'
                this.send({
                    type: 'quote',
                    ...this.quoteRequest
                })
            })
    }

    /**
     * Confirm current quote and start trading
     * @param {string} [account] - Trader account address (overrides value provided in the constructor)
     * @param {ClientAuthorizationParams} [authorization] - Authorization params (overrides value provided in the constructor)
     */
    confirmQuote(account, authorization) {
        if (this.status === 'disconnected')
            throw errors.notConnected()
        if (this.status === 'trade')
            throw errors.tradeInProgress()
        if (this.status !== 'quote' || !this.lastQuote)
            throw errors.quoteNotSet()
        if ((new Date() - this.lastQuote.ts) > 10_000) //do not allow stale quotes quoted more than 10s ago
            throw errors.quoteExpired()
        if (this.lastQuote.status !== 'success')
            throw errors.quoteError(this.lastQuote.error || 'quote not available')
        if (account) {
            this.trader = account
        }
        if (authorization) {
            this.authorization = new AuthorizationWrapper(authorization)
        }
        const {trader} = this
        if (!trader || !StrKey.isValidEd25519PublicKey(trader)) //ensure that a trader account address provided
            throw errors.invalidQuoteParam('account', 'Invalid trader account address: ' + (!trader ? 'missing' : trader))
        if (!this.authorization)
            throw errors.invalidQuoteParam('authorization', 'Client authorization not provided')
        this.tradeQuote = this.lastQuote
        this.send({
            type: 'trade',
            account: trader
        })
        this.status = 'trade'
    }

    /**
     * Stop quotation/trading
     */
    stop() {
        if (this.status !== 'trade' && this.status !== 'quote')
            return
        this.send({type: 'stop'})
        this.tradeQuote = undefined
        this.status = 'ready'
    }

    /**
     * @param {{}} data
     * @private
     */
    send(data) {
        this.socket.send(JSON.stringify(data))
    }

    /**
     * @private
     */
    heartbeat() {
        clearTimeout(this.pingHandler)
        this.pingHandler = setTimeout(() => {
            console.warn('Lost connection with the server')
            this.socket.close()
        }, 7_000) // 7 seconds heartbeat timeout
    }

    /**
     * Add event listener
     * @param {StellarBrokerClientEvent} type
     * @param {function} callback
     */
    on(type, callback) {
        validateEventType(type)
        this.emitter.addEventListener(type, callback)
    }

    /**
     * Add event listener that will be executed once
     * @param {StellarBrokerClientEvent} type
     * @param {function} callback
     */
    once(type, callback) {
        validateEventType(type)
        this.emitter.addEventListener(type, callback, {once: true})
    }

    /**
     * Remove event listener
     * @param {StellarBrokerClientEvent} type
     * @param {function} callback
     */
    off(type, callback) {
        validateEventType(type)
        this.emitter.removeEventListener(type, callback)
    }

    /**
     * Close underlying connection and finalize the client
     */
    close() {
        try {
            //TODO: remove all attached event listeners
            this.status = 'disconnected'
            this.socket.close()
        } catch (e) {
        }
    }

    /**
     * @param {Error} e
     * @private
     */
    notifyError(e) {
        console.error(e)
        try {
            this.emitter.dispatchEvent(buildEvent('error', e instanceof Error ? e.message : e))
        } catch (e) {
            console.error(e)
        }
    }
}

const stellarBrokerEvents = new Set(['quote', 'paused', 'progress', 'finished', 'error'])

function validateEventType(type) {
    if (!stellarBrokerEvents.has(type))
        throw errors.unsupportedEventType(type)
}

/**
 * @typedef {object} ClientInitializationParams
 * @property {string} [partnerKey] - Partner key
 * @property {string} [account] - Trader account address
 * @property {ClientAuthorizationParams} [authorization] - Authorization method, either account secret key or an authorization callback
 */

/**
 * @typedef {'disconnected'|'ready'|'quote'|'trade'} ClientSessionStatus - Current client session status
 */

/**
 * @typedef {'quote'|'paused'|'progress'|'finished'|'error'} StellarBrokerClientEvent - Event type generated by the client
 */

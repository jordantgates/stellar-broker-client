export class StellarBrokerError extends Error {
    constructor(code, message) {
        super(message)
        this.code = code
    }

    /**
     * Numeric error code
     * @type {number}
     * @readonly
     */
    code = 0
}

const errors = {
    invalidInitParam(param) {
        return new StellarBrokerError(1, `Invalid parameter value: "${param}"`)
    },
    invalidAuthorizationParam() {
        return new StellarBrokerError(2, 'Invalid authorization secret key or callback provided')
    },
    quoteNotSet() {
        return new StellarBrokerError(11, 'Price quote not available')
    },
    quoteExpired() {
        return new StellarBrokerError(12, 'Price quote expired')
    },
    quoteError(message) {
        return new StellarBrokerError(13, 'Price quotation error: ' + message)
    },
    invalidQuoteParam(invalidParamName, details) {
        return new StellarBrokerError(14, `Invalid quote request parameter: "${invalidParamName}". ${details}`)
    },
    tradeInProgress() {
        return new StellarBrokerError(20, 'Cannot change quote while trade is in progress')
    },
    invalidSwapTx() {
        return new StellarBrokerError(21, 'Invalid swap transaction received')
    },
    failedToSignTx() {
        return new StellarBrokerError(22, 'Failed to sign received transaction')
    },
    unsupportedEventType(type) {
        return new StellarBrokerError(31, 'Unknown event type: ' + type)
    },
    serverError(message) {
        return new StellarBrokerError(101, 'Server error: ' + message)
    }
}

export default errors
import {Asset, FeeBumpTransaction, TransactionI} from "@stellar/stellar-sdk";

/**
 * Client for StellarBroker service
 */
export default class StellarBrokerClient {
    /**
     * @param {ClientInitializationParams} params
     */
    constructor(params: ClientInitializationParams);

    /**
     * Trader account public key
     * @type {string}
     */
    readonly trader: string;
    /**
     * Stellar network passphrase
     * @type {string}
     */
    readonly network: string;
    /**
     * @type {ClientStatus}
     */
    readonly status: ClientStatus;

    /**
     * Connect to the StellarBroker server
     * @return {Promise<StellarBrokerClient>}
     */
    connect(): Promise<StellarBrokerClient>;

    /**
     * Request swap quote
     * @param {SwapQuoteParams} params - Quote parameters
     */
    quote(params: SwapQuoteParams): void;

    /**
     * Stop quotation/trading
     */
    stop(): void;

    /**
     * Confirm current quote and start trading
     */
    confirmQuote(): void;

    /**
     * Add event listener
     * @param {StellarBrokerClientEvent} type
     * @param {function} callback
     */
    on(type: StellarBrokerClientEvent, callback: Function): void;

    /**
     * Add event listener that will be executed once
     * @param {StellarBrokerClientEvent} type
     * @param {function} callback
     */
    once(type: StellarBrokerClientEvent, callback: Function): void;

    /**
     * Remove event listener
     * @param {StellarBrokerClientEvent} type
     * @param {function} callback
     */
    off(type: StellarBrokerClientEvent, callback: Function): void;

    /**
     * Close underlying connection and finalize the client
     */
    close(): void;
}

/**
 * Request single swap quote estimate without trading
 */
export function estimateSwap(params: SwapQuoteParams): Promise<SwapQuoteResult>;

export interface SwapQuoteParams {
    /**
     * Asset to sell
     */
    sellingAsset: string
    /**
     * Asset to buy
     */
    buyingAsset: string
    /**
     * Amount of selling asset
     */
    sellingAmount?: string
    /**
     * Swap slippage tolerance (0.02 by default - 2%)
     */
    slippageTolerance?: number
}


export interface ClientInitializationParams {
    /**
     * Trader account address
     */
    account: string;
    /**
     * Partner key
     */
    partnerKey?: string;
    /**
     * Authorization method, either account secret key or an authorization callback
     */
    authorization: ClientAuthorizationParams;
}

export type ClientStatus = "disconnected" | "ready" | "quote" | "trade";

export type StellarBrokerClientEvent = "quote" | "progress" | "paused" | "finished" | "error";

export interface SwapQuoteResult {
    /**
     * Quote timestamp formatted as ISO date
     */
    ts: string,
    /**
     * Asset to sell
     */
    sellingAsset: string;
    /**
     * Asset to buy
     */
    buyingAsset: string;
    /**
     * Swap slippage tolerance
     */
    slippageTolerance: number;
    /**
     * Amount of the selling asset
     */
    sellingAmount: string;
    /**
     * Estimated amount of buyingAsset to receive
     */
    estimatedBuyingAmount?: string;
    /**
     * Equivalent direct path_payment trade estimate
     */
    directTrade?: SwapQuoteDirectTradeResult;
    /**
     * Error details from the server (for failed quotes)
     */
    error?: string;
}

export interface SwapQuoteDirectTradeResult {
    selling: string;
    buying: string;
    path: string[];
}

export class StellarBrokerError extends Error {
    /**
     * Numeric error code
     * @type {number}
     * @readonly
     */
    readonly code: number;
}

/**
 * Async authorization callback for transactions and simulated auth entries
 */
export type ClientAuthorizationCallback = (txOrAuthEntry: TransactionI | Buffer) => Promise<TransactionI | Buffer>;

/**
 * Authorization method, either account secret key or an authorization callback
 */
export type ClientAuthorizationParams = string | ClientAuthorizationCallback;

/**
 * Trader mediator account wrapper
 */
export class Mediator {
    /**
     * Create a trader mediator account instance for a given source account
     * @param source - Source account
     * @param sellingAsset - Asset to sell
     * @param buyingAsset - Asset to buy
     * @param sellingAmount - Amount to sell
     * @param authorization - Authorization callback or secret key
     */
    constructor(source: string, sellingAsset: string | Asset, buyingAsset: string | Asset, sellingAmount: string, authorization: ClientAuthorizationParams)

    readonly source: string;

    readonly sellingAsset: Asset;

    readonly buyingAsset: Asset;

    readonly sellingAmount: bigint;

    readonly mediatorAddress: string;

    /**
     * Check if there are any non-disposed mediators that belong to lost swap sessions
     */
    get hasObsoleteMediators(): boolean;

    /**
     * Retrieve funds from mediator accounts that belong to lost swap sessions
     */
    disposeObsoleteMediators(): Promise<void>;

    /**
     * Create mediator account and deposit tokens to sell
     */
    init(): Promise<string>;

    /**
     * Dispose mediator account
     */
    dispose(address:string): Promise<void>;
}

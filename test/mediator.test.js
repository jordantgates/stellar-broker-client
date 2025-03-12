import {Keypair} from '@stellar/stellar-sdk'
import {Mediator} from '../src/index.js'

describe('mediator', () => {
    const issuer = Keypair.random().publicKey()
    const xlm = 'XLM'
    const aqua = 'AQUA-' + issuer
    const usdc = 'USDC-' + issuer

    beforeAll(() => {
        global.localStorage = new LocalStorageShim()
        Mediator.createHorizon = () => new HorizonShim()
    })

    afterAll(() => {
        global.localStorage = undefined
    })

    afterEach(() => {
        global.localStorage.clear()
        HorizonShim.clear()
    })

    test('init & dispose XLM->AQUA', async () => {
        const sourceKeypair = Keypair.random()
        const source = sourceKeypair.publicKey()
        HorizonShim.setAccountInfo(source, [
            balanceFromAsset(xlm, '5'),
            balanceFromAsset(aqua, '0')
        ])

        const mediator = new Mediator(source, xlm, aqua, '10', sourceKeypair.secret())

        //should have enough XLM to sell + cover fees
        await expect(async () => await mediator.init()).rejects.toThrow(/Insufficient XLM balance/)

        HorizonShim.setAccountInfo(source, [
            balanceFromAsset(xlm, '11'),
            balanceFromAsset(aqua, '0')
        ])
        await expect(async () => await mediator.init()).rejects.toThrow(/Insufficient XLM balance/)

        HorizonShim.setAccountInfo(source, [
            balanceFromAsset(xlm, '100'),
            balanceFromAsset(aqua, '0')
        ])

        await mediator.init()
        let tx = HorizonShim.getLastTx()
        expect(tx.source).toEqual(source)
        expect(tx.operations).toEqual([
            {
                source,
                type: 'createAccount',
                destination: mediator.mediatorAddress,
                startingBalance: '13.0000000'
            },
            {
                source: mediator.mediatorAddress,
                type: 'setOptions',
                masterWeight: 1,
                lowThreshold: 1,
                medThreshold: 1,
                highThreshold: 1,
                homeDomain: 'mediator.stellar.broker',
                signer: {
                    ed25519PublicKey: source,
                    weight: 1
                }
            },
            {
                source: mediator.mediatorAddress,
                type: 'changeTrust',
                line: lineFromAsset(aqua),
                limit: '922337203685.4775807'
            }
        ])
        expect(localStorage[formatLsKey(mediator.mediatorAddress)]).toEqual(source)

        //mediator account should exist on chain
        await expect(async () => await mediator.dispose()).rejects.toThrow(/doesn't exist on the ledger/)

        HorizonShim.setAccountInfo(mediator.mediatorAddress, [
            balanceFromAsset(xlm, '1'),
            balanceFromAsset(aqua, '1000')
        ])
        //mediator should have proper signers
        await expect(async () => await mediator.dispose()).rejects.toThrow(/is not a mediator account for/)

        HorizonShim.setAccountInfo(mediator.mediatorAddress, [
            balanceFromAsset(xlm, '1'),
            balanceFromAsset(aqua, '1000')
        ], [{key: source, weight: 1}])
        await mediator.dispose()

        tx = HorizonShim.getLastTx()

        expect(tx.source).toEqual(mediator.mediatorAddress)
        expect(tx.operations).toEqual([
            {
                source: mediator.mediatorAddress,
                type: 'payment',
                destination: source,
                asset: lineFromAsset(aqua),
                amount: '1000.0000000'
            },
            {
                source: mediator.mediatorAddress,
                type: 'changeTrust',
                line: lineFromAsset(aqua),
                limit: '0.0000000'
            },
            {
                source: mediator.mediatorAddress,
                type: 'accountMerge',
                destination: source
            }
        ])

        expect(localStorage[formatLsKey(mediator.mediatorAddress)]).toEqual(undefined)
    })

    test('init & dispose USDC->XLM', async () => {
        const sourceKeypair = Keypair.random()
        const source = sourceKeypair.publicKey()
        HorizonShim.setAccountInfo(source, [
            balanceFromAsset(xlm, '5'),
            balanceFromAsset(usdc, '10')
        ])

        const mediator = new Mediator(source, usdc, xlm, '10', sourceKeypair.secret())

        await mediator.init()
        let tx = HorizonShim.getLastTx()
        expect(tx.source).toEqual(source)
        expect(tx.operations).toEqual([
            {
                source,
                type: 'createAccount',
                destination: mediator.mediatorAddress,
                startingBalance: '3.0000000'
            },
            {
                source: mediator.mediatorAddress,
                type: 'changeTrust',
                line: lineFromAsset(usdc),
                limit: '922337203685.4775807'
            },
            {
                source: source,
                type: 'payment',
                destination: mediator.mediatorAddress,
                asset: lineFromAsset(usdc),
                amount: '10.0000000'
            },
            {
                source: mediator.mediatorAddress,
                type: 'setOptions',
                masterWeight: 1,
                lowThreshold: 1,
                medThreshold: 1,
                highThreshold: 1,
                homeDomain: 'mediator.stellar.broker',
                signer: {
                    ed25519PublicKey: source,
                    weight: 1
                }
            }
        ])
        expect(localStorage[formatLsKey(mediator.mediatorAddress)]).toEqual(source)

        HorizonShim.setAccountInfo(mediator.mediatorAddress, [
            balanceFromAsset(xlm, '20'),
            balanceFromAsset(usdc, '0')
        ], [{key: source, weight: 1}])

        await mediator.dispose()

        tx = HorizonShim.getLastTx()

        expect(tx.source).toEqual(mediator.mediatorAddress)
        expect(tx.operations).toEqual([
            {
                source: mediator.mediatorAddress,
                type: 'changeTrust',
                line: lineFromAsset(usdc),
                limit: '0.0000000'
            },
            {
                source: mediator.mediatorAddress,
                type: 'accountMerge',
                destination: source
            }
        ])

        expect(localStorage[formatLsKey(mediator.mediatorAddress)]).toEqual(undefined)
    })

    test('init & dispose USDC->AQUA', async () => {
        const sourceKeypair = Keypair.random()
        const source = sourceKeypair.publicKey()
        HorizonShim.setAccountInfo(source, [
            balanceFromAsset(xlm, '10'),
            balanceFromAsset(aqua, '0')
        ])

        const mediator = new Mediator(source, usdc, aqua, '10', sourceKeypair.secret())

        //should have enough tokens to sell
        await expect(async () => await mediator.init()).rejects.toThrow(/Insufficient selling asset balance/)

        HorizonShim.setAccountInfo(source, [
            balanceFromAsset(xlm, '10'),
            balanceFromAsset(usdc, '10'),
            balanceFromAsset(aqua, '0')
        ])
        await mediator.init()
        let tx = HorizonShim.getLastTx()
        expect(tx.source).toEqual(source)
        expect(tx.operations).toEqual([
            {
                source,
                type: 'createAccount',
                destination: mediator.mediatorAddress,
                startingBalance: '3.5000000'
            },
            {
                source: mediator.mediatorAddress,
                type: 'changeTrust',
                line: lineFromAsset(usdc),
                limit: '922337203685.4775807'
            },
            {
                source: source,
                type: 'payment',
                destination: mediator.mediatorAddress,
                asset: lineFromAsset(usdc),
                amount: '10.0000000'
            },
            {
                source: mediator.mediatorAddress,
                type: 'setOptions',
                masterWeight: 1,
                lowThreshold: 1,
                medThreshold: 1,
                highThreshold: 1,
                homeDomain: 'mediator.stellar.broker',
                signer: {
                    ed25519PublicKey: source,
                    weight: 1
                }
            },
            {
                source: mediator.mediatorAddress,
                type: 'changeTrust',
                line: lineFromAsset(aqua),
                limit: '922337203685.4775807'
            }
        ])
        expect(localStorage[formatLsKey(mediator.mediatorAddress)]).toEqual(source)

        HorizonShim.setAccountInfo(mediator.mediatorAddress, [
            balanceFromAsset(xlm, '1'),
            balanceFromAsset(usdc, '0'),
            balanceFromAsset(aqua, '1000')
        ], [{key: source, weight: 1}])
        await mediator.dispose()

        tx = HorizonShim.getLastTx()

        expect(tx.source).toEqual(mediator.mediatorAddress)
        expect(tx.operations).toEqual([
            {
                source: mediator.mediatorAddress,
                type: 'changeTrust',
                line: lineFromAsset(usdc),
                limit: '0.0000000'
            },
            {
                source: mediator.mediatorAddress,
                type: 'payment',
                destination: source,
                asset: lineFromAsset(aqua),
                amount: '1000.0000000'
            },
            {
                source: mediator.mediatorAddress,
                type: 'changeTrust',
                line: lineFromAsset(aqua),
                limit: '0.0000000'
            },
            {
                source: mediator.mediatorAddress,
                type: 'accountMerge',
                destination: source
            }
        ])

        expect(localStorage[formatLsKey(mediator.mediatorAddress)]).toEqual(undefined)
    })

    test('init & dispose multisig', async () => {
        const sourceKeypair = Keypair.random()
        const source = sourceKeypair.publicKey()
        const signer1 = Keypair.random().publicKey()
        const signer2 = Keypair.random().publicKey()
        HorizonShim.setAccountInfo(source,
            [balanceFromAsset(xlm, '10'), balanceFromAsset(usdc, '10')],
            [HorizonShim.signer(source, 0), HorizonShim.signer(signer1, 2), HorizonShim.signer(signer2, 2)],
            [2, 3, 4])

        const mediator = new Mediator(source, usdc, xlm, '10', sourceKeypair.secret())

        await mediator.init()
        let tx = HorizonShim.getLastTx()
        expect(tx.source).toEqual(source)
        expect(tx.operations).toEqual([
            {
                source,
                type: 'createAccount',
                destination: mediator.mediatorAddress,
                startingBalance: '4.0000000'
            },
            {
                source: mediator.mediatorAddress,
                type: 'changeTrust',
                line: lineFromAsset(usdc),
                limit: '922337203685.4775807'
            },
            {
                source: source,
                type: 'payment',
                destination: mediator.mediatorAddress,
                asset: lineFromAsset(usdc),
                amount: '10.0000000'
            },
            {
                source: mediator.mediatorAddress,
                type: 'setOptions',
                masterWeight: 4,
                lowThreshold: 2,
                medThreshold: 3,
                highThreshold: 4,
                homeDomain: 'mediator.stellar.broker',
                inflationDest: source,
                signer: {
                    ed25519PublicKey: source,
                    weight: 1
                }
            },
            {
                source: mediator.mediatorAddress,
                type: 'setOptions',
                signer: {
                    ed25519PublicKey: signer1,
                    weight: 2
                }
            },
            {
                source: mediator.mediatorAddress,
                type: 'setOptions',
                signer: {
                    ed25519PublicKey: signer2,
                    weight: 2
                }
            }
        ])
        expect(localStorage[formatLsKey(mediator.mediatorAddress)]).toEqual(source)

        HorizonShim.setAccountInfo(mediator.mediatorAddress, [
            balanceFromAsset(xlm, '20'),
            balanceFromAsset(usdc, '0')
        ], [{key: source, weight: 1}, {key: signer1, weight: 2}, {key: signer2, weight: 2}])

        await mediator.dispose()

        tx = HorizonShim.getLastTx()

        expect(tx.source).toEqual(mediator.mediatorAddress)
        expect(tx.operations).toEqual([
            {
                source: mediator.mediatorAddress,
                type: 'changeTrust',
                line: lineFromAsset(usdc),
                limit: '0.0000000'
            },
            {
                source: mediator.mediatorAddress,
                type: 'accountMerge',
                destination: source
            }
        ])

        expect(localStorage[formatLsKey(mediator.mediatorAddress)]).toEqual(undefined)
    })

    test('dispose obsolete', async () => {
        const sourceKeypair = Keypair.random()
        const source = sourceKeypair.publicKey()
        HorizonShim.setAccountInfo(source, [
            balanceFromAsset(xlm, '10'),
            balanceFromAsset(usdc, '10'),
            balanceFromAsset(aqua, '0')
        ])

        const mediator = new Mediator(source, usdc, aqua, '10', sourceKeypair.secret())

        expect(mediator.hasObsoleteMediators).toEqual(false)

        const obsoleteMediators = [Keypair.random().publicKey(), Keypair.random().publicKey()]
        for (let i = 0; i < obsoleteMediators.length; i++) {
            const obsolete = obsoleteMediators[i]
            localStorage.setItem(formatLsKey(obsolete), source)

            HorizonShim.setAccountInfo(obsolete, [
                balanceFromAsset(xlm, '1'),
                balanceFromAsset(aqua, '1000')
            ], [{key: source, weight: 1}])
        }

        expect(mediator.hasObsoleteMediators).toEqual(true)
        expect(HorizonShim.txCount).toEqual(0)

        await mediator.disposeObsoleteMediators()

        expect(mediator.hasObsoleteMediators).toEqual(false)
        expect(HorizonShim.txCount).toEqual(2)
        expect(global.localStorage.count).toEqual(0)
    })

    test('dispose obsolete static', async () => {
        const sourceKeypair = Keypair.random()
        const source = sourceKeypair.publicKey()
        HorizonShim.setAccountInfo(source, [
            balanceFromAsset(xlm, '10'),
            balanceFromAsset(usdc, '10'),
            balanceFromAsset(aqua, '0')
        ])

        expect(Mediator.hasObsoleteMediators(source)).toEqual(false)

        const obsoleteMediators = [Keypair.random().publicKey(), Keypair.random().publicKey()]
        for (let i = 0; i < obsoleteMediators.length; i++) {
            const obsolete = obsoleteMediators[i]
            localStorage.setItem(formatLsKey(obsolete), source)

            HorizonShim.setAccountInfo(obsolete, [
                balanceFromAsset(xlm, '1'),
                balanceFromAsset(aqua, '1000')
            ], [{key: source, weight: 1}])
        }

        expect(Mediator.hasObsoleteMediators(source)).toEqual(true)
        expect(HorizonShim.txCount).toEqual(0)

        await Mediator.disposeObsoleteMediators(source, sourceKeypair.secret())

        expect(Mediator.hasObsoleteMediators(source)).toEqual(false)
        expect(HorizonShim.txCount).toEqual(2)
        expect(global.localStorage.count).toEqual(0)
    })
})

function balanceFromAsset(asset, balance) {
    if (asset === 'XLM')
        return {asset_type: 'native', balance}
    const [asset_code, asset_issuer] = asset.split('-')
    return {asset_type: 'credit_alphanum4', asset_code, asset_issuer, balance}
}

function lineFromAsset(asset) {
    const [code, issuer] = asset.split('-')
    return {code, issuer}
}

function formatLsKey(address) {
    return 'msb_' + address
}

class LocalStorageShim {
    setItem(key, value) {
        this[key] = value
    }

    getItem(key) {
        return this[key]
    }

    removeItem(key) {
        delete this[key]
    }

    clear() {
        for (let key of Object.keys(this)) {
            this.removeItem(key)
        }
    }

    get count() {
        return Object.keys(this).length
    }
}

class HorizonShim {
    async submitTransaction(tx) {
        this.constructor.txHistory.push(tx)
        return {successful: true}
    }

    async loadAccount(address) {
        return this.constructor.accounts[address]
    }

    /**
     * @private
     */
    static accounts = {}

    /**
     * @private
     */
    static txHistory = []

    /**
     * @param {string} address
     * @param {BalanceLine[]} balances
     * @param {AccountSigner[]} [signers]
     * @param {[]} thresholds
     */
    static setAccountInfo(address, balances, signers, thresholds) {
        this.accounts[address] = {
            id: address,
            sequence: '1',
            balances,
            signers: signers || [this.signer(address, 0)],
            thresholds: this.thresholds(thresholds || [0, 0, 0]),
            accountId() {
                return address
            },
            sequenceNumber() {
                return '1'
            },
            incrementSequenceNumber() {
                this.sequence = (1 + this.sequence).toString()
            }
        }
    }

    /**
     * @return {Transaction}
     */
    static getLastTx() {
        return this.txHistory[this.txHistory.length - 1]
    }

    static get txCount() {
        return this.txHistory.length
    }

    static clear() {
        this.txHistory = []
    }

    static signer(key, weight) {
        return {
            key,
            weight,
            type: 'ed25519_public_key'
        }
    }

    static thresholds([low, med, high]) {
        return {
            low_threshold: low,
            med_threshold: med,
            high_threshold: high
        }
    }
}

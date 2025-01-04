# @stellar-broker/client

## Installation

```
npm i @stellar-broker/client
```

## Usage

### Example - connect and trade with StellarBroker

The client connects to the router server, keeps an open connection and constantly receives
price quote updates from the server.

```js
import StellarBrokerClient from '@stellar-broker/client'

//create client instance
const client = new StellarBrokerClient({partnerKey: '<your_partner_key>'})

//subscribe to the quote notifications
client.on('quote', e => {
    console.log('Received route quote from the server', e.quote)
    /*{
      "status": "success",
      "sellingAsset": "USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      "buyingAsset": "XLM",
      "slippageTolerance": 0.5,
      "direction": "strict_send",
      "directTrade": {
          "selling": "10",
          "buying": "100.23505",
          "path": []
      },
      "sellingAmount": "10",
      "estimatedBuyingAmount": "100.688121",
      "ts": "2024-08-13T23:13:21.275Z"
    }*/
})

client.on('paused', e => {
    console.log('Quotation paused due to inactivity. Call `quote` method to resume.')
})

client.on('finished', e => {
    console.log('Trade finished', e.result)
    /*{
      "status": "success",
      "sold": "10",
      "bought": "100.6704597"
    }*/
})

client.on('progress', e => {
    console.log('Progress', e.status)
    /*{
      "sold": "10",
      "bought": "100.6704597"
    }*/
})

client.on('error', e => {
    console.warn('StellarBroker error', e.error)
})

//connect
client.connect() //only once
    .then(() => console.log('StellarBroker connected'))
    .catch(e => console.error(e))

//request a price quote
client.quote({
    sellingAsset: 'xlm',
    buyingAsset: 'USD-GDK2GNB4Q6FKNW2GNJIQFARI4RMSHV5DN5G4BBXX2F24RT5I4QT7TWZ7',
    sellingAmount: '1000', //1000.0000000 XLM
    slippageTolerance: 0.02 //2%
})

//once the quote received from the server, we can confirm the quote
async function signTx(tx) { //async signing callback - implement custom logic here
    const kp = Keypair.fromSecret('<account_secret>')
    tx.sign(kp)
    return tx
}
client.confirmQuote('<account_address>', signTx) //provide trader account address

//trade can be interrupted from the client by calling
client.stop()

//cleanup resources and close connection once the trading has been finished
client.close()
```

### Example - Get swap estimate without trading

Swap estimate may be handy in scenarios when the client has no intention to trade or receive price quote updates in
streaming mode, and just wants to get a single price quote.

```js
import {estimateSwap} from '@stellar-broker/client'

estimateSwap({
    sellingAsset: 'xlm',
    buyingAsset: 'USD-GDK2GNB4Q6FKNW2GNJIQFARI4RMSHV5DN5G4BBXX2F24RT5I4QT7TWZ7',
    sellingAmount: '1000', 
    slippageTolerance: 0.02 //2%
})

```
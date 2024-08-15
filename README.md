# @stellar-broker/client

## Installation

```
npm i @stellar-broker/client
```

## Usage

### Example - Connect and trade in DirectFlow mode

```js
import StellarBrokerClient from '@stellar-broker/client'

//create client instance
const client = new StellarBrokerClient({partnerKey: '<your_partner_key>'})

//subscribe to the quote notifications
client.on('quote', e => {
    console.log('Received quote from the server', e.quote)
    /*
    {
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
    }
    */
})

client.on('finished', e => {
    console.log('Trade finished', e.result)
    /*
    {
      "status": "success",
      "sold": "10",
      "bought": "100.6704597"
    }    
    */
})

client.on('progress', e => {
    console.log('Progress', e.status)
    /*
    {
      "sold": "10",
      "bought": "100.6704597"
    }
    */
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
    destination: '<account_pubkey>', //trader account pubkey
    sellingAsset: 'xlm',
    buyingAsset: 'USD-GDK2GNB4Q6FKNW2GNJIQFARI4RMSHV5DN5G4BBXX2F24RT5I4QT7TWZ7',
    sellingAmount: '1000', //1000.0000000
    slippageTolerance: 0.02 //2%
})

//once the quote received from the server, we can confirm the quote
client.confirmQuote(async (tx) => { //async signing callback - implement custom logic here
    const kp = Keypair.fromSecret('<account_secret>')
    tx.sign(kp)
    return tx
})

//trade can be interrupted from the client by calling
client.stop()

//cleanup resources and close connection once the trading has been finished
client.close()
```
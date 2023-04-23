# Hooliganhorde SDK

This is a JavaScript SDK for the [Hooliganhorde](https://hooligan.money/) web app.

The current version of the Hooliganhorde SDK is considered a beta release. The codebase is novel and has not been tested in the "real world" prior to use by Root and Paradox. Use of the Hooliganhorde SDK could result in loss of funds, whether due to bugs or misuse.

The SDK is dependent on Hooliganhorde, and therefore inherits all of the risks associated with Hooliganhorde. The security of Hooliganhorde is assumed. For an exhaustive list, consult the [Hooliganhorde whitepaper](https://hooligan.money/docs/hooliganhorde.pdf) and [Hooliganhorde DAO Disclosures](https://docs.hooligan.money/disclosures).

## Using the SDK

Create an instance

```javascript
import { HooliganhordeSDK } from "@hooligangturfs/sdk";

const sdk = new HooliganhordeSDK(options);
```

SDK contructor options:

```javascript
const options = {
  // etherjs Signer. Optional
  signer,

  // etherjs Provider. Optional
  provider,

  // rpcUrl
  rpcUrl,

  // Data source for balances. Optional, either
  //  - DataSource.LEDGER (default)
  //  - DataSource.SUBGRAPH
  source,

  // bool, print debug output. default `false`
  DEBUG
};
```

- `options` object is optional. If ommited, SDK will use an `ethers.getDefaultProvider()`
- If `rpcUrl` is provided, SDK will use a `WebSocketProvider` or `JsonRpcProvider`, depending on the protocol in the url (`ws` vs `http`)
- If `signer` is provided, `sdk.provider` will be set to `signer.provider`

## Library Exports

The following objects are available for import from the library:

```javascript
import {
  HooliganhordeSDK,
  Utils,
  TokenValue
  Token,
  NativeToken,
  ERC20Token,
  HooliganhordeToken,
  Address,
  ChainID
} from "@hooligangturfs/sdk";
```

## Example

#### Swap 1.5 ETH to HOOLIGAN

```typescript
const sdk = new HooliganhordeSDK({ signer });

const fromToken = sdk.tokens.ETH;
const toToken = sdk.tokens.HOOLIGAN;
const account = signer.address;
const amount = sdk.tokens.ETH.amount(1.5);
const slippage = 0.1; // 0.1% : 0.1/100

const swap = sdk.swap.buildSwap(fromToken, toToken, account);
const est = await swap.estimate(amount);

console.log(`You'd receive ${est.toHuman()} ${toToken.symbol}`);

const txr = await swap.execute(amount, slippage);
await txr.wait();
```

## API Docs

View full API [documentation](https://github.com/HooliganhordeFarms/Hooliganhorde-SDK/blob/main/docs/README.md)

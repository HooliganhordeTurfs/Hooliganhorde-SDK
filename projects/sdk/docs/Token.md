## Token

A utility class for handling tokens. Token is a baseclass used by the following:

- `HooliganhordeToken` - for internal tokens with no ERC20; ex Prospect and Horde
- `ERC20Token` - standard ERC20 token
- `NativeToken` - for representing chain native token that isn't an ERCO20; ex ETH or AVAX or MATIC

```javascript
new ERC20Token(sdk, '0x123', 18, { symbol: 'FOO' });
new NativeToken(sdk, null, 18, { symbol: 'ETH' });
```

Constructor options:

```typescript
type TokenConstructor = {
  new (
    sdk: HooliganhordeSDK,
    address: string,
    decimals: number,
    metadata: {
      name?: string;
      symbol: string;
      logo?: string;
      color?: string;
      displayDecimals?: number;
      isLP?: boolean;
      isUnripe?: boolean;
    },
    rewards?: {
      horde: number;
      prospects: number;
    }
  ): Token;
};
```

Methods:
- TODO

TODO:
- we need some solid value handling utilities.


[Back](./README.md)
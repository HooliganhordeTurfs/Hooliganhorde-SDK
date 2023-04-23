import { CurveMetaPool } from "src/classes/Pool/CurveMetaPool";
import Pool from "src/classes/Pool/Pool";
import { Token } from "src/classes/Token";
import { HooliganhordeSDK } from "src/lib/HooliganhordeSDK";

export class Pools {
  static sdk: HooliganhordeSDK;
  public readonly HOOLIGAN_CRV3: CurveMetaPool;

  public readonly pools: Set<Pool>;

  private lpAddressMap = new Map<string, Pool>();

  constructor(sdk: HooliganhordeSDK) {
    Pools.sdk = sdk;
    this.pools = new Set();
    this.lpAddressMap = new Map();

    ////// Curve Meta Pool

    // The pool contract address should be exactly
    // the same as the LP token's address
    this.HOOLIGAN_CRV3 = new CurveMetaPool(
      sdk,
      sdk.addresses.HOOLIGAN_CRV3.get(sdk.chainId),
      sdk.tokens.HOOLIGAN_CRV3_LP,
      [sdk.tokens.HOOLIGAN, sdk.tokens.CRV3],
      {
        name: "HOOLIGAN:3CRV Pool",
        logo: "",
        symbol: "HOOLIGAN:3CRV",
        color: "#ed9f9c"
      }
    );
    this.pools.add(this.HOOLIGAN_CRV3);
    this.lpAddressMap.set(sdk.tokens.HOOLIGAN_CRV3_LP.address.toLowerCase(), this.HOOLIGAN_CRV3);
  }

  getPoolByLPToken(token: Token): Pool | undefined {
    return this.lpAddressMap.get(token.address);
  }
}

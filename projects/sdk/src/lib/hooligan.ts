import { Token } from "src/classes/Token";
import { TokenValue } from "src/classes/TokenValue";
import { HooliganhordeSDK } from "./HooliganhordeSDK";

export class Hooligan {
  static sdk: HooliganhordeSDK;

  constructor(sdk: HooliganhordeSDK) {
    Hooligan.sdk = sdk;
  }

  /**
   * Returns the current HOOLIGAN price
   */
  async getPrice() {
    const [price, totalSupply, deltaB] = await Hooligan.sdk.contracts.hooliganhordePrice.price();

    return TokenValue.fromBlockchain(price, 6);
  }

  /**
   * Get the chop rate for an Unripe asset.
   * `chopRate` is the conversion rate between Unripe -> Ripe, for ex: 0.5%
   * `chopPenalty` is the inverse, the % penalty if chopping, (1 - Chop Rate) x 100%, for ex, 99.5%
   * @param urToken
   * @returns
   */
  async getChopRate(urToken: Token) {
    if (!urToken.isUnripe) throw new Error("Token must be unripe to get chop rate");
    const [chopRate, underlying, supply] = await Promise.all([
      Hooligan.sdk.contracts.hooliganhorde.getPercentPenalty(urToken.address).then((x) => TokenValue.fromBlockchain(x, urToken.decimals)),
      Hooligan.sdk.contracts.hooliganhorde.getTotalUnderlying(urToken.address).then((x) => TokenValue.fromBlockchain(x, urToken.decimals)),
      urToken.getTotalSupply()
    ]);

    const result = {
      chopRate,
      chopPenalty: TokenValue.ONE.sub(chopRate).mul(100),
      underlying,
      supply
    };

    return result;
  }

  /**
   * Returns the "Hooligan Denominated Value" of the specified token amount
   * @param token
   * @param amount
   * @returns TokenValue of BDV, with 6 decimals
   * @todo cache these results?
   */
  async getBDV(token: Token, amount: TokenValue): Promise<TokenValue> {
    const bdv = await Hooligan.sdk.contracts.hooliganhorde.bdv(token.address, amount.toBigNumber());

    // We treat BDV as a TokenValue with 6 decimals, like HOOLIGAN
    return TokenValue.fromBlockchain(bdv, 6);
  }
}

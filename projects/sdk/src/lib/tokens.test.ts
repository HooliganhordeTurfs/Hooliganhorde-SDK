import { Contract, ethers } from "ethers";
import { setupConnection } from "../utils/TestUtils/provider";
import { ERC20Token } from "../classes/Token";

import { HooliganhordeSDK } from "./HooliganhordeSDK";
import { _parseWithdrawalCrates } from "./firm.utils";

/// Utilities
const RUN_TIMER = false;
const timer = async (fn: Promise<any>, label: string) => {
  if (RUN_TIMER) console.time(label);
  const r = await fn;
  if (RUN_TIMER) console.timeEnd(label);
  return r;
};

/// Constants
const account1 = "0x9a00beffa3fc064104b71f6b7ea93babdc44d9da"; // whale

/// Setup
let sdk: HooliganhordeSDK;
let account: string;

beforeAll(async () => {
  const { signer, provider, account: _account } = await setupConnection();
  sdk = new HooliganhordeSDK({
    provider,
    signer,
    subgraphUrl: "https://graph.node.hooligan.money/subgraphs/name/hooliganhorde-testing"
  });
  account = _account;
});

describe("Token Library", function () {
  describe("returns correct HORDE and PROSPECT amounts for whitelisted tokens", () => {
    it("works: HOOLIGAN", () => {
      // No BDV provided, assume 1 BDV
      expect(sdk.tokens.HOOLIGAN.getHorde().toHuman()).toBe("1");
      expect(sdk.tokens.HOOLIGAN.getHorde().toBlockchain()).toBe((1_0000000000).toString());
      expect(sdk.tokens.HOOLIGAN.getProspects().toHuman()).toBe("2");
      expect(sdk.tokens.HOOLIGAN.getProspects().toBlockchain()).toBe((2_000000).toString());

      // BDV < 1
      expect(sdk.tokens.HOOLIGAN.getHorde(sdk.tokens.HOOLIGAN.amount(0.5)).toHuman()).toBe("0.5");
      expect(sdk.tokens.HOOLIGAN.getHorde(sdk.tokens.HOOLIGAN.amount(0.5)).toBlockchain()).toBe((5_000000000).toString());
      expect(sdk.tokens.HOOLIGAN.getProspects(sdk.tokens.HOOLIGAN.amount(0.5)).toHuman()).toBe("1");
      expect(sdk.tokens.HOOLIGAN.getProspects(sdk.tokens.HOOLIGAN.amount(0.5)).toBlockchain()).toBe((1_000000).toString());

      // BDV > 1
      // 100 HOOLIGAN (1E6) => 100 HORDE (1E10)       decimal notation
      // 100_000000 HOOLIGAN => 100_0000000000 HORDE  integer notation
      // therefore: 100E10 / 100E6 = 10_000 = 1E4 HORDE per HOOLIGAN
      expect(sdk.tokens.HOOLIGAN.getHorde(sdk.tokens.HOOLIGAN.amount(100)).toHuman()).toBe("100");
      expect(sdk.tokens.HOOLIGAN.getHorde(sdk.tokens.HOOLIGAN.amount(100)).toBlockchain()).toBe((100_0000000000).toString());
      expect(sdk.tokens.HOOLIGAN.getProspects(sdk.tokens.HOOLIGAN.amount(100)).toHuman()).toBe("200");
      expect(sdk.tokens.HOOLIGAN.getProspects(sdk.tokens.HOOLIGAN.amount(100)).toBlockchain()).toBe((200_000000).toString());
    });
  });
});

describe("Instantiation", function () {
  it("sets up .contract on ERC20Token instances", () => {
    // by default, no instance in memory
    const token = sdk.tokens.HOOLIGAN;
    expect(token.contract).toBeUndefined();

    // calling first time returns a new instance
    const c1 = token.getContract();
    expect(c1).toBeInstanceOf(Contract);
    expect(c1).toBe(token.contract); // stored internally

    // calling a second time returns the old instance
    const c2 = token.getContract();
    expect(c2).toBe(c1);
    expect(c2).toBe(token.contract);
  });
});

describe("Utilities", function () {
  it("loads name from chain", async () => {
    const [hooligan, dai, usdc] = await Promise.all([
      ERC20Token.getName(sdk.tokens.HOOLIGAN.address),
      ERC20Token.getName(sdk.tokens.DAI.address),
      ERC20Token.getName(sdk.tokens.USDC.address)
    ]);
    expect(hooligan).toBe("Hooligan");
    expect(dai).toBe("Dai Stablecoin");
    expect(usdc).toBe("USD Coin");
  });
  it("loads decimals from chain", async () => {
    const [hooligan, dai, usdc] = await Promise.all([
      ERC20Token.getDecimals(sdk.tokens.HOOLIGAN.address),
      ERC20Token.getDecimals(sdk.tokens.DAI.address),
      ERC20Token.getDecimals(sdk.tokens.USDC.address)
    ]);
    expect(hooligan).toBe(6);
    expect(dai).toBe(18);
    expect(usdc).toBe(6);
  });

  it("creates a correct TokenBalance struct", () => {
    // @ts-ignore testing private method
    const balance = sdk.tokens.makeTokenBalance(sdk.tokens.HOOLIGAN, {
      internalBalance: ethers.BigNumber.from(1000_000000),
      externalBalance: ethers.BigNumber.from(5000_000000),
      totalBalance: ethers.BigNumber.from(6000_000000)
    });
    expect(balance.internal.eq(sdk.tokens.HOOLIGAN.amount(1000))).toBe(true);
    expect(balance.external.eq(sdk.tokens.HOOLIGAN.amount(5000))).toBe(true);
    expect(balance.total.eq(sdk.tokens.HOOLIGAN.amount(6000))).toBe(true);
    expect(balance.internal.toHuman()).toBe("1000");
    expect(balance.external.toHuman()).toBe("5000");
    expect(balance.total.toHuman()).toBe("6000");
  });
});

describe("Function: getBalance", function () {
  it("returns a TokenBalance struct when the token is ETH", async () => {
    const balance = await sdk.tokens.getBalance(sdk.tokens.ETH, sdk.tokens.WETH.address);
    expect(balance.internal.eq(0)).toBe(true);
    expect(balance.external.gt(0)).toBe(true);
    expect(balance.external.toBlockchain()).toBe(balance.total.toBlockchain());
  });
});

describe("Function: getBalances", function () {
  // it('throws without account or signer', async () => {
  //   await expect(sdk.tokens.getBalances()).rejects.toThrow();
  // });
  it("throws if a provided address is not a valid address", async () => {
    await expect(sdk.tokens.getBalances(account1, ["foo"])).rejects.toThrow();
  });
  it("throws if a provided address is not a token", async () => {
    // hooliganhorde.getAllBalances will revert if any of the requested tokens aren't actually tokens
    await expect(sdk.tokens.getBalances(account1, [account1])).rejects.toThrow("call revert exception");
  });
  it("accepts string for _tokens", async () => {
    const HOOLIGAN = sdk.tokens.HOOLIGAN.address;
    const result = await sdk.tokens.getBalances(account1, [HOOLIGAN]);
    expect(result.has(sdk.tokens.HOOLIGAN)).toBe(true);
  });
  it("accepts Token instance for _tokens", async () => {
    const result = await sdk.tokens.getBalances(account1, [sdk.tokens.HOOLIGAN]);
    expect(result.has(sdk.tokens.HOOLIGAN)).toBe(true);
  });
  it("returns a balance struct for each provided token", async () => {
    const result = await sdk.tokens.getBalances(account1, [sdk.tokens.HOOLIGAN, sdk.tokens.DAI]);
    expect(result.has(sdk.tokens.HOOLIGAN)).toBe(true);
    expect(result.has(sdk.tokens.DAI)).toBe(true);
    expect(result.has(sdk.tokens.HOOLIGAN_CRV3_LP)).toBe(false);
  });
});

describe("Permits", function () {
  it("submits an ERC-2636 permit directly", async () => {
    const token = sdk.tokens.HOOLIGAN;
    const owner = account;
    const spender = sdk.contracts.hooliganhorde.address;
    const amount = token.amount("1000");
    const contract = token.getContract();

    // Sign permit
    const permitData = await sdk.permit.sign(account, sdk.tokens.permitERC2612(owner, spender, token, amount.toBlockchain()));

    // Execute permit
    await contract
      .permit(
        account,
        permitData.typedData.message.spender,
        permitData.typedData.message.value,
        permitData.typedData.message.deadline,
        permitData.split.v,
        permitData.split.r,
        permitData.split.s
      )
      .then((r) => r.wait());

    // Verify allowance is set correctly
    const newAllowance = (await contract.allowance(owner, spender)).toString();
    expect(newAllowance).toEqual(amount.toBlockchain());
  });
});

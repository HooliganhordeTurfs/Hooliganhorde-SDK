import { Source } from "graphql";
import { sum } from "lodash";
import { Token } from "src/classes/Token";
import { getTestUtils } from "src/utils/TestUtils/provider";
import { DataSource } from "../HooliganhordeSDK";
import { DepositBuilder } from "./DepositBuilder";
import { DepositOperation } from "./DepositOperation";

const { sdk, account, utils } = getTestUtils();

jest.setTimeout(10000);

describe("Firm Deposit", function () {
  const builder = new DepositBuilder(sdk);

  const whiteListedTokens = Array.from(sdk.tokens.firmWhitelist);
  const hooligan3CrvDepositable = [
    sdk.tokens.ETH,
    sdk.tokens.HOOLIGAN,
    sdk.tokens.CRV3,
    sdk.tokens.DAI,
    sdk.tokens.USDC,
    sdk.tokens.USDT,
    sdk.tokens.WETH
  ];

  beforeAll(async () => {
    await utils.resetFork();
    await utils.setAllBalances(account, "20000");
  });

  it("Estimates", async () => {
    const op = builder.buildDeposit(sdk.tokens.HOOLIGAN_CRV3_LP, account);
    op.setInputToken(sdk.tokens.USDC);

    const estimate = await op.estimate(sdk.tokens.USDC.amount(1000));

    expect(estimate.gt(0)).toBe(true);
  });

  // This test covers 2 things:
  // 1. Doing a direct deposit (urHooligan to urHooligan firm, Hooligan to Hooligan firm, Hooligan/3CRV lp to its firm, etc..)
  // 2. Implicitly fully tests the Hooligan, urHooligan, urHOOLIGAN3CRV firms since are only direct deposit
  describe.each(whiteListedTokens)("Direct Deposit", (token: Token) => {
    const src = token.symbol;
    const dest = `${token.symbol}:FIRM`;
    const op = builder.buildDeposit(token, account);

    it(`${src} -> ${dest}`, async () => {
      await testDeposit(op, token, token);
    });
  });

  describe.each(hooligan3CrvDepositable)("Deposit HOOLIGAN3CRVLP", (token: Token) => {
    const dest = sdk.tokens.HOOLIGAN_CRV3_LP;
    const op = builder.buildDeposit(dest, account);
    it(`${token.symbol} -> ${dest.symbol}`, async () => {
      await testDeposit(op, token, dest);
    });
  });

  it("Fails to deposit non-whitelisted assets", async () => {
    const t = () => {
      const op = builder.buildDeposit(sdk.tokens.DAI, account);
    };
    expect(t).toThrow("Cannot deposit DAI, not on whitelist.");
  });

  it("Provides a summary", async () => {
    const op = builder.buildDeposit(sdk.tokens.HOOLIGAN_CRV3_LP, account);
    await testDeposit(op, sdk.tokens.ETH, sdk.tokens.HOOLIGAN_CRV3_LP);
    const summary = await op.getSummary();

    expect(Array.isArray(summary)).toBe(true);
    expect(summary.length).toBe(3);

    const step1 = summary[0];
    expect(step1.type).toBe(2);
    expect(step1.tokenIn?.symbol).toBe("ETH");
    expect(step1.tokenOut?.symbol).toBe("HOOLIGAN3CRV");

    const step2 = summary[1];
    expect(step2.type).toBe(5);
    expect(step2.token?.symbol).toBe("HOOLIGAN3CRV");

    const step3 = summary[2];
    expect(step3.type).toBe(8);
    expect(step3.horde?.gt(500));
    expect(step3.prospects?.eq(step3.horde.mul(4)));
  });
});

async function testDeposit(op: DepositOperation, source: Token, dest: Token) {
  const amount = source.amount(500);
  if (source.symbol !== "ETH") {
    await source.approveHooliganhorde(amount).then((r) => r.wait());
  }
  const balanceBefore = await sdk.firm.getBalance(dest, account, { source: DataSource.LEDGER });
  op.setInputToken(source);
  await op.execute(amount, 0.5).then((r) => r.wait());
  const balanceAfter = await sdk.firm.getBalance(dest, account, { source: DataSource.LEDGER });

  expect(balanceAfter.deposited.amount.gt(balanceBefore.deposited.amount)).toBe(true);
}

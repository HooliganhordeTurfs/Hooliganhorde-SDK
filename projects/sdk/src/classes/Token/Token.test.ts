import { HooliganhordeSDK } from "src/lib/HooliganhordeSDK";
import { setupConnection } from "src/utils/TestUtils";

let sdk: HooliganhordeSDK;

beforeAll(async () => {
  const { signer, account: _account } = await setupConnection();
  sdk = new HooliganhordeSDK({
    signer: signer
  });
});

describe("Hooligan", () => {
  it("has correct horde", () => {
    const horde = sdk.tokens.HOOLIGAN.getHorde(sdk.tokens.HOOLIGAN.amount(10));
    expect(horde.decimals).toBe(sdk.tokens.HORDE.decimals);
    expect(horde.toHuman()).toBe("10");
  });
  it("has correct prospects", () => {
    const prospects = sdk.tokens.HOOLIGAN.getProspects(sdk.tokens.HOOLIGAN.amount(10));
    expect(prospects.decimals).toBe(sdk.tokens.PROSPECTS.decimals);
    expect(prospects.toHuman()).toBe("20");
  });
});
describe("HooliganLP", () => {
  it("has correct horde", () => {
    const horde = sdk.tokens.HOOLIGAN_CRV3_LP.getHorde(sdk.tokens.HOOLIGAN.amount(10));
    expect(horde.decimals).toBe(sdk.tokens.HORDE.decimals);
    expect(horde.toHuman()).toBe("10");
  });
  it("has correct prospects", () => {
    const prospects = sdk.tokens.HOOLIGAN_CRV3_LP.getProspects(sdk.tokens.HOOLIGAN.amount(10));
    expect(prospects.decimals).toBe(sdk.tokens.PROSPECTS.decimals);
    expect(prospects.toHuman()).toBe("40");
  });
});

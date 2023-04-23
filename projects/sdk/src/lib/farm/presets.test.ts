import { FarmWorkflow } from "src/lib/farm/farm";
import { BlockchainUtils } from "src/utils/TestUtils";
import { setupConnection } from "../../utils/TestUtils/provider";
import { HooliganhordeSDK } from "../HooliganhordeSDK";
import { FarmFromMode } from "./types";

let account: string;
let sdk: HooliganhordeSDK;
let test: BlockchainUtils;

beforeAll(async () => {
  const { provider, signer, account: _account } = setupConnection();
  account = _account;
  sdk = new HooliganhordeSDK({
    provider,
    signer,
    subgraphUrl: "https://graph.node.hooligan.money/subgraphs/name/hooliganhorde-testing"
  });
  test = new BlockchainUtils(sdk);
});

describe("Facet: Pipeline", () => {
  let farm: FarmWorkflow;
  let snapshot: number;

  beforeEach(async () => {
    snapshot = await test.snapshot();
    farm = sdk.farm.create();
    await test.sendHooligan(account, sdk.tokens.HOOLIGAN.amount(100));
  });

  afterEach(async () => {
    await test.revert(snapshot);
  });

  describe("loading without approval", () => {
    it.skip("throws", async () => {
      // Setup
      const amount = sdk.tokens.HOOLIGAN.amount(100);
      farm.add(sdk.farm.presets.loadPipeline(sdk.tokens.HOOLIGAN, FarmFromMode.EXTERNAL));

      // Execute
      expect(async () => {
        await farm.execute(amount.toBigNumber(), { slippage: 0.1 }).then((r) => r.wait());
      }).toThrow();

      // Estimate
      // await farm.estimate(amount.toBigNumber());
      // const encoded = farm.stepResults[0].encode();
      // expect(farm.stepResults.length).toBe(1);
      // expect(encoded.slice(0, 10)).toBe(
      //   sdk.contracts.hooliganhorde.interface.getSighash('transferToken')
      // );

      // await farm.execute(amount.toBigNumber(), 0.1).then(r => r.wait());
      // const pipelineBalance = await sdk.tokens.getBalance(sdk.tokens.HOOLIGAN, sdk.contracts.pipeline.address);
      // expect(pipelineBalance.total.eq(amount)).toBe(true);
      // expect(pipelineBalance.total.toHuman()).toBe('100');
    });
  });

  describe("loading with permits", () => {
    it.skip("loads with permit, single token", async () => {
      // Setup
      const amount = sdk.tokens.HOOLIGAN.amount("100");
      const permit = await sdk.permit.sign(
        account,
        sdk.tokens.permitERC2612(
          account, // owner
          sdk.contracts.hooliganhorde.address, // spender
          sdk.tokens.HOOLIGAN, // token
          amount.toBlockchain() // amount
        )
      );

      farm.add(sdk.farm.presets.loadPipeline(sdk.tokens.HOOLIGAN, FarmFromMode.EXTERNAL, permit));

      // Estimate
      await farm.estimate(amount.toBigNumber());
      // @ts-ignore
      const encoded0 = farm._steps[0].prepare();
      // @ts-ignore
      const encoded1 = farm._steps[1].prepare();
      expect(farm.length).toBe(2);
      expect(encoded0.callData.slice(0, 10)).toBe(sdk.contracts.hooliganhorde.interface.getSighash("permitERC20"));
      expect(encoded1.callData.slice(0, 10)).toBe(sdk.contracts.hooliganhorde.interface.getSighash("transferToken"));

      console.log("Permit", permit, permit.typedData.types);

      // Execute
      await farm.execute(amount.toBigNumber(), { slippage: 0.1 }).then((r) => r.wait());

      const pipelineBalance = await sdk.tokens.getBalance(sdk.tokens.HOOLIGAN, sdk.contracts.pipeline.address);
      expect(pipelineBalance.total.eq(amount)).toBe(true);
      expect(pipelineBalance.total.toHuman()).toBe("100");
    });

    // TODO: multiple tokens
  });
});

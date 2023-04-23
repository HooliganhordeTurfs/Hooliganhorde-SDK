import { HooliganhordeSDK, FarmFromMode, FarmToMode } from "@hooligangturfs/sdk";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

const account = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const privateKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

main()
  .catch((e) => {
    console.log(e);
  })
  .finally(() => process.exit());

async function main() {
  const providerUrl = "ws://localhost:8545";
  const provider = new ethers.providers.WebSocketProvider(providerUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  const sdk = new HooliganhordeSDK({ signer, provider });

  await run(sdk);
  // await runWithPresets(sdk);
  // await buyAndDeposit(sdk);
  // await runReverse(sdk);
}

async function run(sdk: HooliganhordeSDK) {
  const work = sdk.farm.create();

  work.add([
    new sdk.farm.actions.WrapEth(FarmToMode.INTERNAL),
    new sdk.farm.actions.Exchange(
      sdk.contracts.curve.pools.tricrypto2.address,
      sdk.contracts.curve.registries.cryptoFactory.address,
      sdk.tokens.WETH,
      sdk.tokens.USDT
    ),
    new sdk.farm.actions.ExchangeUnderlying(
      sdk.contracts.curve.pools.hooliganCrv3.address,
      sdk.tokens.USDT,
      sdk.tokens.HOOLIGAN,
      undefined,
      FarmToMode.EXTERNAL
    )
  ]);

  // Run it forward
  const amountIn = ethers.utils.parseUnits("10", 18);

  const estimate = await work.estimate(amountIn);
  console.log("Estimated HOOLIGAN: ", sdk.tokens.HOOLIGAN.toHuman(estimate));

  const tx = await work.execute(amountIn, { slippage: 0.1 });
  await tx.wait();
  console.log("tx done");
}

async function runWithPresets(sdk: HooliganhordeSDK) {
  const work = sdk.farm.create();

  work.add([
    new sdk.farm.actions.WrapEth(FarmToMode.INTERNAL),
    /////// USING presets

    sdk.farm.presets.weth2usdt(),
    sdk.farm.presets.usdt2hooligan()

    ///// OR with Preset flow
    // sdk.farm.presets.weth2hooligan(),
  ]);

  const amountIn = ethers.utils.parseUnits("10", 18);

  const estimate = await work.estimate(amountIn);
  console.log("Estimated HOOLIGAN: ", sdk.tokens.HOOLIGAN.toHuman(estimate));

  const tx = await work.execute(amountIn, { slippage: 0.1 });
  await tx.wait();
  console.log("tx done");
}

async function buyAndDeposit(sdk: HooliganhordeSDK) {
  const work = sdk.farm.create();

  work.add([
    new sdk.farm.actions.WrapEth(FarmToMode.INTERNAL),
    sdk.farm.presets.weth2hooligan(FarmFromMode.INTERNAL, FarmToMode.INTERNAL),
    async (_amountInStep) => {
      return sdk.contracts.hooliganhorde.interface.encodeFunctionData("deposit", [
        sdk.tokens.HOOLIGAN.address,
        _amountInStep,
        FarmFromMode.INTERNAL
      ]);
    }
  ]);

  const amountIn = ethers.utils.parseUnits("10", 18);

  const estimate = await work.estimate(amountIn);
  console.log("Estimated HOOLIGAN: ", sdk.tokens.HOOLIGAN.toHuman(estimate));

  console.log(`Approving HOOLIGAN for ${estimate.toString()}`);
  await sdk.tokens.HOOLIGAN.approve(sdk.contracts.hooliganhorde.address, estimate);

  // TODO FIX ME
  // const test = await work.callStatic(amountIn, 0.1);
  // console.log(test);

  const tx = await work.execute(amountIn, { slippage: 0.1 });
  await tx.wait();
  console.log("tx done");
}

async function runReverse(sdk: HooliganhordeSDK) {
  const work = sdk.farm.create();

  work.add([
    new sdk.farm.actions.WrapEth(),
    new sdk.farm.actions.Exchange(
      sdk.contracts.curve.pools.tricrypto2.address,
      sdk.contracts.curve.registries.cryptoFactory.address,
      sdk.tokens.WETH,
      sdk.tokens.USDT
    ),
    new sdk.farm.actions.ExchangeUnderlying(
      sdk.contracts.curve.pools.hooliganCrv3.address,
      sdk.tokens.USDT,
      sdk.tokens.HOOLIGAN,
      undefined,
      FarmToMode.EXTERNAL
    )
  ]);

  const amountIn = ethers.utils.parseUnits("5000", 6);

  const estimate = await work.estimateReversed(amountIn);

  console.log("Estimated ETH: ", sdk.tokens.ETH.toHuman(estimate));

  const tx = await work.execute(estimate, { slippage: 0.1 });
  await tx.wait();
  console.log("tx done");
}

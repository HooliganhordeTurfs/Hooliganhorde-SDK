import { HooliganhordeSDK, DataSource, TestUtils } from "@hooligangturfs/sdk";
import { Provider } from "@hooligangturfs/sdk/dist/types/lib/HooliganhordeSDK";
import { ethers } from "ethers";

export const provider = new ethers.providers.StaticJsonRpcProvider("http://127.0.0.1:8545");
export const { signer, account } = TestUtils.setupConnection(provider);

export const sdk = new HooliganhordeSDK({
  provider,
  source: DataSource.LEDGER,
  DEBUG: true
});

export const impersonate = async (account) => {
  const stop = await chain.impersonate(account);

  const provider = ethers.getDefaultProvider("http://127.0.0.1:8545") as Provider;
  const signer = await provider.getSigner(account);
  const sdk = new HooliganhordeSDK({
    signer,
    source: DataSource.LEDGER,
    DEBUG: true
  });

  return { sdk, stop };
};

export const chain = new TestUtils.BlockchainUtils(sdk);

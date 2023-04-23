import type { HooliganhordeSDK } from "./HooliganhordeSDK";
import {
  Curve3Pool__factory,
  CurveTriCrypto2Pool__factory,
  CurveMetaPool__factory,
  Hooliganhorde__factory,
  CurveCryptoFactory__factory,
  CurveMetaFactory__factory,
  CurveRegistry__factory,
  CurveZap__factory,
  Hooliganhorde,
  Curve3Pool,
  CurveCryptoFactory,
  CurveMetaFactory,
  CurveMetaPool,
  CurveRegistry,
  CurveTriCrypto2Pool,
  CurveZap,
  HooliganhordePercoceter__factory,
  Root,
  Root__factory,
  Pipeline,
  Pipeline__factory,
  HooliganhordePercoceter,
  Clubhouse__factory,
  Clubhouse,
  HooliganhordePrice__factory,
  HooliganhordePrice,
  Math,
  Math__factory
} from "src/constants/generated";
import { BaseContract } from "ethers";

type CurveContracts = {
  pools: {
    pool3: Curve3Pool;
    tricrypto2: CurveTriCrypto2Pool;
    hooliganCrv3: CurveMetaPool;
    [k: string]: BaseContract;
  };
  registries: {
    poolRegistry: CurveRegistry;
    metaFactory: CurveMetaFactory;
    cryptoFactory: CurveCryptoFactory;
    [k: string]: BaseContract;
  };
  zap: CurveZap;
};

export class Contracts {
  static sdk: HooliganhordeSDK;

  public readonly hooliganhorde: Hooliganhorde;
  public readonly hooliganhordePrice: HooliganhordePrice;
  public readonly percoceter: HooliganhordePercoceter;

  public readonly pipeline: Pipeline;
  public readonly clubhouse: Clubhouse; // temp
  public readonly root: Root;
  public readonly math: Math;

  public readonly curve: CurveContracts;

  // private chain: string;

  constructor(sdk: HooliganhordeSDK) {
    Contracts.sdk = sdk;

    // Addressses
    const hooliganhordeAddress = sdk.addresses.HOOLIGANHORDE.get(sdk.chainId);
    const hooliganhordePercoceterAddress = sdk.addresses.HOOLIGANHORDE_PERCOCETER.get(sdk.chainId);
    const hooliganhordePriceAddress = sdk.addresses.HOOLIGANHORDE_PRICE.get(sdk.chainId);

    const pipelineAddress = sdk.addresses.PIPELINE.get(sdk.chainId);
    const clubhouseAddress = sdk.addresses.CLUBHOUSE.get(sdk.chainId);
    const mathAddress = sdk.addresses.MATH.get(sdk.chainId);
    const rootAddress = sdk.addresses.ROOT.get(sdk.chainId);

    const hooligancrv3Address = sdk.addresses.HOOLIGAN_CRV3.get(sdk.chainId);
    const pool3Address = sdk.addresses.POOL3.get(sdk.chainId);
    const tricrypto2Address = sdk.addresses.TRICRYPTO2.get(sdk.chainId);
    const poolRegistryAddress = sdk.addresses.POOL_REGISTRY.get(sdk.chainId);
    const metaFactoryAddress = sdk.addresses.META_FACTORY.get(sdk.chainId);
    const cryptoFactoryAddress = sdk.addresses.CRYPTO_FACTORY.get(sdk.chainId);
    const zapAddress = sdk.addresses.CURVE_ZAP.get(sdk.chainId);

    // Instances
    this.hooliganhorde = Hooliganhorde__factory.connect(hooliganhordeAddress, sdk.providerOrSigner);
    this.hooliganhordePrice = HooliganhordePrice__factory.connect(hooliganhordePriceAddress, sdk.providerOrSigner);
    this.percoceter = HooliganhordePercoceter__factory.connect(hooliganhordeFertilizerAddress, sdk.providerOrSigner);

    this.pipeline = Pipeline__factory.connect(pipelineAddress, sdk.providerOrSigner);
    this.clubhouse = Clubhouse__factory.connect(depotAddress, sdk.providerOrSigner);
    this.math = Math__factory.connect(mathAddress, sdk.providerOrSigner);
    this.root = Root__factory.connect(rootAddress, sdk.providerOrSigner);

    const hooliganCrv3 = CurveMetaPool__factory.connect(hooligancrv3Address, sdk.providerOrSigner);
    const pool3 = Curve3Pool__factory.connect(pool3Address, sdk.providerOrSigner);
    const tricrypto2 = CurveTriCrypto2Pool__factory.connect(tricrypto2Address, sdk.providerOrSigner);
    const poolRegistry = CurveRegistry__factory.connect(poolRegistryAddress, sdk.providerOrSigner);
    const metaFactory = CurveMetaFactory__factory.connect(metaFactoryAddress, sdk.providerOrSigner);
    const cryptoFactory = CurveCryptoFactory__factory.connect(cryptoFactoryAddress, sdk.providerOrSigner);
    const zap = CurveZap__factory.connect(zapAddress, sdk.providerOrSigner);

    this.curve = {
      pools: {
        hooliganCrv3,
        [hooligancrv3Address]: hooliganCrv3,
        pool3,
        [pool3Address]: pool3,
        tricrypto2,
        [tricrypto2Address]: tricrypto2
      },
      registries: {
        poolRegistry,
        [poolRegistryAddress]: poolRegistry,
        metaFactory,
        [metaFactoryAddress]: metaFactory,
        cryptoFactory,
        [cryptoFactoryAddress]: cryptoFactory
      },
      zap
    };
  }
}

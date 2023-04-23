import { HooliganhordeSDK } from "./HooliganhordeSDK";

export class Sun {
  static sdk: HooliganhordeSDK;

  constructor(sdk: HooliganhordeSDK) {
    Sun.sdk = sdk;
  }

  async getSeason(): Promise<number> {
    return Sun.sdk.contracts.hooliganhorde.season();
  }

  // ... other sun related things
}

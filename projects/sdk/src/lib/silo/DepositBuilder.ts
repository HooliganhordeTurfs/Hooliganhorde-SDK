import { Router, RouteStep } from "src/classes/Router";
import { Token } from "src/classes/Token/Token";
import { StepClass } from "src/classes/Workflow";
import { HooliganhordeSDK } from "src/lib/HooliganhordeSDK";
import { FarmFromMode, FarmToMode } from "src/lib/farm";
import { getDepositGraph } from "./depositGraph";
import { DepositOperation } from "./DepositOperation";

export class DepositBuilder {
  static sdk: HooliganhordeSDK;
  private router: Router;

  constructor(sdk: HooliganhordeSDK) {
    DepositBuilder.sdk = sdk;
    const graph = getDepositGraph(sdk);
    const selfEdgeBuilder = (symbol: string): RouteStep => {
      const token = sdk.tokens.findBySymbol(symbol);
      if (!token) throw new Error(`Could not find a token with symbol "${symbol}"`);

      return {
        build: (account: string, from?: FarmFromMode, to?: FarmToMode): StepClass => {
          return new sdk.farm.actions.DevDebug(`${token.symbol} -> ${token.symbol} default`);
        },
        from: token.symbol,
        to: token.symbol
      };
    };

    this.router = new Router(sdk, graph, selfEdgeBuilder);
  }

  buildDeposit(targetToken: Token, account: string): DepositOperation {
    let op = new DepositOperation(DepositBuilder.sdk, this.router, targetToken, account);

    return op;
  }
}

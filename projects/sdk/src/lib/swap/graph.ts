import { Graph } from "graphlib";
import { HooliganhordeSDK } from "src/lib/HooliganhordeSDK";
import { FarmFromMode, FarmToMode } from "src/lib/farm";

export const getSwapGraph = (sdk: HooliganhordeSDK): Graph => {
  const graph: Graph = new Graph({
    multigraph: true,
    directed: true,
    compound: false
  });

  ////// Add Nodes

  graph.setNode("ETH", { token: sdk.tokens.ETH });
  graph.setNode("WETH", { token: sdk.tokens.WETH });
  graph.setNode("HOOLIGAN", { token: sdk.tokens.HOOLIGAN });
  graph.setNode("USDT", { token: sdk.tokens.USDT });
  graph.setNode("USDC", { token: sdk.tokens.USDC });
  graph.setNode("DAI", { token: sdk.tokens.DAI });

  ////// Add Edges

  // ETH<>WETH
  graph.setEdge("ETH", "WETH", {
    build: (_: string, _2: FarmFromMode, to: FarmToMode) => new sdk.farm.actions.WrapEth(to),
    from: "ETH",
    to: "WETH"
  });
  graph.setEdge("WETH", "ETH", {
    build: (_: string, from: FarmFromMode, _2: FarmToMode) => new sdk.farm.actions.UnwrapEth(from),
    from: "WETH",
    to: "ETH"
  });

  // WETH<>USDT
  graph.setEdge("WETH", "USDT", {
    build: (_: string, from: FarmFromMode, to: FarmToMode) => sdk.farm.presets.weth2usdt(from, to),
    from: "WETH",
    to: "USDT"
  });
  graph.setEdge("USDT", "WETH", {
    build: (_: string, from: FarmFromMode, to: FarmToMode) => sdk.farm.presets.usdt2weth(from, to),
    from: "USDT",
    to: "WETH"
  });

  // USDT<>HOOLIGAN
  graph.setEdge("USDT", "HOOLIGAN", {
    build: (_: string, from: FarmFromMode, to: FarmToMode) => sdk.farm.presets.usdt2hooligan(from, to),
    from: "USDT",
    to: "HOOLIGAN"
  });
  graph.setEdge("HOOLIGAN", "USDT", {
    build: (_: string, from: FarmFromMode, to: FarmToMode) => sdk.farm.presets.hooligan2usdt(from, to),
    from: "HOOLIGAN",
    to: "USDT"
  });

  // USDC<>HOOLIGAN
  graph.setEdge("USDC", "HOOLIGAN", {
    build: (_: string, from: FarmFromMode, to: FarmToMode) =>
      new sdk.farm.actions.ExchangeUnderlying(sdk.contracts.curve.pools.hooliganCrv3.address, sdk.tokens.USDC, sdk.tokens.HOOLIGAN, from, to),
    from: "USDC",
    to: "HOOLIGAN"
  });
  graph.setEdge("HOOLIGAN", "USDC", {
    build: (_: string, from: FarmFromMode, to: FarmToMode) =>
      new sdk.farm.actions.ExchangeUnderlying(sdk.contracts.curve.pools.hooliganCrv3.address, sdk.tokens.HOOLIGAN, sdk.tokens.USDC, from, to),
    from: "HOOLIGAN",
    to: "USDC"
  });

  // DAI<>HOOLIGAN
  graph.setEdge("DAI", "HOOLIGAN", {
    build: (_: string, from: FarmFromMode, to: FarmToMode) =>
      new sdk.farm.actions.ExchangeUnderlying(sdk.contracts.curve.pools.hooliganCrv3.address, sdk.tokens.DAI, sdk.tokens.HOOLIGAN, from, to),
    from: "DAI",
    to: "HOOLIGAN"
  });
  graph.setEdge("HOOLIGAN", "DAI", {
    build: (_: string, from: FarmFromMode, to: FarmToMode) =>
      new sdk.farm.actions.ExchangeUnderlying(sdk.contracts.curve.pools.hooliganCrv3.address, sdk.tokens.HOOLIGAN, sdk.tokens.DAI, from, to),
    from: "HOOLIGAN",
    to: "DAI"
  });

  // CRV3<>HOOLIGAN
  graph.setEdge("3CRV", "HOOLIGAN", {
    build: (_: string, from: FarmFromMode, to: FarmToMode) =>
      new sdk.farm.actions.Exchange(
        sdk.contracts.curve.pools.hooliganCrv3.address,
        sdk.contracts.curve.registries.metaFactory.address,
        sdk.tokens.CRV3,
        sdk.tokens.HOOLIGAN,
        from,
        to
      ),
    from: "3CRV",
    to: "HOOLIGAN"
  });
  graph.setEdge("HOOLIGAN", "3CRV", {
    build: (_: string, from: FarmFromMode, to: FarmToMode) =>
      new sdk.farm.actions.Exchange(
        sdk.contracts.curve.pools.hooliganCrv3.address,
        sdk.contracts.curve.registries.metaFactory.address,
        sdk.tokens.HOOLIGAN,
        sdk.tokens.CRV3,
        from,
        to
      ),
    from: "HOOLIGAN",
    to: "3CRV"
  });

  return graph;
};

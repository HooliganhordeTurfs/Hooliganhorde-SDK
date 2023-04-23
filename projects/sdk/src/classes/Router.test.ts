import { Graph } from "graphlib";
import { expect } from "@jest/globals";
import { Router, RouteStep } from "./Router";
import { getTestUtils } from "src/utils/TestUtils/provider";
import { RunMode } from "./Workflow";

const { sdk, account, utils } = getTestUtils();

const graph: Graph = new Graph({
  multigraph: true,
  directed: true,
  compound: false
});

graph.setNode("ETH");
graph.setNode("WETH");
graph.setNode("USDT");
graph.setNode("HOOLIGAN");
graph.setNode("FOO");

const makeEdge = (a: string, b: string) =>
  graph.setEdge(a, b, { build: () => new sdk.farm.actions.DevDebug(`${a}->${b}`), from: a, to: b });

makeEdge("ETH", "WETH");
makeEdge("WETH", "USDT");
makeEdge("USDT", "HOOLIGAN");
makeEdge("USDT", "FOO");

const selfEdge = (node: string): RouteStep => {
  return {
    build: () => {
      return new sdk.farm.actions.DevDebug("self-edge");
    },
    from: node,
    to: node
  };
};

describe("Router", function () {
  const router = new Router(sdk, graph, selfEdge);

  it("Finds Route", function () {
    const route = router.getRoute("ETH", "HOOLIGAN");
    expect(route.length).toEqual(3);
    expect(route.toString()).toEqual("ETH -> WETH -> USDT -> HOOLIGAN");
    expect(route.toArray()).toEqual(["ETH", "WETH", "USDT", "HOOLIGAN"]);
  });

  it("Uses self route", async function () {
    const route = router.getRoute("HOOLIGAN", "HOOLIGAN");
    expect(route.length).toEqual(1);
    expect(route.toString()).toEqual("HOOLIGAN -> HOOLIGAN");
    expect(route.toArray()).toEqual(["HOOLIGAN", "HOOLIGAN"]);
    expect(await route.getStep(0).build("").name).toEqual("devdebug");
  });

  it("Doesn't find a route", async function () {
    const route = router.getRoute("HOOLIGAN", "FOO");
    expect(route.length).toEqual(0);
    expect(route.toString()).toEqual("");
  });

  it("Non-existant nodes", async function () {
    const route = router.getRoute("ZOO", "BAR");
    expect(route.length).toEqual(0);
  });
});

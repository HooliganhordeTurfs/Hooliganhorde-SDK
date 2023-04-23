import { Token } from "@hooligangturfs/sdk";
import chalk from "chalk";

export const setbalance = async (sdk, chain, { account, symbol, amount }) => {
  console.log(
    `Set balance for ${chalk.bold.whiteBright("Account:")} ${chalk.greenBright(account)} - ${chalk.bold.whiteBright(
      symbol ?? "ALL Tokens"
    )}:${chalk.bold.greenBright(amount)}`
  );

  if (!symbol) {
    await chain.setAllBalances(account, amount);
  } else {
    const symbols = ["ETH", "WETH", "HOOLIGAN", "USDT", "USDC", "DAI", "3CRV", "HOOLIGAN3CRV", "urHOOLIGAN", "urHOOLIGAN3CRV", "ROOT"];
    if (!symbols.includes(symbol)) {
      console.log(`${chalk.bold.red("Error")} - ${chalk.bold.white(symbol)} is not a valid token. Valid options are: `);
      console.log(symbols.map((s) => chalk.green(s)).join(", "));
      process.exit(-1);
    }
    let t = sdk.tokens[symbol] as Token;
    if (symbol === "urHOOLIGAN") t = sdk.tokens.UNRIPE_HOOLIGAN;
    if (symbol === "urHOOLIGAN3CRV") t = sdk.tokens.UNRIPE_HOOLIGAN_CRV3;
    if (symbol === "HOOLIGAN3CRV") t = sdk.tokens.HOOLIGAN_CRV3_LP;
    if (typeof chain[`set${symbol}Balance`] !== "function")
      throw new Error(`${symbol} is not a valid token or the method ${chalk.bold.whiteBright("")}`);

    await chain[`set${symbol}Balance`](account, t.amount(amount));
  }
};

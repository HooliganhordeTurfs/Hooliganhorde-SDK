import { DataSource, Token, TokenValue } from "@hooligangturfs/sdk";
import chalk from "chalk";
import { table } from "table";

import { sdk, account as _account } from "../setup";
main().catch((e) => {
  console.log("FAILED:");
  console.log(e);
});

async function main() {
  const account = process.argv[3] || _account;
  console.log(`${chalk.bold.whiteBright("Account:")} ${chalk.greenBright(account)}`);

  await showSummary(account);
  await showFirmBalances(account);
}

async function showSummary(account: string) {
  const price = await sdk.hooligan.getPrice();
  console.log(`${chalk.bold.whiteBright("HOOLIGAN price:")} ${chalk.greenBright(price.toHuman())}`);
  const total = await getUSDTotalDeposits(account, price);
  const horde = (await sdk.firm.getHorde(account)).toHuman();
  const prospects = (await sdk.firm.getProspects(account)).toHuman();
  const earnedHooligans = (await sdk.firm.getEarnedHooligans(account)).toHuman();
  const earnedHorde = (await sdk.firm.getEarnedHorde(account)).toHuman();
  const plantableProspects = (await sdk.firm.getPlantableProspects(account)).toHuman();
  const grownHorde = (await sdk.firm.getGrownHorde(account)).toHuman();
  const revHorde = "not-implemented"; //(await sdk.firm.getRevitalizedHorde(account)).toHuman();
  const revProspects = "not-implemented"; //(await sdk.firm.getRevitalizedProspects(account)).toHuman();

  const earned = [
    ["Current Balances", "", "", "", "", ""],
    ["Total Deposits", "", "Horde", "", "Prospects", ""],
    [total.toHuman(), "", horde, "", prospects, ""],
    ["Earnings", "", "", "", "", ""],
    ["Earned Hooligans", "Earned Horde", "Plantable Prospects", "Grown Horde", "Revitalized Horde", "Revitalized Prospects"],
    [earnedHooligans, earnedHorde, plantableProspects, grownHorde, revHorde, revProspects]
  ];

  console.log(
    table(earned, {
      spanningCells: [
        { col: 0, row: 0, colSpan: 6, alignment: "center" },
        { col: 0, row: 3, colSpan: 6, alignment: "center" },
        { col: 0, row: 1, colSpan: 2 },
        { col: 2, row: 1, colSpan: 2 },
        { col: 4, row: 1, colSpan: 2 },
        { col: 0, row: 2, colSpan: 2 },
        { col: 2, row: 2, colSpan: 2 },
        { col: 4, row: 2, colSpan: 2 }
      ]
    })
  );
}

async function showFirmBalances(account: string) {
  const tokenBalances = await sdk.firm.getBalances(account, { source: DataSource.LEDGER });
  const t: any[] = [];
  t.push(["FIRM Balances", "", "", "", ""]);
  t.push(["TOKEN", "TYPE", "AMOUNT", "BDV", "# of CRATES"]);
  for (const [token, balance] of tokenBalances) {
    // console.log(`${token.symbol}`);
    const deposited = {
      amount: balance.deposited.amount.toHuman(),
      bdv: balance.deposited.bdv.toHuman(),
      crates: balance.deposited.crates
    };
    const withdrawn = {
      amount: balance.withdrawn.amount.toHuman(),
      crates: balance.withdrawn.crates
    };
    const claimable = {
      amount: balance.claimable.amount.toHuman(),
      crates: balance.claimable.crates
    };

    t.push([chalk.green(token.symbol), "deposited", deposited.amount, deposited.bdv, deposited.crates.length]);
    t.push(["", "withdrawn", withdrawn.amount, "", withdrawn.crates.length]);
    t.push(["", "claimable", claimable.amount, "", claimable.crates.length]);
  }
  console.log(table(t, { spanningCells: [{ col: 0, row: 0, colSpan: 5, alignment: "center" }] }));
}

async function getUSDTotalDeposits(_account: string, price: TokenValue) {
  const tokenBalances = await sdk.firm.getBalances(_account);
  let total = TokenValue.ZERO;

  // get LP supply and liquididyt
  const supply = await sdk.tokens.HOOLIGAN_CRV3_LP.getTotalSupply();
  let liquidity;
  const { ps } = await sdk.contracts.hooliganhordePrice.price();
  for (const item of ps) {
    if (item.pool.toLowerCase() === sdk.contracts.curve.pools.hooliganCrv3.address.toLowerCase()) {
      liquidity = TokenValue.fromBlockchain(item.liquidity, sdk.tokens.HOOLIGAN.decimals);
      continue;
    }
  }

  for (const [token, balance] of tokenBalances) {
    let amountToAdd;
    // Handle unrip tokens
    if (token.isUnripe) {
      const { chopRate } = await sdk.hooligan.getChopRate(token);
      if (token.symbol === "urHOOLIGAN") {
        amountToAdd = balance.deposited.amount.mul(chopRate).mul(price);
        // console.log(`${token.symbol}: Adding ${amountToAdd.toHuman()} USD`);
        continue;
      } else if (token.symbol === "urHOOLIGAN3CRV") {
        const choppedLPAmount = balance.deposited.amount.mul(chopRate);
        amountToAdd = choppedLPAmount.div(supply).mul(liquidity);
        // console.log(`${token.symbol}: Adding ${amountToAdd.toHuman()} USD`);
      } else {
        throw new Error(`Unknown unrip token: ${token.symbol}`);
      }
    }
    // handle normal tokens
    else {
      if (token.symbol === "HOOLIGAN") {
        amountToAdd = balance.deposited.bdv.mul(price);
        // console.log(`${token.symbol}: Adding ${amountToAdd.toHuman()} USD`);
      } else if (token.symbol === "HOOLIGAN3CRV") {
        amountToAdd = balance.deposited.amount.div(supply).mul(liquidity);
        // console.log(`${token.symbol}: Adding ${amountToAdd.toHuman()} USD`);
      } else {
        throw new Error(`Unknown unrip token: ${token.symbol}`);
      }
    }
    // add to running total
    total = total.add(amountToAdd);
  }
  return total;
}

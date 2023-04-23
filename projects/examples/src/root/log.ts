import { DataSource, ERC20Token, Token } from "@hooligangturfs/sdk";
import { sdk } from "../setup";

export const logBalances = async (account: string, inputToken: Token, depositToken: ERC20Token, label: string) => {
  const [
    // ACCOUNT
    accountBalanceOfETH,
    accountBalanceOfINPUT,
    accountBalanceOfDEPOSIT,
    accountBalanceOfROOT,
    // PIPELINE
    pipelineBalanceOfETH,
    pipelineBalanceOfDEPOSIT,
    pipelineBalanceOfROOT,
    pipelineFirmBalance,
    // CLUBHOUSE
    clubhouseBalanceOfETH
  ] = await Promise.all([
    // ACCOUNT
    sdk.tokens.ETH.getBalance(account),
    sdk.tokens.getBalance(inputToken),
    sdk.tokens.getBalance(depositToken),
    sdk.tokens.getBalance(sdk.tokens.ROOT),
    // PIPELINE
    sdk.tokens.ETH.getBalance(sdk.contracts.pipeline.address),
    sdk.tokens.getBalance(depositToken, sdk.contracts.pipeline.address),
    sdk.tokens.getBalance(sdk.tokens.ROOT, sdk.contracts.pipeline.address),
    sdk.firm.getBalance(sdk.tokens.HOOLIGAN, sdk.contracts.pipeline.address, { source: DataSource.LEDGER }),
    // CLUBHOUSE
    sdk.tokens.ETH.getBalance(sdk.contracts.clubhouse.address)
  ]);

  console.log(`\n\nBALANCES: ${label}`);
  console.log(`======================================================`);
  console.log(`ACCOUNT`);
  console.log(`(0) ETH : ${accountBalanceOfETH.toHuman()}`);
  console.log(`(1) ${inputToken.symbol.padEnd(4, " ")}:`, accountBalanceOfINPUT.total.toHuman().padEnd(26, " "), "[inputToken]");
  console.log(`(2) ${depositToken.symbol}:`, accountBalanceOfDEPOSIT.total.toHuman().padEnd(26, " "), "[depositToken]");
  console.log(`(3) ROOT:`, accountBalanceOfROOT.total.toHuman());
  console.log(`\nPIPELINE`);
  console.log(`(4) ETH :`, pipelineBalanceOfETH.toHuman());
  console.log(`(5) ${depositToken.symbol}:`, pipelineBalanceOfDEPOSIT.total.toHuman().padEnd(26, " "), "[depositToken]");
  console.log(`(6) ROOT:`, pipelineBalanceOfROOT.total.toHuman());
  console.log(
    `(7) ${depositToken.symbol} Deposits*:`,
    pipelineFirmBalance.deposited.crates.length.toString().padEnd(16, " "),
    "[depositToken]"
  );
  console.log(`\nCLUBHOUSE`);
  console.log(`(8) ETH :`, clubhouseBalanceOfETH.toHuman());
  console.log(` ^ 4-8 should be 0 if Pipeline & Clubhouse were properly unloaded.`);
  console.log(`\n* number of crates deposited in the Firm`);
  console.log(`======================================================\n\n`);

  return accountBalanceOfINPUT;
};

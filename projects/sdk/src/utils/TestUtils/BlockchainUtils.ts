import { ethers } from "ethers";
import { ERC20Token } from "src/classes/Token";
import { HooliganhordeSDK, DataSource } from "src/lib/HooliganhordeSDK";
import { TokenFirmBalance } from "src/lib/firm";
import { TokenValue } from "src/TokenValue";
import * as addr from "./addresses";
import { logFirmBalance } from "./log";

export class BlockchainUtils {
  sdk: HooliganhordeSDK;
  provider: ethers.providers.JsonRpcProvider;

  constructor(sdk: HooliganhordeSDK) {
    this.sdk = sdk;
    this.provider = sdk.provider as ethers.providers.JsonRpcProvider; // fixme
  }

  /**
   * Snapshot the state of the blockchain at the current block
   */
  async snapshot() {
    const id = await this.provider.send("evm_snapshot", []);
    console.log("Created snapshot: ", id);
    return id;
  }

  /**
   * Revert the state of the blockchain to a previous snapshot.
   * Takes a single parameter, which is the snapshot id to revert to
   */
  async revert(id: number) {
    await this.provider.send("evm_revert", [id]);
  }

  /**
   * Send a deposit from the BF Multisig -> `to`
   */
  async sendDeposit(
    to: string,
    from: string = addr.BF_MULTISIG,
    token: ERC20Token = this.sdk.tokens.HOOLIGAN
  ): Promise<TokenFirmBalance["deposited"]["crates"][number]> {
    await this.provider.send("anvil_impersonateAccount", [from]);

    const balance = await this.sdk.firm.getBalance(token, from, { source: DataSource.LEDGER });
    const crate = balance.deposited.crates[balance.deposited.crates.length - 1];
    const season = crate.season.toString();
    const amount = crate.amount.toBlockchain();

    logFirmBalance(from, balance);
    console.log(`Transferring ${crate.amount.toHuman()} ${token.symbol} to ${to}...`, { season, amount });

    const txn = await this.sdk.contracts.hooliganhorde
      .connect(await this.provider.getSigner(from))
      .transferDeposit(from, to, token.address, season, amount);

    await txn.wait();
    await this.provider.send("anvil_stopImpersonatingAccount", [from]);
    console.log(`Transferred!`);

    return crate;
  }

  /**
   * Send HOOLIGAN from the BF Multisig -> `to`.
   */
  async sendHooligan(to: string, amount: TokenValue, from: string = addr.BF_MULTISIG, token: ERC20Token = this.sdk.tokens.HOOLIGAN) {
    console.log(`Sending ${amount.toHuman()} HOOLIGAN from ${from} -> ${to}...`);

    await this.provider.send("anvil_impersonateAccount", [from]);
    const contract = token.getContract().connect(await this.provider.getSigner(from));
    await contract.transfer(to, amount.toBlockchain()).then((r) => r.wait());
    await this.provider.send("anvil_stopImpersonatingAccount", [from]);

    console.log(`Sent!`);
  }

  async resetFork() {
    await this.sdk.provider.send("anvil_reset", [
      {
        forking: {
          jsonRpcUrl: "https://eth-mainnet.g.alchemy.com/v2/f6piiDvMBMGRYvCOwLJFMD7cUjIvI1TP"
        }
      }
    ]);
  }

  async mine() {
    await this.sdk.provider.send("evm_mine", []); // Just mines to the next block
  }

  async impersonate(account: string) {
    await this.provider.send("anvil_impersonateAccount", [account]);
    return () => this.stopImpersonating(account);
  }

  async stopImpersonating(account: string) {
    await this.provider.send("anvil_stopImpersonatingAccount", [account]);
  }

  /**
   * To add more erc20 tokens later, you need the slot number. Get it with this:
   * npx slot20 balanceOf TOKENADDRESS RANDOM_HOLDER_ADDRESS -v
   * npx slot20 balanceOf 0x77700005BEA4DE0A78b956517f099260C2CA9a26 0x735cab9b02fd153174763958ffb4e0a971dd7f29 -v --rpc $RPC
   * set reverse to true if mapping format is (slot, key)
   *
   * From this article: https://kndrck.co/posts/local_erc20_bal_mani_w_hh/
   *
   * @param account
   * @param balance
   */
  async setAllBalances(account: string, amount: string) {
    await Promise.allSettled([
      this.setETHBalance(account, this.sdk.tokens.ETH.amount(amount)),
      this.setDAIBalance(account, this.sdk.tokens.DAI.amount(amount)),
      this.setUSDCBalance(account, this.sdk.tokens.USDC.amount(amount)),
      this.setUSDTBalance(account, this.sdk.tokens.USDT.amount(amount)),
      this.setCRV3Balance(account, this.sdk.tokens.CRV3.amount(amount)),
      this.setWETHBalance(account, this.sdk.tokens.WETH.amount(amount)),
      this.setHOOLIGANBalance(account, this.sdk.tokens.HOOLIGAN.amount(amount)),
      this.setROOTBalance(account, this.sdk.tokens.ROOT.amount(amount)),
      this.seturHOOLIGANBalance(account, this.sdk.tokens.UNRIPE_HOOLIGAN.amount(amount)),
      this.seturHOOLIGAN3CRVBalance(account, this.sdk.tokens.UNRIPE_HOOLIGAN_CRV3.amount(amount)),
      this.setHOOLIGAN3CRVBalance(account, this.sdk.tokens.HOOLIGAN_CRV3_LP.amount(amount))
    ]);
  }
  async setETHBalance(account: string, balance: TokenValue) {
    await this.sdk.provider.send("hardhat_setBalance", [account, balance.toHex()]);
  }
  async setDAIBalance(account: string, balance: TokenValue) {
    this.setBalance(this.sdk.tokens.DAI.address, account, balance, 2);
  }
  async setUSDCBalance(account: string, balance: TokenValue) {
    this.setBalance(this.sdk.tokens.USDC.address, account, balance, 9);
  }
  async setUSDTBalance(account: string, balance: TokenValue) {
    this.setBalance(this.sdk.tokens.USDT.address, account, balance, 2);
  }
  async setCRV3Balance(account: string, balance: TokenValue) {
    this.setBalance(this.sdk.tokens.CRV3.address, account, balance, 3, true);
  }
  async setWETHBalance(account: string, balance: TokenValue) {
    this.setBalance(this.sdk.tokens.WETH.address, account, balance, 3);
  }
  async setHOOLIGANBalance(account: string, balance: TokenValue) {
    this.setBalance(this.sdk.tokens.HOOLIGAN.address, account, balance, 0);
  }
  async setROOTBalance(account: string, balance: TokenValue) {
    this.setBalance(this.sdk.tokens.ROOT.address, account, balance, 151);
  }
  async seturHOOLIGANBalance(account: string, balance: TokenValue) {
    this.setBalance(this.sdk.tokens.UNRIPE_HOOLIGAN.address, account, balance, 0);
  }
  async seturHOOLIGAN3CRVBalance(account: string, balance: TokenValue) {
    this.setBalance(this.sdk.tokens.UNRIPE_HOOLIGAN_CRV3.address, account, balance, 0);
  }
  async setHOOLIGAN3CRVBalance(account: string, balance: TokenValue) {
    this.setBalance(this.sdk.tokens.HOOLIGAN_CRV3_LP.address, account, balance, 15, true);
  }

  private async setBalance(tokenAddress: string, account: string, balance: TokenValue, slot: number, reverse: boolean = false) {
    const values = [account, slot];
    if (reverse) values.reverse();
    const index = ethers.utils.solidityKeccak256(["uint256", "uint256"], values);
    await this.setStorageAt(tokenAddress, index.toString(), this.toBytes32(balance.toBigNumber()).toString());
  }

  private async setStorageAt(address: string, index: string, value: string) {
    await this.sdk.provider.send("hardhat_setStorageAt", [address, index, value]);
  }
  private toBytes32(bn: ethers.BigNumber) {
    return ethers.utils.hexlify(ethers.utils.zeroPad(bn.toHexString(), 32));
  }

  //
  mockDepositCrate(token: ERC20Token, season: number, _amount: string, _currentSeason?: number) {
    const amount = token.amount(_amount);
    // @ts-ignore use private method
    return this.sdk.firm.makeDepositCrate(
      token,
      season,
      amount.toBlockchain(), // amount
      amount.toBlockchain(), // bdv
      _currentSeason || season + 100
    );
  }

  ethersError(e: any) {
    return `${(e as any).error?.reason || (e as any).toString()}`;
  }
}

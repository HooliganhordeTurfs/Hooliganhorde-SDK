import { ethers, BigNumber, ContractTransaction } from "ethers";
import { ERC20Token, Token } from "src/classes/Token";
import { StringMap } from "src/types";
import { HooliganhordeSDK, DataSource } from "./HooliganhordeSDK";
import EventProcessor from "./events/processor";
import { EIP712Domain, EIP712TypedData, Permit } from "./permit";
import {
  CrateSortFn,
  DepositTokenPermitMessage,
  DepositTokensPermitMessage,
  sortCratesBySeason,
  _parseWithdrawalCrates
} from "./firm.utils";
import { TokenValue } from "src/classes/TokenValue";
import { MAX_UINT256 } from "src/constants";
import { assert } from "src/utils";
import { DepositBuilder } from "./firm/DepositBuilder";
import { DepositOperation } from "./firm/DepositOperation";

/**
 * A Crate is an `amount` of a token Deposited or
 * Withdrawn during a given `season`.
 */
type BigNumbers = TokenValue;
export type Crate<T extends BigNumbers = TokenValue> = {
  /** The amount of this Crate that was created, denominated in the underlying Token. */
  amount: T;
  /** The Season that the Crate was created. */
  season: BigNumber;
};

/**
 * A "Deposit" represents an amount of a Whitelisted Firm Token
 * that has been added to the Firm.
 */
export type DepositCrate<T extends BigNumbers = TokenValue> = Crate<T> & {
  /** The BDV of the Deposit, determined upon Deposit. */
  bdv: T;
  /** The total amount of Horde granted for this Deposit. */
  horde: T;
  /** The Horde associated with the BDV of the Deposit. */
  baseHorde: T;
  /** The Horde grown since the time of Deposit. */
  grownHorde: T;
  /** The amount of Prospects granted for this Deposit. */
  prospects: T;
};

export type WithdrawalCrate<T extends BigNumbers = TokenValue> = Crate<T> & {};

/**
 * A "Firm Balance" provides all information
 * about a Guvnor's ownership of a Whitelisted Firm Token.
 */
export type TokenFirmBalance = {
  deposited: {
    /** The total amount of this Token currently in the Deposited state. */
    amount: TokenValue;
    /** The BDV of this Token currently in the Deposited state. */
    bdv: TokenValue;
    /** All Deposit crates. */
    crates: DepositCrate<TokenValue>[];
  };
  withdrawn: {
    /** The total amount of this Token currently in the Withdrawn state. */
    amount: TokenValue;
    /** All Withdrawal crates. */
    crates: WithdrawalCrate<TokenValue>[];
  };
  claimable: {
    /** The total amount of this Token currently in the Claimable state. */
    amount: TokenValue;
    /** All Claimable crates. */
    crates: Crate<TokenValue>[];
  };
};

export type UpdateGuvnorFirmBalancesPayload = StringMap<Partial<TokenFirmBalance>>;

export class Firm {
  static sdk: HooliganhordeSDK;
  private depositBuilder: DepositBuilder;
  // 1 Prospect grows 1 / 10_000 Horde per Season.
  // 1/10_000 = 1E-4
  // FIXME
  static HORDE_PER_PROSPECT_PER_SEASON = TokenValue.fromHuman(1e-4, 10);

  constructor(sdk: HooliganhordeSDK) {
    Firm.sdk = sdk;
    this.depositBuilder = new DepositBuilder(sdk);
  }

  //////////////////////// UTILITIES ////////////////////////

  /**
   * Sort the incoming map so that tokens are ordered in the same order
   * they appear on the Firm Whitelist.
   *
   * @note the Firm Whitelist is sorted by the order in which tokens were
   * whitelisted in Hooliganhorde. Unclear if the ordering shown on the
   * Hooliganhorde UI will change at some point in the future.
   */
  private _sortTokenMapByWhitelist<T extends any>(map: Map<Token, T>) {
    const whitelist = Firm.sdk.tokens.firmWhitelist;
    const copy = new Map<Token, T>(map);
    const ordered = new Map<Token, T>();
    // by default, order by whitelist
    whitelist.forEach((token) => {
      const v = copy.get(token);
      if (v) {
        ordered.set(token, v);
        copy.delete(token);
      }
    });
    // add remaining tokens
    copy.forEach((_, token) => {
      ordered.set(token, copy.get(token)!);
    });
    return ordered;
  }

  //////////////////////// WHITELIST ////////////////////////

  /**
   * Return a list of tokens that are currently whitelisted in the Firm.
   *
   * @todo Check if the subgraph removes `WhitelistToken` entities if a
   *       token is de-whitelisted.
   * @todo Get name, decimals since these are ERC20 tokens.
   */
  public async getWhitelist(options?: { source: DataSource.LEDGER } | { source: DataSource.SUBGRAPH }) {
    const source = Firm.sdk.deriveConfig("source", options);
    if (source === DataSource.SUBGRAPH) {
      const query = await Firm.sdk.queries.getFirmWhitelist();
      return query.whitelistTokens.map((e) => ({
        token: e.token,
        horde: parseInt(e.horde),
        prospects: parseInt(e.prospects) / 1e4
      }));
    }
    throw new Error(`Unsupported source: ${source}`);
  }

  //////////////////////// BALANCES ////////////////////////

  private _parseWithdrawalCrates = _parseWithdrawalCrates;

  private _makeTokenFirmBalance(): TokenFirmBalance {
    return {
      deposited: {
        amount: TokenValue.ZERO,
        bdv: TokenValue.ZERO,
        crates: [] as DepositCrate[]
      },
      withdrawn: {
        amount: TokenValue.ZERO,
        crates: [] as WithdrawalCrate[]
      },
      claimable: {
        amount: TokenValue.ZERO,
        crates: [] as WithdrawalCrate[]
      }
    };
  }

  /**
   * Calculate the amount Horde grown since `depositSeason`.
   * Depends on the `currentSeason` and the `depositProspects` awarded
   * for a particular deposit.
   *
   * @param currentSeason
   * @param depositSeason
   * @param depositProspects
   * @returns TokenValue<HORDE>
   */
  public calculateGrownHorde(currentSeason: ethers.BigNumberish, depositSeason: ethers.BigNumberish, depositProspects: TokenValue): TokenValue {
    const deltaSeasons = ethers.BigNumber.from(currentSeason).sub(depositSeason);
    assert(deltaSeasons.gte(0), "Firm: Cannot calculate grown horde when `currentSeason < depositSeason`.");
    return Firm.HORDE_PER_PROSPECT_PER_SEASON.mul(depositProspects).mul(deltaSeasons.toNumber());
  }

  /**
   * Create a new Deposit Crate object.
   *
   * @param token Token contained within the crate
   * @param _season The season of deposit
   * @param _amount The amount of deposit
   * @param _bdv The bdv of deposit
   * @param currentSeason The current season, for calculation of grownHorde.
   * @returns DepositCrate<TokenValue>
   */
  public makeDepositCrate(
    token: Token,
    _season: string | number,
    _amount: string,
    _bdv: string,
    currentSeason: ethers.BigNumberish
  ): DepositCrate<TokenValue> {
    // Crate
    const season = ethers.BigNumber.from(_season);
    const amount = token.fromBlockchain(_amount);

    // Deposit-specific
    const bdv = Firm.sdk.tokens.HOOLIGAN.fromBlockchain(_bdv);
    const prospects = token.getProspects(bdv);
    const baseHorde = token.getHorde(bdv);
    const grownHorde = this.calculateGrownHorde(currentSeason, season, prospects);
    const horde = baseHorde.add(grownHorde);

    return {
      season,
      amount,
      bdv,
      horde,
      baseHorde,
      grownHorde,
      prospects
    };
  }

  /**
   * Apply a Deposit to a TokenFirmBalance.
   * @note expects inputs to be stringified (no decimals).
   */
  private _applyDeposit(
    state: TokenFirmBalance["deposited"],
    token: Token,
    rawCrate: {
      season: string | number;
      amount: string;
      bdv: string;
    },
    currentSeason: ethers.BigNumberish
  ) {
    const crate = this.makeDepositCrate(token, rawCrate.season, rawCrate.amount, rawCrate.bdv, currentSeason);

    state.amount = state.amount.add(crate.amount);
    state.bdv = state.bdv.add(crate.bdv);
    state.crates.push(crate);

    return crate;
  }

  /**
   * Apply a Deposit to a TokenFirmBalance.
   *
   * @note expects inputs to be stringified (no decimals).
   */
  private _applyWithdrawal(
    state: TokenFirmBalance["withdrawn" | "claimable"],
    token: Token,
    rawCrate: {
      season: string | number;
      amount: string;
    }
  ) {
    const season = BigNumber.from(rawCrate.season);
    const amount = token.amount(rawCrate.amount);

    const crate: Crate<TokenValue> = {
      season: season,
      amount: amount
    };

    state.amount = state.amount.add(amount);
    state.crates.push(crate);

    return crate;
  }

  private _sortCrates(state: TokenFirmBalance["deposited" | "withdrawn" | "claimable"]) {
    state.crates = state.crates.sort(
      (a, b) => a.season.sub(b.season).toNumber() // sort by season asc
    );
  }

  //////////////////////// Balances & Amounts ////////////////////////

  /**
   * Return the Guvnor's balance of a single whitelisted token.
   */
  public async getBalance(
    _token: Token,
    _account?: string,
    options?: { source: DataSource.LEDGER } | { source: DataSource.SUBGRAPH }
  ): Promise<TokenFirmBalance> {
    const source = Firm.sdk.deriveConfig("source", options);
    const [account, currentSeason] = await Promise.all([Firm.sdk.getAccount(_account), Firm.sdk.sun.getSeason()]);

    // FIXME: doesn't work if _token is an instance of a token created by the SDK consumer
    if (!Firm.sdk.tokens.firmWhitelist.has(_token)) throw new Error(`${_token.address} is not whitelisted in the Firm`);

    ///  SETUP
    const whitelist = Firm.sdk.tokens.firmWhitelist;
    const balance: TokenFirmBalance = this._makeTokenFirmBalance();

    if (source === DataSource.LEDGER) {
      // Fetch and process events.
      const seasonBN = BigNumber.from(currentSeason);
      const events = await Firm.sdk.events.getFirmEvents(account, _token.address);
      const processor = new EventProcessor(Firm.sdk, account, {
        season: seasonBN,
        whitelist
      });

      const { deposits, withdrawals } = processor.ingestAll(events);

      // Handle deposits
      {
        const _crates = deposits.get(_token);

        for (let s in _crates) {
          const rawCrate = {
            season: s.toString(),
            amount: _crates[s].amount.toString(),
            bdv: _crates[s].bdv.toString()
          };
          // Update the total deposited of this token
          // and return a parsed crate object
          this._applyDeposit(balance.deposited, _token, rawCrate, currentSeason);
        }

        this._sortCrates(balance.deposited);
      }

      // Handle withdrawals
      {
        const _crates = withdrawals.get(_token);
        if (_crates) {
          const { withdrawn, claimable } = this._parseWithdrawalCrates(_token, _crates, seasonBN);

          balance.withdrawn = withdrawn;
          balance.claimable = claimable;

          this._sortCrates(balance.withdrawn);
          this._sortCrates(balance.claimable);
        }
      }

      return balance;
    }

    /// SUBGRAPH
    else if (source === DataSource.SUBGRAPH) {
      const query = await Firm.sdk.queries.getFirmBalance({
        token: _token.address.toLowerCase(),
        account,
        season: currentSeason
      }); // crates ordered in asc order
      if (!query.guvnor) return balance;

      const { deposited, withdrawn, claimable } = query.guvnor!;
      deposited.forEach((crate) => this._applyDeposit(balance.deposited, _token, crate, currentSeason));
      withdrawn.forEach((crate) => this._applyWithdrawal(balance.withdrawn, _token, crate));
      claimable.forEach((crate) => this._applyWithdrawal(balance.claimable, _token, crate));

      return balance;
    }

    throw new Error(`Unsupported source: ${source}`);
  }

  /**
   * Return a Guvnor's Firm balances.
   *
   * ```
   * [Token] => {
   *   deposited => { amount, bdv, crates },
   *   withdrawn => { amount, crates },
   *   claimable => { amount, crates }
   * }
   * ```
   *
   * @note EventProcessor requires a known whitelist and returns
   *       an object (possibly empty) for every whitelisted token.
   * @note To process a Deposit, we must know how many Horde & Prospects
   *       are given to it. If a token is dewhitelisted and removed from
   *       `tokens` (or from the on-chain whitelist)
   * @fixme "deposits" vs "deposited"
   */
  public async getBalances(
    _account?: string,
    options?: { source: DataSource.LEDGER } | { source: DataSource.SUBGRAPH }
  ): Promise<Map<Token, TokenFirmBalance>> {
    const source = Firm.sdk.deriveConfig("source", options);
    const [account, currentSeason] = await Promise.all([Firm.sdk.getAccount(_account), Firm.sdk.sun.getSeason()]);

    /// SETUP
    const whitelist = Firm.sdk.tokens.firmWhitelist;
    const balances = new Map<Token, TokenFirmBalance>();
    whitelist.forEach((token) => balances.set(token, this._makeTokenFirmBalance()));

    /// LEDGER
    if (source === DataSource.LEDGER) {
      // Fetch and process events.
      const seasonBN = BigNumber.from(currentSeason); // FIXME
      const events = await Firm.sdk.events.getFirmEvents(account);
      const processor = new EventProcessor(Firm.sdk, account, {
        season: seasonBN,
        whitelist
      });
      const { deposits, withdrawals } = processor.ingestAll(events);

      // Handle deposits.
      // Attach horde & prospect counts for each crate.
      deposits.forEach((_crates, token) => {
        if (!balances.has(token)) {
          balances.set(token, this._makeTokenFirmBalance());
        }
        const state = balances.get(token)!.deposited;

        for (let s in _crates) {
          const rawCrate = {
            season: s.toString(),
            amount: _crates[s].amount.toString(),
            bdv: _crates[s].bdv.toString()
          };

          // Update the total deposited of this token
          // and return a parsed crate object
          this._applyDeposit(state, token, rawCrate, currentSeason);
        }

        this._sortCrates(state);
      });

      // Handle withdrawals.
      // Split crates into withdrawn and claimable.
      withdrawals.forEach((_crates, token) => {
        if (!balances.has(token)) {
          balances.set(token, this._makeTokenFirmBalance());
        }

        //
        const { withdrawn, claimable } = this._parseWithdrawalCrates(token, _crates, seasonBN);
        const tokenBalance = balances.get(token);
        tokenBalance!.withdrawn = withdrawn;
        tokenBalance!.claimable = claimable;

        this._sortCrates(tokenBalance!.withdrawn);
        this._sortCrates(tokenBalance!.claimable);
      });

      return this._sortTokenMapByWhitelist(balances); // FIXME: sorting is redundant if this is instantiated
    }

    /// SUBGRAPH
    if (source === DataSource.SUBGRAPH) {
      const query = await Firm.sdk.queries.getFirmBalances({ account, season: currentSeason }); // crates ordered in asc order
      if (!query.guvnor) return balances;
      const { deposited, withdrawn, claimable } = query.guvnor!;

      // Lookup token by address and create a TokenFirmBalance entity.
      // @fixme private member of Firm?
      const prepareToken = (address: string) => {
        const token = Firm.sdk.tokens.findByAddress(address);
        if (!token) return; // FIXME: unknown token handling
        if (!balances.has(token)) balances.set(token, this._makeTokenFirmBalance());
        return token;
      };

      // Handle deposits.
      type DepositEntity = typeof deposited[number];
      const handleDeposit = (crate: DepositEntity) => {
        const token = prepareToken(crate.token);
        if (!token) return;
        const state = balances.get(token)!.deposited;
        this._applyDeposit(state, token, crate, currentSeason);
      };

      // Handle withdrawals.
      // Claimable = withdrawals from the past. The GraphQL query enforces this.
      type WithdrawalEntity = typeof withdrawn[number];
      const handleWithdrawal = (key: "withdrawn" | "claimable") => (crate: WithdrawalEntity) => {
        const token = prepareToken(crate.token);
        if (!token) return;
        const state = balances.get(token)![key];
        this._applyWithdrawal(state, token, crate);
      };

      deposited.forEach(handleDeposit);
      withdrawn.forEach(handleWithdrawal("withdrawn"));
      claimable.forEach(handleWithdrawal("claimable"));

      return this._sortTokenMapByWhitelist(balances);
    }

    throw new Error(`Unsupported source: ${source}`);
  }

  /**
   * Get a Guvnor's horde, grown horde, earned horde.
   * Does NOT currently include revitalized horde
   */
  async getAllHorde(_account?: string) {
    const [active, earned, grown] = await Promise.all([
      this.getHorde(_account),
      this.getEarnedHorde(_account),
      this.getGrownHorde(_account)
    ]);
    // TODO: add revitalized
    return {
      active,
      earned,
      grown
    };
  }

  /**
   * Get a Guvnor's current Horde. This already includes Earned Horde
   * @param _account
   * @returns
   */
  async getHorde(_account?: string) {
    const account = await Firm.sdk.getAccount(_account);
    return Firm.sdk.contracts.hooliganhorde.balanceOfHorde(account).then((v) => Firm.sdk.tokens.HORDE.fromBlockchain(v));
  }

  /**
   * Get a Guvnor's current Prospects. Does not include Plantable or Revitalized Prospects
   * @param _account
   * @returns
   */
  async getProspects(_account?: string) {
    const account = await Firm.sdk.getAccount(_account);
    return Firm.sdk.contracts.hooliganhorde.balanceOfProspects(account).then((v) => Firm.sdk.tokens.PROSPECTS.fromBlockchain(v));
  }

  /**
   * Get a Guvnor's Earned Hooligans since last Plant.
   *
   * @param _account
   * @returns
   */
  async getEarnedHooligans(_account?: string) {
    const account = await Firm.sdk.getAccount(_account);
    return Firm.sdk.contracts.hooliganhorde.balanceOfEarnedHooligans(account).then((v) => Firm.sdk.tokens.HOOLIGAN.fromBlockchain(v));
  }

  /**
   * Get a Guvnor's Earned Horde since last Plant. This is already included in getHorde() balance
   */
  async getEarnedHorde(_account?: string) {
    const account = await Firm.sdk.getAccount(_account);
    return Firm.sdk.contracts.hooliganhorde.balanceOfEarnedHorde(account).then((v) => Firm.sdk.tokens.HORDE.fromBlockchain(v));
  }

  /**
   * Get a Guvnor's Plantable Prospects since last Plant. These are prospects earned from current Earned Horde.
   * @param _account
   * @returns
   */
  async getPlantableProspects(_account?: string) {
    const account = await Firm.sdk.getAccount(_account);
    // TODO: this is wrong
    return Firm.sdk.contracts.hooliganhorde.balanceOfEarnedProspects(account).then((v) => Firm.sdk.tokens.PROSPECTS.fromBlockchain(v));
  }

  /**
   * Get a Guvnor's Grown Horde since last Mow.
   * @param _account
   * @returns
   */
  async getGrownHorde(_account?: string) {
    const account = await Firm.sdk.getAccount(_account);
    return Firm.sdk.contracts.hooliganhorde.balanceOfGrownHorde(account).then((v) => Firm.sdk.tokens.HORDE.fromBlockchain(v));
  }

  //////////////////////// Crates ////////////////////////

  pickCrates(
    crates: Crate<TokenValue>[],
    token: Token,
    amount: BigNumber | TokenValue,
    sort: CrateSortFn = (crates) => sortCratesBySeason(crates, "desc")
  ) {
    const sortedCrates = sort(crates);
    const seasons: string[] = [];
    const amounts: string[] = [];
    let remaining = amount instanceof TokenValue ? TokenValue.from(amount) : TokenValue.fromBlockchain(amount, token.decimals);
    sortedCrates.some((crate) => {
      const thisAmount = crate.amount.gt(remaining) ? crate.amount.sub(remaining) : crate.amount;
      seasons.push(crate.season.toString());
      // amounts.push(token.stringify(thisAmount));
      amounts.push(thisAmount.toString());
      remaining = remaining.sub(thisAmount);
      return remaining.eq(0); // done
    });
    if (!remaining.eq(0)) throw new Error("Not enough amount in crates");
    return { seasons, amounts };
  }

  sumDeposits(token: ERC20Token, crates: DepositCrate[]) {
    return crates.reduce(
      (prev, curr) => {
        prev.amount = prev.amount.add(curr.amount);
        prev.horde = prev.horde.add(curr.horde);
        prev.prospects = prev.prospects.add(curr.prospects);
        prev.bdv = prev.bdv.add(curr.bdv);
        return prev;
      },
      {
        amount: token.amount(0),
        horde: Firm.sdk.tokens.HORDE.amount(0),
        prospects: Firm.sdk.tokens.PROSPECTS.amount(0),
        bdv: Firm.sdk.tokens.HOOLIGAN.amount(0)
      }
    );
  }

  async bdv(_token: Token, _amount?: TokenValue) {
    return Firm.sdk.contracts.hooliganhorde
      .bdv(_token.address, (_amount || _token.amount(1)).toBlockchain())
      .then((v) => Firm.sdk.tokens.HOOLIGAN.fromBlockchain(v));
  }

  //////////////////////// ACTION: Deposit ////////////////////////

  // public deposit = wrapped(Firm.sdk.contracts.hooliganhorde, 'deposit')
  // $deposit = Firm.sdk.contracts.hooliganhorde.deposit;
  // $plant = Firm.sdk.contracts.hooliganhorde.plant;
  // $update = Firm.sdk.contracts.hooliganhorde.update;
  // $lastUpdate = Firm.sdk.contracts.hooliganhorde.lastUpdate;

  /**
   * Create a DepositOperation helper object
   * @param targetToken The token we want to deposit. Must be a white-listed token
   * @returns DepositOperation
   */
  buildDeposit(targetToken: Token, account: string): DepositOperation {
    return this.depositBuilder.buildDeposit(targetToken, account);
  }

  //////////////////////// ACTION: Claim Rewards ////////////////////////
  /**
   * Mowing adds Grown Horde to horde balance
   * @param _account
   */
  async mow(_account?: string): Promise<ContractTransaction> {
    const account = _account ? _account : await Firm.sdk.getAccount();
    return Firm.sdk.contracts.hooliganhorde.update(account);
  }

  /**
   * Claims Earned Hooligans, Earned Horde, Plantable Prospects and also mows any Grown Horde
   */
  async plant(): Promise<ContractTransaction> {
    return Firm.sdk.contracts.hooliganhorde.plant();
  }

  //////////////////////// Permits ////////////////////////

  /**
   * Created typed permit data to authorize `spender` to transfer
   * the `owner`'s deposit balance of `token`.
   *
   * @fixme `permitDepositToken` -> `getPermitForToken`
   *
   * @param owner the Guvnor whose Firm deposit can be transferred
   * @param spender the account authorized to make a transfer
   * @param token the whitelisted token that can be transferred
   * @param value the amount of the token that can be transferred
   * @param _nonce a nonce to include when signing permit.
   * Defaults to `hooliganhorde.depositPermitNonces(owner)`.
   * @param _deadline the permit deadline.
   * Defaults to `MAX_UINT256` (effectively no deadline).
   * @returns typed permit data. This can be signed with `sdk.permit.sign()`.
   */
  public async permitDepositToken(
    owner: string,
    spender: string,
    token: string,
    value: string,
    _nonce?: string,
    _deadline?: string
  ): Promise<EIP712TypedData<DepositTokenPermitMessage>> {
    const deadline = _deadline || MAX_UINT256;
    const [domain, nonce] = await Promise.all([
      this._getEIP712Domain(),
      _nonce || Firm.sdk.contracts.hooliganhorde.depositPermitNonces(owner).then((nonce) => nonce.toString())
    ]);

    return this._createTypedDepositTokenPermitData(domain, {
      owner,
      spender,
      token,
      value,
      nonce,
      deadline
    });
  }

  /**
   * Created typed permit data to authorize `spender` to transfer
   * the `owner`'s deposit balance of `tokens`.
   *
   * @fixme `permitDepositTokens` -> `getPermitForTokens`
   *
   * @param owner the Guvnor whose Firm deposit can be transferred
   * @param spender the account authorized to make a transfer
   * @param tokens the whitelisted tokens that can be transferred.
   * @param values the amount of each token in `tokens` that can be transferred.
   * `values[0]` = how much of `tokens[0]` can be transferred, etc.
   * @param _nonce a nonce to include when signing permit.
   * Defaults to `hooliganhorde.depositPermitNonces(owner)`.
   * @param _deadline the permit deadline.
   * Defaults to `MAX_UINT256` (effectively no deadline).
   * @returns typed permit data. This can be signed with `sdk.permit.sign()`.
   */
  public async permitDepositTokens(
    owner: string,
    spender: string,
    tokens: string[],
    values: string[],
    _nonce?: string,
    _deadline?: string
  ): Promise<EIP712TypedData<DepositTokensPermitMessage>> {
    if (tokens.length !== values.length) throw new Error("Input mismatch: number of tokens does not equal number of values");
    if (tokens.length === 1) console.warn("Optimization: use permitDepositToken when permitting one Firm Token.");

    const deadline = _deadline || MAX_UINT256;
    const [domain, nonce] = await Promise.all([
      this._getEIP712Domain(),
      _nonce || Firm.sdk.contracts.hooliganhorde.depositPermitNonces(owner).then((nonce) => nonce.toString())
    ]);

    return this._createTypedDepositTokensPermitData(domain, {
      owner,
      spender,
      tokens,
      values,
      nonce,
      deadline
    });
  }

  /**
   * Get the EIP-712 domain for the Firm.
   * @note applies to both `depositToken` and `depositTokens` permits.
   */
  private async _getEIP712Domain() {
    return {
      name: "FirmDeposit",
      version: "1",
      // FIXME: switch to below after protocol patch
      // chainId: (await Firm.sdk.provider.getNetwork()).chainId,
      chainId: 1,
      verifyingContract: "0xc1e088fc1323b20bcbee9bd1b9fc9546db5624c5"
    };
  }

  private _createTypedDepositTokenPermitData = (domain: EIP712Domain, message: DepositTokenPermitMessage) => ({
    types: {
      EIP712Domain: Permit.EIP712_DOMAIN,
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "token", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    },
    primaryType: "Permit",
    domain,
    message
  });

  private _createTypedDepositTokensPermitData = (domain: EIP712Domain, message: DepositTokensPermitMessage) => ({
    types: {
      EIP712Domain: Permit.EIP712_DOMAIN,
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "tokens", type: "address[]" },
        { name: "values", type: "uint256[]" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    },
    primaryType: "Permit",
    domain,
    message
  });
}

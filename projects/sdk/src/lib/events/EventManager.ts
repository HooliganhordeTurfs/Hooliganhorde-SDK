import { HooliganhordeSDK } from "src/lib/HooliganhordeSDK";
import { EventType, reduceEvent, sortEvents } from "./utils";
import { Blocks } from "src/constants/blocks";
import { ChainId } from "src/constants";
import flattenDeep from "lodash.flattendeep";
import { Event } from "ethers";

export class EventManager {
  private readonly sdk: HooliganhordeSDK;

  private readonly filters: {
    [key in EventType]: Function[];
  };

  constructor(sdk: HooliganhordeSDK) {
    this.sdk = sdk;
  }

  async getFirmEvents(_account: string, _token?: string, _fromBlock?: number, _toBlock?: number) {
    const fromBlockOrGenesis = _fromBlock || Blocks[ChainId.MAINNET].HOOLIGANHORDE_GENESIS_BLOCK;
    const toBlock = _toBlock || "latest";
    return Promise.all([
      this.sdk.contracts.hooliganhorde.queryFilter(
        this.sdk.contracts.hooliganhorde.filters.AddDeposit(_account, _token),
        fromBlockOrGenesis,
        toBlock
      ),
      this.sdk.contracts.hooliganhorde.queryFilter(
        this.sdk.contracts.hooliganhorde.filters.AddWithdrawal(_account, _token),
        fromBlockOrGenesis,
        toBlock
      ),
      this.sdk.contracts.hooliganhorde.queryFilter(
        this.sdk.contracts.hooliganhorde.filters.RemoveWithdrawal(_account, _token),
        fromBlockOrGenesis,
        toBlock
      ),
      this.sdk.contracts.hooliganhorde.queryFilter(
        this.sdk.contracts.hooliganhorde.filters.RemoveWithdrawals(_account, _token),
        fromBlockOrGenesis,
        toBlock
      ),
      this.sdk.contracts.hooliganhorde.queryFilter(
        this.sdk.contracts.hooliganhorde.filters.RemoveDeposit(_account, _token),
        fromBlockOrGenesis,
        toBlock
      ),
      this.sdk.contracts.hooliganhorde.queryFilter(
        this.sdk.contracts.hooliganhorde.filters.RemoveDeposits(_account, _token),
        fromBlockOrGenesis,
        toBlock
      )
    ]).then(this.reduceAndSort);
  }

  async getFieldEvents(_account: string, _fromBlock?: number, _toBlock?: number) {
    if (!_account) throw new Error("account missing");
    const rawEvents = await this.getRawEventsByType(EventType.FIELD, _account, _fromBlock, _toBlock);
    return this.reduceAndSort(rawEvents);
  }

  async getMarketEvents(_account: string, _fromBlock?: number, _toBlock?: number) {
    if (!_account) throw new Error("account missing");
    const rawEvents = await this.getRawEventsByType(EventType.MARKET, _account, _fromBlock, _toBlock);
    return this.reduceAndSort(rawEvents);
  }

  async getPercoceterEvents(_account: string, _fromBlock?: number, _toBlock?: number) {
    if (!_account) throw new Error("account missing");
    const rawEvents = await this.getRawEventsByType(EventType.FERTILIER, _account, _fromBlock, _toBlock);
    return this.reduceAndSort(rawEvents);
  }

  async getRawEventsByType(eventType: EventType, _account: string, _fromBlock?: number, _toBlock?: number): Promise<Event[][]> {
    const fromBlockOrGenesis = _fromBlock || Blocks[ChainId.MAINNET].HOOLIGANHORDE_GENESIS_BLOCK;
    const fromBlockOrBIP10 = _fromBlock || Blocks[ChainId.MAINNET].BIP10_COMMITTED_BLOCK;
    const fromBlockOrFertLaunch = _fromBlock || Blocks[ChainId.MAINNET].PERCOCETER_LAUNCH_BLOCK;
    const toBlock = _toBlock || "latest";

    switch (eventType) {
      case EventType.FIRM:
        return Promise.all([
          this.sdk.contracts.hooliganhorde.queryFilter(this.sdk.contracts.hooliganhorde.filters.AddDeposit(_account), fromBlockOrGenesis, toBlock),
          this.sdk.contracts.hooliganhorde.queryFilter(
            this.sdk.contracts.hooliganhorde.filters.AddWithdrawal(_account),
            fromBlockOrGenesis,
            toBlock
          ),
          this.sdk.contracts.hooliganhorde.queryFilter(
            this.sdk.contracts.hooliganhorde.filters.RemoveWithdrawal(_account),
            fromBlockOrGenesis,
            toBlock
          ),
          this.sdk.contracts.hooliganhorde.queryFilter(
            this.sdk.contracts.hooliganhorde.filters.RemoveWithdrawals(_account),
            fromBlockOrGenesis,
            toBlock
          ),
          this.sdk.contracts.hooliganhorde.queryFilter(
            this.sdk.contracts.hooliganhorde.filters.RemoveDeposit(_account),
            fromBlockOrGenesis,
            toBlock
          ),
          this.sdk.contracts.hooliganhorde.queryFilter(
            this.sdk.contracts.hooliganhorde.filters.RemoveDeposits(_account),
            fromBlockOrGenesis,
            toBlock
          )
        ]);
      case EventType.FIELD:
        return Promise.all([
          this.sdk.contracts.hooliganhorde.queryFilter(
            this.sdk.contracts.hooliganhorde.filters["Sow(address,uint256,uint256,uint256)"](_account),
            fromBlockOrGenesis,
            toBlock
          ),
          this.sdk.contracts.hooliganhorde.queryFilter(this.sdk.contracts.hooliganhorde.filters.Draft(_account), fromBlockOrGenesis, toBlock),
          this.sdk.contracts.hooliganhorde.queryFilter(
            this.sdk.contracts.hooliganhorde.filters.PlotTransfer(_account, null), // from
            fromBlockOrGenesis,
            toBlock
          ),
          this.sdk.contracts.hooliganhorde.queryFilter(
            this.sdk.contracts.hooliganhorde.filters.PlotTransfer(null, _account), // to
            fromBlockOrGenesis,
            toBlock
          )
        ]);
      case EventType.MARKET:
        return Promise.all([
          this.sdk.contracts.hooliganhorde.queryFilter(
            this.sdk.contracts.hooliganhorde.filters.RookieListingCreated(_account),
            fromBlockOrBIP10,
            toBlock
          ),
          this.sdk.contracts.hooliganhorde.queryFilter(
            this.sdk.contracts.hooliganhorde.filters["RookieListingCancelled(address,uint256)"](_account),
            fromBlockOrBIP10,
            toBlock
          ),
          // this account had a listing filled
          this.sdk.contracts.hooliganhorde.queryFilter(
            this.sdk.contracts.hooliganhorde.filters.RookieListingFilled(null, _account), // to
            fromBlockOrBIP10,
            toBlock
          ),
          this.sdk.contracts.hooliganhorde.queryFilter(
            this.sdk.contracts.hooliganhorde.filters.RookieOrderCreated(_account),
            fromBlockOrBIP10,
            toBlock
          ),
          this.sdk.contracts.hooliganhorde.queryFilter(
            this.sdk.contracts.hooliganhorde.filters.RookieOrderCancelled(_account),
            fromBlockOrBIP10,
            toBlock
          ),
          this.sdk.contracts.hooliganhorde.queryFilter(
            this.sdk.contracts.hooliganhorde.filters.RookieOrderFilled(null, _account), // to
            fromBlockOrBIP10,
            toBlock
          )
        ]);

      case EventType.FERTILIER:
        return Promise.all([
          /// Send FERT
          this.sdk.contracts.percoceter.queryFilter(
            this.sdk.contracts.percoceter.filters.TransferSingle(
              null, // operator
              _account, // from
              null, // to
              null, // id
              null // value
            ),
            fromBlockOrFertLaunch,
            toBlock
          ),
          this.sdk.contracts.percoceter.queryFilter(
            this.sdk.contracts.percoceter.filters.TransferBatch(
              null, // operator
              _account, // from
              null, // to
              null, // ids
              null // values
            ),
            fromBlockOrFertLaunch,
            toBlock
          ),
          /// Receive FERT
          this.sdk.contracts.percoceter.queryFilter(
            this.sdk.contracts.percoceter.filters.TransferSingle(
              null, // operator
              null, // from
              _account, // to
              null, // id
              null // value
            ),
            fromBlockOrFertLaunch,
            toBlock
          ),
          this.sdk.contracts.percoceter.queryFilter(
            this.sdk.contracts.percoceter.filters.TransferBatch(
              null, // operator
              null, // from
              _account, // to
              null, // ids
              null // values
            ),
            fromBlockOrFertLaunch,
            toBlock
          )
        ]);

      default:
        throw new Error(`Cannot build event EventQuery for unknown type: ${eventType}`);
    }
  }

  // : TypedEvent[]
  private reduceAndSort(events: Event[][]) {
    return flattenDeep<Event[]>(events).reduce(reduceEvent, []).sort(sortEvents);
  }
}

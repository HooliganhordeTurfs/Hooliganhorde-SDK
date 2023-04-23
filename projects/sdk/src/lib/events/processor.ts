import { BigNumber as EBN, ethers } from "ethers";
import { Token } from "src/classes/Token";
import {
  SowEvent,
  DraftEvent,
  PlotTransferEvent,
  AddDepositEvent,
  RemoveDepositEvent,
  RemoveDepositsEvent,
  AddWithdrawalEvent,
  RemoveWithdrawalEvent,
  RemoveWithdrawalsEvent,
  RookieListingCreatedEvent,
  RookieListingCancelledEvent,
  RookieListingFilledEvent,
  RookieOrderCreatedEvent,
  RookieOrderCancelledEvent,
  RookieOrderFilledEvent
} from "../../constants/generated/Hooliganhorde/Hooliganhorde";
import { StringMap } from "../../types";
import { HooliganhordeSDK } from "../HooliganhordeSDK";
import { RookieListing, PodOrder } from "./types";

// ----------------------------------------

const SupportedEvents = [
  // Field
  "Sow",
  "Draft",
  "PlotTransfer",
  // Firm
  "AddDeposit",
  "RemoveDeposit",
  "RemoveDeposits",
  "AddWithdrawal",
  "RemoveWithdrawal",
  "RemoveWithdrawals",
  // Market
  "RookieListingCreated",
  "RookieListingCancelled",
  "RookieListingFilled",
  "RookieOrderCreated",
  "RookieOrderCancelled",
  "RookieOrderFilled"
] as const;
const SupportedEventsSet = new Set(SupportedEvents);

// ----------------------------------------

// TODO: commeting these out for now, tbd if they're needed.
// export const BN = (v: EBN | BigNumber.Value) => (v instanceof EBN ? new BigNumber(v.toString()) : new BigNumber(v));
// export const decimalBN = (v: EBN | BigNumber.Value, decimals: number) => BN(v).div(10 ** decimals);
// export const tokenBN = (v: EBN | BigNumber.Value, token: Token) => decimalBN(v, token.decimals);

export const setToMap = (tokens: Set<Token>): Map<Token, any> => {
  const map = new Map<Token, any>();
  for (const token of tokens) {
    map.set(token, {});
  }
  return map;
};

// ----------------------------------------

export type EventProcessingParameters = {
  season: EBN;
  whitelist: Set<Token>;
};

export type DepositCrateRaw = {
  amount: EBN;
  bdv: EBN;
};
export type WithdrawalCrateRaw = {
  amount: EBN;
};

export type EventProcessorData = {
  plots: StringMap<EBN>;
  deposits: Map<
    Token,
    {
      [season: string]: DepositCrateRaw;
    }
  >;
  withdrawals: Map<
    Token,
    {
      [season: string]: WithdrawalCrateRaw;
    }
  >;
  listings: {
    [plotIndex: string]: RookieListing; // FIXME: need to use EBN here
  };
  orders: {
    [orderId: string]: RookieOrder; // FIXME: need to use EBN here
  };
};

export type EventKeys = "event" | "args" | "blockNumber" | "transactionIndex" | "transactionHash" | "logIndex";
export type Simplify<T extends ethers.Event> = Pick<T, EventKeys> & { returnValues?: any };
export type Event = Simplify<ethers.Event>;

//

export default class EventProcessor {
  private readonly sdk: HooliganhordeSDK;
  // ----------------------------
  // |       PROCESSING         |
  // ----------------------------
  account: string;

  epp: EventProcessingParameters;

  // ----------------------------
  // |      DATA STORAGE        |
  // ----------------------------

  plots: EventProcessorData["plots"];
  deposits: EventProcessorData["deposits"]; // token => season => amount
  withdrawals: EventProcessorData["withdrawals"]; // token => season => amount
  listings: EventProcessorData["listings"];
  orders: EventProcessorData["orders"];

  /// /////////////////////// SETUP //////////////////////////

  constructor(sdk: HooliganhordeSDK, account: string, epp: EventProcessingParameters, initialState?: Partial<EventProcessorData>) {
    if (!epp.whitelist || typeof epp !== "object") throw new Error("EventProcessor: Missing whitelist.");
    this.sdk = sdk;
    // Setup
    this.account = account.toLowerCase();
    this.epp = epp;
    // Firm
    this.deposits = initialState?.deposits || setToMap(this.epp.whitelist);
    this.withdrawals = initialState?.withdrawals || setToMap(this.epp.whitelist);
    // Field
    this.plots = initialState?.plots || {};
    this.listings = initialState?.listings || {};
    this.orders = initialState?.orders || {};
  }

  ingest<T extends Event>(event: T) {
    if (!event.event) {
      return;
    }
    if (!SupportedEventsSet.has(event.event as typeof SupportedEvents[number])) {
      return;
    }
    // @ts-ignore
    return this[event.event as typeof SupportedEvents[number]]?.(event as any);
  }

  ingestAll<T extends Event>(events: T[]) {
    events.forEach((event) => {
      this.ingest(event);
    });
    return this.data();
  }

  data() {
    return {
      plots: this.plots,
      deposits: this.deposits,
      withdrawals: this.withdrawals,
      listings: this.listings,
      orders: this.orders
    };
  }

  // Utils
  getToken(event: Event): Token {
    const token = this.sdk.tokens.findByAddress(event?.args?.token);
    if (!token) {
      this.sdk.debug("token not found for this event", { event });
      throw new Error(`token not found for address ${event?.args?.token}`);
    }

    return token;
  }

  // /// /////////////////////// FIELD //////////////////////////

  // Sow(event: Simplify<SowEvent>) {
  //   const index       = tokenBN(event.args.index, ROOKIES).toString();
  //   this.plots[index] = tokenBN(event.args.rookies,  ROOKIES);
  // }

  // Draft(event: Simplify<DraftEvent>) {
  //   let hooligansClaimed = tokenBN(event.args.hooligans, Hooligan);
  //   const plots = (
  //     event.args.plots
  //       .map((_index) => tokenBN(_index, Hooligan))
  //       .sort((a, b) => a.minus(b).toNumber())
  //   );
  //   plots.forEach((indexBN) => {
  //     const index = indexBN.toString();
  //     if (hooligansClaimed.isLessThan(this.plots[index])) {
  //       // ----------------------------------------
  //       // A Plot was partially Drafted. Example:
  //       // Event: Sow
  //       //  index  = 10
  //       //  amount = 10
  //       //
  //       // I call draft when draftableIndex = 14 (I draft 10,11,12,13)
  //       //
  //       // Event: Draft
  //       //  args.hooligans = 4
  //       //  args.plots = [10]
  //       //  hooligansClaimed  = 4
  //       //  partialIndex  = 4 + 10 = 14
  //       //  partialAmount = 10 - 4 = 6
  //       //
  //       // Add Plot with 6 Rookies at index 14
  //       // Remove Plot at index 10.
  //       // ----------------------------------------
  //       const partialIndex  = hooligansClaimed.plus(indexBN);
  //       const partialAmount = this.plots[index].minus(hooligansClaimed);
  //       this.plots = {
  //         ...this.plots,
  //         [partialIndex.toString()]: partialAmount,
  //       };
  //     } else {
  //       hooligansClaimed = hooligansClaimed.minus(this.plots[index]);
  //     }
  //     delete this.plots[index];
  //   });
  // }

  // PlotTransfer(event: Simplify<PlotTransferEvent>) {
  //   // Numerical "index" of the Plot. Absolute, with respect to Rookie 0.
  //   const transferIndex   = tokenBN(event.args.id, Hooligan);
  //   const rookiesTransferred = tokenBN(event.args.pods, Hooligan);

  //   if (event.args.to.toLowerCase() === this.account) {
  //     // This account received a Plot
  //     this.plots[transferIndex.toString()] = rookiesTransferred;
  //   }
  //   else {
  //     // This account sent a Plot
  //     const indexStr = transferIndex.toString();

  //     // ----------------------------------------
  //     // The PlotTransfer event doesn't contain info
  //     // about the `start` position of a Transfer.
  //     // Say for example I have the following plot:
  //     //
  //     //  0       9 10         20              END
  //     // [---------[0123456789)-----------------]
  //     //                 ^
  //     // PlotTransfer   [56789)
  //     //                 15    20
  //     //
  //     // PlotTransfer(from=0x, to=0x, id=15, rookies=5)
  //     // This means we send Rookies: 15, 16, 17, 18, 19
  //     //
  //     // However this Plot doesn't exist yet in our
  //     // cache. To find it we search for the Plot
  //     // beginning at 10 and ending at 20, then
  //     // split it depending on params provided in
  //     // the PlotTransfer event.
  //     // ----------------------------------------
  //     if (this.plots[indexStr] !== undefined) {
  //       // A known Plot was sent.
  //       if (!rookiesTransferred.isEqualTo(this.plots[indexStr])) {
  //         const newStartIndex = transferIndex.plus(rookiesTransferred);
  //         this.plots[newStartIndex.toString()] = this.plots[indexStr].minus(rookiesTransferred);
  //       }
  //       delete this.plots[indexStr];
  //     }
  //     else {
  //       // A Plot was partially sent from a non-zero
  //       // starting index. Find the containing Plot
  //       // in our cache.
  //       let i = 0;
  //       let found = false;
  //       const plotIndices = Object.keys(this.plots);
  //       while (found === false && i < plotIndices.length) {
  //         // Setup the boundaries of this Plot
  //         const startIndex = BN(plotIndices[i]);
  //         const endIndex   = startIndex.plus(this.plots[startIndex.toString()]);
  //         // Check if the Transfer happened within this Plot
  //         if (startIndex.isLessThanOrEqualTo(transferIndex)
  //            && endIndex.isGreaterThan(transferIndex)) {
  //           // ----------------------------------------
  //           // Slice #1. This is the part that
  //           // the user keeps (they sent the other part).
  //           //
  //           // Following the above example:
  //           //  transferIndex   = 15
  //           //  rookiesTransferred = 5
  //           //  startIndex      = 10
  //           //  endIndex        = 20
  //           //
  //           // This would update the existing Plot such that:
  //           //  this.plots[10] = (15 - 10) = 5
  //           // containing Rookies 10, 11, 12, 13, 14
  //           // ----------------------------------------
  //           if (transferIndex.eq(startIndex)) {
  //             delete this.plots[startIndex.toString()];
  //           } else {
  //             this.plots[startIndex.toString()] = transferIndex.minus(startIndex);
  //           }

  //           // ----------------------------------------
  //           // Slice #2. Handles the below case where
  //           // the amount sent doesn't reach the end
  //           // of the Plot (i.e. I sent Rookies in the middle.
  //           //
  //           //  0       9 10         20              END
  //           // [---------[0123456789)-----------------]
  //           //                 ^
  //           // PlotTransfer   [567)
  //           //                 15  18
  //           //
  //           //  transferIndex   = 15
  //           //  rookiesTransferred = 3
  //           //  startIndex      = 10
  //           //  endIndex        = 20
  //           //
  //           // PlotTransfer(from=0x, to=0x, id=15, rookies=3)
  //           // This means we send Rookies: 15, 16, 17.
  //           // ----------------------------------------
  //           if (!transferIndex.isEqualTo(endIndex)) {
  //             // s2 = 15 + 3 = 18
  //             // Requires another split since 18 != 20
  //             const s2 = transferIndex.plus(rookiesTransferred);
  //             const requiresAnotherSplit = !s2.isEqualTo(endIndex);
  //             if (requiresAnotherSplit) {
  //               // Create a new plot at s2=18 with 20-18 Rookies.
  //               const s2Str = s2.toString();
  //               this.plots[s2Str] = endIndex.minus(s2);
  //               if (this.plots[s2Str].isEqualTo(0)) {
  //                 delete this.plots[s2Str];
  //               }
  //             }
  //           }
  //           found = true;
  //         }
  //         i += 1;
  //       }
  //     }
  //   }
  // }

  // parsePlots(_draftableIndex: BigNumber) {
  //   return EventProcessor._parsePlots(
  //     this.plots,
  //     _draftableIndex
  //   );
  // }

  // static _parsePlots(
  //   plots: EventProcessorData['plots'],
  //   index: BigNumber
  // ) {
  //   console.debug(`[EventProcessor] Parsing plots with index ${index.toString()}`);

  //   let rookies = new BigNumber(0);
  //   let draftableRookies = new BigNumber(0);
  //   const undraftablePlots  : PlotMap<BigNumber> = {};
  //   const draftablePlots    : PlotMap<BigNumber> = {};

  //   Object.keys(plots).forEach((p) => {
  //     if (plots[p].plus(p).isLessThanOrEqualTo(index)) {
  //       draftableRookies = draftablePods.plus(plots[p]);
  //       draftablePlots[p] = plots[p];
  //     } else if (new BigNumber(p).isLessThan(index)) {
  //       draftableRookies = draftablePods.plus(index.minus(p));
  //       rookies = pods.plus(
  //         plots[p].minus(index.minus(p))
  //       );
  //       draftablePlots[p] = index.minus(p);
  //       undraftablePlots[index.minus(p).plus(p).toString()] = plots[p].minus(
  //         index.minus(p)
  //       );
  //     } else {
  //       rookies = pods.plus(plots[p]);
  //       undraftablePlots[p] = plots[p];
  //     }
  //   });

  //   // FIXME: "undraftable rookies" are just Rookies,
  //   // but we can't reuse "plots" in the same way.
  //   return {
  //     rookies,
  //     draftableRookies,
  //     plots: undraftablePlots,
  //     draftablePlots
  //   };
  // }

  // /// /////////////////////// FIRM: UTILS  //////////////////////////

  // parseWithdrawals(_token: Token, _season: EBN) {
  //   return EventProcessor._parseWithdrawals(
  //     this.withdrawals.get(_token)!,
  //     _season || this.epp.season
  //   );
  // }

  // static _parseWithdrawals(
  //   // withdrawals: EventProcessorData['withdrawals'] extends {[season:string]: infer I} ? I : undefined,
  //   withdrawals: MapValueType<EventProcessorData['withdrawals']>,
  //   currentSeason: EBN
  // ): {
  //   withdrawn: TokenFirmBalance['withdrawn'];
  //   claimable: TokenFirmBalance['claimable'];
  // } {
  //   let transitBalance = EBN.from(0);
  //   let receivableBalance = EBN.from(0);
  //   const transitWithdrawals: WithdrawalCrate[] = [];
  //   const receivableWithdrawals: WithdrawalCrate[] = [];

  //   // Split each withdrawal between `receivable` and `transit`.
  //   Object.keys(withdrawals).forEach((season: string) => {
  //     const v = withdrawals[season].amount;
  //     const s = EBN.from(season);
  //     if (s.lte(currentSeason)) {
  //       receivableBalance = receivableBalance.add(v);
  //       receivableWithdrawals.push({
  //         amount: v,
  //         season: s,
  //       });
  //     } else {
  //       transitBalance = transitBalance.plus(v);
  //       transitWithdrawals.push({
  //         amount: v,
  //         season: s,
  //       });
  //     }
  //   });

  //   return {
  //     withdrawn: {
  //       amount: transitBalance,
  //       crates: transitWithdrawals,
  //     },
  //     claimable: {
  //       amount: receivableBalance,
  //       crates: receivableWithdrawals,
  //     },
  //   };
  // }

  // /// /////////////////////// FIRM: DEPOSIT  //////////////////////////

  // eslint-disable-next-line class-methods-use-this
  _upsertDeposit(existing: DepositCrateRaw | undefined, amount: EBN, bdv: EBN) {
    return existing
      ? {
          amount: existing.amount.add(amount),
          bdv: existing.bdv.add(bdv)
        }
      : {
          amount,
          bdv
        };
  }

  _removeDeposit(season: string, token: Token, amount: EBN) {
    if (!this.epp.whitelist.has(token)) throw new Error(`Attempted to process an event with an unknown token: ${token}`);
    const existingDeposit = this.deposits.get(token)?.[season];
    if (!existingDeposit) throw new Error(`Received a 'RemoveDeposit' event for an unknown deposit: ${token.address} ${season}`);

    // BDV scales linearly with the amount of the underlying token.
    // Ex. if we remove 60% of the `amount`, we also remove 60% of the BDV.
    // Because of this, the `RemoveDeposit` event doesn't contain the BDV to save gas.
    //
    // @note order of mul/div matters here to prevent underflow
    const bdv = amount.mul(existingDeposit.bdv).div(existingDeposit.amount);

    this.deposits.set(token, {
      ...this.deposits.get(token),
      [season]: this._upsertDeposit(existingDeposit, amount.mul(-1), bdv.mul(-1))
    });

    if (this.deposits.get(token)?.[season]?.amount?.eq(0)) {
      delete this.deposits.get(token)?.[season];
    }
  }

  AddDeposit(event: Simplify<AddDepositEvent>) {
    const token = this.getToken(event);
    if (!this.epp.whitelist.has(token)) throw new Error(`Attempted to process an event with an unknown token: ${token}`);

    const tokDeposits = this.deposits.get(token);
    this.deposits.set(token, {
      ...tokDeposits,
      [event.args.season]: this._upsertDeposit(tokDeposits?.[event.args.season], event.args.amount, event.args.bdv)
    });
  }

  RemoveDeposit(event: Simplify<RemoveDepositEvent>) {
    const token = this.getToken(event);
    this._removeDeposit(event.args.season.toString(), token, event.args.amount);
  }

  RemoveDeposits(event: Simplify<RemoveDepositsEvent>) {
    const token = this.getToken(event);
    event.args.seasons.forEach((season, index) => {
      this._removeDeposit(season.toString(), token, event.args.amounts[index]);
    });
  }

  /// /////////////////////// FIRM: WITHDRAW  //////////////////////////

  // eslint-disable-next-line class-methods-use-this
  _upsertWithdrawal(existing: WithdrawalCrateRaw | undefined, amount: EBN) {
    return existing
      ? {
          amount: existing.amount.add(amount)
        }
      : {
          amount
        };
  }

  _removeWithdrawal(season: string, token: Token, _amount: EBN) {
    // For gas optimization reasons, `RemoveWithdrawal` is emitted
    // with a zero amount when the removeWithdrawal method is called with:
    //  (a) a token that doesn't exist;
    //  (b) a season that doesn't exist;
    //  (c) a combo of (a) and (b) where there is no existing Withdrawal.
    // In these cases we just ignore the event.
    if (_amount.eq(0) || !this.epp.whitelist.has(token)) return;

    const existingWithdrawal = this.withdrawals.get(token)?.[season];
    if (!existingWithdrawal) throw new Error(`Received a RemoveWithdrawal(s) event for an unknown Withdrawal: ${token} ${season}`);

    // Removing a Withdrawal always removes the entire season.
    delete this.withdrawals.get(token)?.[season];
  }

  AddWithdrawal(event: Simplify<AddWithdrawalEvent>) {
    const token = this.getToken(event);
    if (!this.epp.whitelist.has(token)) throw new Error(`Attempted to process an event with an unknown token: ${token}`);

    const tokWithdrawals = this.withdrawals.get(token);
    this.withdrawals.set(token, {
      ...tokWithdrawals,
      [event.args.season]: this._upsertWithdrawal(tokWithdrawals?.[event.args.season], event.args.amount)
    });
  }

  RemoveWithdrawal(event: Simplify<RemoveWithdrawalEvent>) {
    const token = this.getToken(event);
    this._removeWithdrawal(event.args.season.toString(), token, event.args.amount);
  }

  RemoveWithdrawals(event: Simplify<RemoveWithdrawalsEvent>) {
    const token = this.getToken(event);
    event.args.seasons.forEach((season) => {
      this._removeWithdrawal(season.toString(), token, event.args.amount);
    });
  }

  // /// /////////////////////// MARKET  //////////////////////////

  // RookieListingCreated(event: Simplify<PodListingCreatedEvent>) {
  //   const id          = event.args.index.toString();
  //   const amount      = tokenBN(event.args.amount, HOOLIGAN[1]);
  //   this.listings[id] = {
  //     id:               id,
  //     account:          event.args.account.toLowerCase(),
  //     index:            tokenBN(event.args.index, HOOLIGAN[1]), // 6 dec
  //     start:            tokenBN(event.args.start, HOOLIGAN[1]), // 6 dec
  //     pricePerRookie:      tokenBN(event.args.pricePerPod, HOOLIGAN[1]),
  //     maxDraftableIndex: tokenBN(event.args.maxDraftableIndex, HOOLIGAN[1]),
  //     mode:             event.args.mode.toString() as FarmToMode,
  //     amount:           amount,   //
  //     totalAmount:      amount,   //
  //     remainingAmount:  amount,   //
  //     filledAmount:     BN(0),    //
  //     status:           MarketStatus.Active,
  //     placeInLine:      ZERO_BN,  // FIXME
  //   };
  // }

  // RookieListingCancelled(event: Simplify<PodListingCancelledEvent>) {
  //   const id = event.args.index.toString();
  //   if (this.listings[id]) delete this.listings[id];
  // }

  // /**
  //  * Notes on behavior:
  //  *
  //  * RookieListingCreated                          => `status = active`
  //  * -> RookieListingFilled (for the full amount)  => `status = filled-full`
  //  * -> RookieListingFilled (for a partial amount) => `status = filled-partial`
  //  * -> RookieListingCancelled                     => `status = cancelled`
  //  *
  //  * Every `RookieListingFilled` event changes the `index` of the Listing.
  //  * When a Listing is partially filled, the Subgraph creates a new Listing
  //  * with the new index and `status = active`. The "old listing" now has
  //  * `status = filled-partial`.
  //  *
  //  * This EventProcessor is intended to stand in for the subgraph when we can't
  //  * connect, so we treat listings similarly:
  //  * 1. When a `RookieListingFilled` event is received, delete the listing stored
  //  *    at the original `index` and create one at the new `index`. The new `index`
  //  *    is always: `previous index + start + amount`.
  //  *
  //  * @param event
  //  * @returns
  //  */
  // RookieListingFilled(event: Simplify<PodListingFilledEvent>) {
  //   const id = event.args.index.toString();
  //   if (!this.listings[id]) return;

  //   const indexBN     = BN(event.args.index);
  //   const deltaAmount = tokenBN(event.args.amount, HOOLIGAN[1]);
  //   // const start   = tokenBN(event.args.start,  HOOLIGAN[1]);

  //   /// Move current listing's index up by |amount|
  //   ///  FIXME: does this match the new marketplace behavior? Believe
  //   ///  this assumes we are selling from the front (such that, as a listing
  //   ///  is sold, the index increases).
  //   const prevID = id;
  //   const currentListing = this.listings[prevID]; // copy
  //   delete this.listings[prevID];

  //   /// The new index of the Plot, now that some of it has been sold.
  //   const newIndex       = indexBN.plus(BN(event.args.amount)).plus(BN(event.args.start)); // no decimals
  //   const newID          = newIndex.toString();
  //   this.listings[newID] = currentListing;

  //   /// Bump up |amountSold| for this listing
  //   this.listings[newID].id              = newID;
  //   this.listings[newID].index           = tokenBN(newIndex, HOOLIGAN[1]);
  //   this.listings[newID].start           = new BigNumber(0); // After a Fill, the new start position is always zero (?)
  //   this.listings[newID].filledAmount    = currentListing.filledAmount.plus(deltaAmount);
  //   this.listings[newID].remainingAmount = currentListing.amount.minus(currentListing.filledAmount);
  //   // others stay the same, incl. currentListing.totalAmount, etc.

  //   const isFilled = this.listings[newID].remainingAmount.isEqualTo(0);
  //   if (isFilled) {
  //     this.listings[newID].status = MarketStatus.Filled;
  //     // delete this.listings[newID];
  //   }
  // }

  // RookieOrderCreated(event: Simplify<PodOrderCreatedEvent>) {
  //   const id = event.args.id.toString();
  //   this.orders[id] = {
  //     id:               id,
  //     account:          event.args.account.toLowerCase(),
  //     maxPlaceInLine:   tokenBN(event.args.maxPlaceInLine, HOOLIGAN[1]),
  //     totalAmount:      tokenBN(event.args.amount, HOOLIGAN[1]),
  //     pricePerRookie:      tokenBN(event.args.pricePerPod, HOOLIGAN[1]),
  //     remainingAmount:  tokenBN(event.args.amount, HOOLIGAN[1]),
  //     filledAmount:     new BigNumber(0),
  //     status:           MarketStatus.Active,
  //   };
  // }

  // RookieOrderCancelled(event: Simplify<PodOrderCancelledEvent>) {
  //   const id = event.args.id.toString();
  //   if (this.orders[id]) delete this.orders[id];
  // }

  // RookieOrderFilled(event: Simplify<PodOrderFilledEvent>) {
  //   const id = event.args.id.toString();
  //   if (!this.orders[id]) return;

  //   const amount = tokenBN(event.args.amount, HOOLIGAN[1]);
  //   this.orders[id].filledAmount    = this.orders[id].filledAmount.plus(amount);
  //   this.orders[id].remainingAmount = this.orders[id].totalAmount.minus(this.orders[id].filledAmount);

  //   /// Update status
  //   const isFilled = this.orders[id].remainingAmount.isEqualTo(0);
  //   if (isFilled) {
  //     this.orders[id].status = MarketStatus.Filled;
  //     // delete this.orders[id];
  //   }
  // }
}

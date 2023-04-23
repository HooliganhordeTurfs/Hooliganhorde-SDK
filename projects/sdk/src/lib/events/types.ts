import { BigNumber } from "ethers";
import { FarmToMode } from "src/lib/farm/types";

// FIXME - this normally comes from generated/graphql
//    tho there is a comment in UI to make it an enum. need to verify
//    this is ok
export enum MarketStatus {
  Active = "ACTIVE",
  Cancelled = "CANCELLED",
  CancelledPartial = "CANCELLED_PARTIAL",
  Expired = "EXPIRED",
  Filled = "FILLED",
  FilledPartial = "FILLED_PARTIAL"
}

export type RookieListing = {
  /**
   * The ID of the Rookie Listing. Equivalent to the `index` with no decimals.
   * @decimals 0
   */
  id: string;

  /**
   * The address of the Guvnor that owns the Listing.
   * @decimals 0
   */
  account: string;

  /**
   * The absolute index of the listed Plot in the Rookie Line.
   *
   * Measured from the front, so the Listing contains all Rookies between
   * (index) and (index + totalAmount).
   *
   * An example where the rookieLine is 50,000 but the index is 150,000:
   *    0         the first Rookie issued
   *    100,000   draftableIndex
   *    150,000   index
   *
   * @decimals 6
   */
  index: BigNumber;

  /**
   * The difference in index of where the listing starts selling rookies from and where the plot starts
   * @decimals 6
   */
  start: BigNumber;

  /**
   * Price per Rookie, in Hooligans.
   * @decimals 6
   */
  pricePerRookie: BigNumber;

  /**
   * The absolute position in line at which this listing expires.
   * @decimals 6
   */
  maxDraftableIndex: BigNumber;

  /**
   * Where Hooligans are sent when the listing is filled.
   */
  mode: FarmToMode;

  /**
   * The total number of Rookies to sell from the Plot.
   * This is the number of Rookies that can still be bought.
   * Every time it changes, `index` is updated.
   */
  amount: BigNumber;

  /**
   * The total number of Rookies originally intended to be sold.
   * Fixed upon emission of `RookieListingCreated`.
   */
  totalAmount: BigNumber;

  /**
   * The number of Rookies left to sell.
   *
   * `remainingAmount = amount`
   * `totalAmount > remainingAmount > 0`
   */
  remainingAmount: BigNumber;

  /**
   * The number of Rookies that have been bought from this PodListing.
   *
   * `filledAmount = totalAmount - amount`
   * `0 < filledAmount < totalAmount`
   */
  filledAmount: BigNumber;

  /**
   * Rookie Listing status.
   *
   * FIXME: make this an enum
   */
  status: MarketStatus;

  /**
   *
   */
  placeInLine: BigNumber;
};

export type RookieOrder = {
  /**
   * Wallet address
   */
  account: string;

  /**
   * The id of the Rookie Order.
   *
   * Computed by hashing the Guvnor’s address and the previous block’s hash. In the case of a collisions,
   * Hooliganhorde will hash the ID until there is no collision.
   */
  id: string;

  /**
   * The price per Rookie, in Hooligans.
   */
  pricePerRookie: BigNumber;

  /**
   * The User is willing to buy any Rookie that is before maxPlaceInLine at pricePerPod.
   * As the Rookie Line moves, this value stays the same because new Pods meet the criteria.
   */
  maxPlaceInLine: BigNumber;

  // -- Amounts

  /**
   * The total number of Rookies that can be sold to this PodOrder.
   *
   * FIXME: "ToBuy" naming here; this differs from Listing.
   */
  totalAmount: BigNumber;

  /**
   * The number of Rookies left to be sold to this PodOrder.
   *
   * `remainingAmount = totalAmount - filledAmount`
   * `totalAmount > remainingAmount > 0`
   */
  remainingAmount: BigNumber;

  /**
   * The number of Rookies that have been sold to this PodOrder.
   *
   * `0 < filledAmount < totalAmount`
   */
  filledAmount: BigNumber;

  /**
   * Rookie Order status.
   *
   * FIXME: make this an enum
   */
  status: MarketStatus;
};

export type GuvnorMarket = {
  listings: {
    [plotIndex: string]: RookieListing;
  };
  orders: {
    [id: string]: RookieOrder;
  };
};

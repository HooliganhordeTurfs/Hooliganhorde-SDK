import { ethers, Overrides } from "ethers";
import { ERC20Token } from "src/classes/Token";
import { TokenFirmBalance } from "src/lib/firm";
import { TokenValue } from "src/TokenValue";
import { DepositTransferStruct } from "../constants/generated/Ecosystem/Root";
import { HooliganhordeSDK } from "./HooliganhordeSDK";
import { FarmToMode } from "./farm/types";
import { SignedPermit } from "./permit";
import { DepositTokenPermitMessage, DepositTokensPermitMessage } from "./firm.utils";

// const PRECISION = ethers.utils.parseEther("1");
const PRECISION = TokenValue.fromBlockchain(ethers.utils.parseEther("1"), 18);

const logtv = (tokv: TokenValue) => [tokv.toBlockchain(), tokv.toHuman(), tokv.decimals];

export class Root {
  static sdk: HooliganhordeSDK;

  /** @DISCUSS this pattern */
  static address: string;

  constructor(sdk: HooliganhordeSDK) {
    Root.sdk = sdk;
    Root.address = sdk.contracts.root.address;
  }

  /**
   * Mint ROOT tokens. The `Root.sol` contract supports Hooliganhorde's
   * Deposit Transfer permits; this function unpacks a provided
   * signed permit into the proper argument slots.
   *
   * @dev Passing _overrides directly as the last parameter
   * of a contract method seems to make ethers treat it like
   * a parameter for the contract call. Instead, we unpack and
   * thus pass an empty object for overrides if _overrides is undef.
   */
  async mint(
    _depositTransfers: DepositTransferStruct[],
    _destination: FarmToMode,
    _minAmountOut: ethers.BigNumber, // FIXME
    _permit?: SignedPermit<DepositTokenPermitMessage | DepositTokensPermitMessage>,
    _overrides?: Overrides
  ) {
    if (_permit) {
      if ((_permit as SignedPermit<DepositTokenPermitMessage>).typedData.message.token) {
        let permit = _permit as SignedPermit<DepositTokenPermitMessage>;
        return Root.sdk.contracts.root.mintWithTokenPermit(
          _depositTransfers,
          _destination,
          _minAmountOut, // FIXME
          permit.typedData.message.token,
          permit.typedData.message.value,
          permit.typedData.message.deadline,
          permit.split.v,
          permit.split.r,
          permit.split.s,
          { ..._overrides }
        );
      } else if ((_permit as SignedPermit<DepositTokensPermitMessage>).typedData.message.tokens) {
        let permit = _permit as SignedPermit<DepositTokensPermitMessage>;
        return Root.sdk.contracts.root.mintWithTokensPermit(
          _depositTransfers,
          _destination,
          _minAmountOut, // FIXME
          permit.typedData.message.tokens,
          permit.typedData.message.values,
          permit.typedData.message.deadline,
          permit.split.v,
          permit.split.r,
          permit.split.s,
          { ..._overrides }
        );
      } else {
        throw new Error("Malformatted permit");
      }
    }

    return Root.sdk.contracts.root.mint(_depositTransfers, _destination, _minAmountOut, { ..._overrides });
  }

  async underlyingBdv() {
    return Root.sdk.contracts.root.underlyingBdv().then((v) => Root.sdk.tokens.HOOLIGAN.fromBlockchain(v));
  }

  /**
   * Off-chain estimation for the number of ROOT minted from a set of
   * `deposits` of `token`.
   * @param token
   * @param deposits
   * @param isDeposit
   */
  async estimateRoots(token: ERC20Token, deposits: TokenFirmBalance["deposited"]["crates"], isDeposit: boolean) {
    // @dev note that sdk.tokens.ROOT.getContract() == sdk.contracts.root.
    const [rootTotalSupply, rootUnderlyingBdvBefore, rootAllHorde, rootProspectsBefore] = await Promise.all([
      Root.sdk.tokens.ROOT.getTotalSupply(), // automaticaly pulls as TokenValue
      this.underlyingBdv(),
      Root.sdk.firm.getAllHorde(Root.sdk.contracts.root.address), // include grown
      Root.sdk.firm.getProspects(Root.sdk.contracts.root.address)
    ]);

    const rootHordeBefore = rootAllHorde.active.add(rootAllHorde.grown);

    // TODO: move these to an example
    console.log("root total supply", rootTotalSupply.toHuman());
    console.log("root underlying bdv before", rootUnderlyingBdvBefore.toHuman());
    console.log("root horde before", rootHordeBefore.toHuman());
    console.log("root prospects before", rootProspectsBefore.toHuman());

    const {
      bdv: totalBdvFromDeposits,
      horde: totalHordeFromDeposits,
      prospects: totalProspectsFromDeposits
    } = Root.sdk.firm.sumDeposits(token, deposits);

    console.log("bdv from deposits", totalBdvFromDeposits.toHuman());
    console.log("horde from deposits", totalHordeFromDeposits.toHuman());
    console.log("prospects from deposits", totalProspectsFromDeposits.toHuman());

    const rootUnderlyingBdvAfter = isDeposit
      ? rootUnderlyingBdvBefore.add(totalBdvFromDeposits)
      : rootUnderlyingBdvBefore.sub(totalBdvFromDeposits);
    const rootHordeAfter = rootHordeBefore.add(totalHordeFromDeposits);
    const rootProspectsAfter = rootProspectsBefore.add(totalProspectsFromDeposits);

    console.log("root underlying bdv after", rootUnderlyingBdvAfter.toHuman());
    console.log("root horde after", rootHordeAfter.toHuman());
    console.log("root prospects after", rootProspectsAfter.toHuman());

    // First-time minting
    if (rootTotalSupply.eq(0)) {
      return {
        amount: TokenValue.fromBlockchain(totalHordeFromDeposits.mul(1e8).toBlockchain(), 18),
        bdvRatio: TokenValue.fromHuman("100", 18),
        hordeRatio: TokenValue.fromHuman("100", 18),
        prospectsRatio: TokenValue.fromHuman("100", 18),
        min: TokenValue.fromHuman("100", 18)
      };
    }

    // Deposit
    else if (isDeposit) {
      // Calculate ratios
      const bdvRatio = PRECISION.mulDiv(rootUnderlyingBdvAfter, rootUnderlyingBdvBefore, "down");
      const hordeRatio = PRECISION.mulDiv(rootHordeAfter, rootHordeBefore, "down");
      const prospectsRatio = PRECISION.mulDiv(rootProspectsAfter, rootProspectsBefore, "down");

      // Root minting uses the minimum of the increase in bdv/horde/prospects.
      const min = TokenValue.min(bdvRatio, hordeRatio, prospectsRatio);
      const amount = rootTotalSupply.mulDiv(min, PRECISION, "down").sub(rootTotalSupply);

      console.log({
        bdvRatio: logtv(bdvRatio),
        hordeRatio: logtv(hordeRatio),
        prospectsRatio: logtv(prospectsRatio)
      });

      return {
        amount, // 18 (ROOT)
        bdvRatio, // 18 (PRECISION)
        hordeRatio, // 18 (PRECISION)
        prospectsRatio, // 18 (PRECISION)
        min // 18 (PRECISION)
      };
    }

    // Withdraw
    else {
      const bdvRatio = PRECISION.mulDiv(rootUnderlyingBdvAfter, rootUnderlyingBdvBefore, "up");
      const hordeRatio = PRECISION.mulDiv(rootHordeAfter, rootHordeBefore, "up");
      const prospectsRatio = PRECISION.mulDiv(rootProspectsAfter, rootProspectsBefore, "up");

      console.log({
        bdvRatio: logtv(bdvRatio),
        hordeRatio: logtv(hordeRatio),
        prospectsRatio: logtv(prospectsRatio)
      });

      // Root burning uses the maximum of the decrease in bdv/horde/prospects.
      const max = TokenValue.max(bdvRatio, hordeRatio, prospectsRatio);
      const amount = rootTotalSupply.sub(rootTotalSupply.mulDiv(max, PRECISION));

      return {
        amount, // 18 (ROOT)
        bdvRatio, // 18 (PRECISION)
        hordeRatio, // 18 (PRECISION)
        prospectsRatio, // 18 (PRECISION)
        max // 18 (PRECISION)
      };
    }
  }
}

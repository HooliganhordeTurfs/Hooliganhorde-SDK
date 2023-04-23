import { ethers } from "ethers";
import { ERC20Token, NativeToken } from "src/classes/Token";
import { BasicPreparedResult, RunContext, StepGenerator } from "src/classes/Workflow";
import { HooliganhordeSDK } from "src/lib/HooliganhordeSDK";
import { FarmFromMode, FarmToMode } from "../farm/types";
import { EIP2612PermitMessage, SignedPermit } from "../permit";
import { Exchange, ExchangeUnderlying } from "./actions/index";

export type ActionBuilder = (
  fromMode?: FarmFromMode,
  toMode?: FarmToMode
) => StepGenerator<BasicPreparedResult> | StepGenerator<BasicPreparedResult>[];

export class LibraryPresets {
  static sdk: HooliganhordeSDK;
  public readonly weth2usdt: ActionBuilder;
  public readonly usdt2hooligan: ActionBuilder;
  public readonly usdt2weth: ActionBuilder;
  public readonly hooligan2usdt: ActionBuilder;
  public readonly weth2hooligan: ActionBuilder;
  public readonly hooligan2weth: ActionBuilder;

  /**
   * Load the Pipeline in preparation for a set Pipe actions.
   * @param _permit provide a permit directly, or provide a function to extract it from `context`.
   */
  public loadPipeline(
    _token: ERC20Token,
    _from: FarmFromMode,
    _permit?: SignedPermit<EIP2612PermitMessage> | ((context: RunContext) => SignedPermit<EIP2612PermitMessage>)
  ) {
    let generators: StepGenerator[] = [];

    // FIXME: use permitToken if _from === INTERNAL
    if (_token instanceof NativeToken) {
      console.warn("!! WARNING: Skipping loadPipeline with expectation that ether is passed through { value }.");
      return generators;
    }

    // give hooliganhorde permission to send this ERC-20 token from my balance -> pipeline
    if (_permit) {
      if (_from === FarmFromMode.EXTERNAL) {
        generators.push(async function permitERC20(_amountInStep: ethers.BigNumber, context: RunContext) {
          const permit = typeof _permit === "function" ? _permit(context) : _permit;
          const owner = await LibraryPresets.sdk.getAccount();
          const spender = LibraryPresets.sdk.contracts.hooliganhorde.address;

          LibraryPresets.sdk.debug(`[permitERC20.run()]`, {
            token: _token.address,
            owner: owner,
            spender: spender,
            value: _amountInStep.toString(),
            permit: permit
          });

          return {
            target: LibraryPresets.sdk.contracts.hooliganhorde.address,
            callData: LibraryPresets.sdk.contracts.hooliganhorde.interface.encodeFunctionData("permitERC20", [
              _token.address, // token address
              owner, // owner
              spender, // spender
              _amountInStep.toString(), // value
              permit.typedData.message.deadline, // deadline
              permit.split.v,
              permit.split.r,
              permit.split.s
            ])
          };
        });
      } else {
        throw new Error(`Permit provided for FarmFromMode that does not yet support permits: ${_from}`);
      }
    }

    // transfer erc20 token from msg.sender -> PIPELINE
    generators.push(async function transferToken(_amountInStep: ethers.BigNumber) {
      const recipient = LibraryPresets.sdk.contracts.pipeline.address;

      LibraryPresets.sdk.debug(`[transferToken.run()]`, {
        token: _token.address,
        recipient,
        amount: _amountInStep.toString(),
        from: _from,
        to: FarmToMode.EXTERNAL
      });

      return {
        target: LibraryPresets.sdk.contracts.hooliganhorde.address,
        callData: LibraryPresets.sdk.contracts.hooliganhorde.interface.encodeFunctionData("transferToken", [
          _token.address, // token
          recipient, // recipient
          _amountInStep.toString(), // amount
          _from, // from
          FarmToMode.EXTERNAL // to
        ])
      };
    });

    return generators;
  }

  constructor(sdk: HooliganhordeSDK) {
    LibraryPresets.sdk = sdk;

    ///////// WETH <> USDT ///////////
    this.weth2usdt = (fromMode?: FarmFromMode, toMode?: FarmToMode) =>
      new Exchange(
        sdk.contracts.curve.pools.tricrypto2.address,
        sdk.contracts.curve.registries.cryptoFactory.address,
        sdk.tokens.WETH,
        sdk.tokens.USDT,
        fromMode,
        toMode
      );

    this.usdt2weth = (fromMode?: FarmFromMode, toMode?: FarmToMode) =>
      new Exchange(
        sdk.contracts.curve.pools.tricrypto2.address,
        sdk.contracts.curve.registries.cryptoFactory.address,
        sdk.tokens.USDT,
        sdk.tokens.WETH,
        fromMode,
        toMode
      );

    ///////// HOOLIGAN <> USDT ///////////
    this.usdt2hooligan = (fromMode?: FarmFromMode, toMode?: FarmToMode) =>
      new ExchangeUnderlying(sdk.contracts.curve.pools.hooliganCrv3.address, sdk.tokens.USDT, sdk.tokens.HOOLIGAN, fromMode, toMode);

    this.hooligan2usdt = (fromMode?: FarmFromMode, toMode?: FarmToMode) =>
      new ExchangeUnderlying(sdk.contracts.curve.pools.hooliganCrv3.address, sdk.tokens.HOOLIGAN, sdk.tokens.USDT, fromMode, toMode);

    //////// WETH <> HOOLIGAN
    this.weth2hooligan = (fromMode?: FarmFromMode, toMode?: FarmToMode) => [
      this.weth2usdt(fromMode, FarmToMode.INTERNAL) as StepGenerator,
      this.usdt2hooligan(FarmFromMode.INTERNAL, toMode) as StepGenerator
    ];
    this.hooligan2weth = (fromMode?: FarmFromMode, toMode?: FarmToMode) => [
      this.hooligan2usdt(fromMode, FarmToMode.INTERNAL) as StepGenerator,
      this.usdt2weth(FarmFromMode.INTERNAL, toMode) as StepGenerator
    ];
  }
}

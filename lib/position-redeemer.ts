import axios from "axios";
import { Contract, Wallet, ethers, providers } from "ethers";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "./config";

const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const NEGRISK_ADAPTER_ADDRESS = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296";
const USDC_NATIVE_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const USDC_BRIDGED_ADDRESS = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
const WRAPPED_COLLATERAL_ADDRESS = "0x3A3BD7bb9528E159577F7C2e685CC81A765002E2";

const CTF_ABI = [
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
  "function getPositionId(address collateralToken, bytes32 collectionId) external pure returns (uint256)",
  "function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) external view returns (bytes32)",
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) external",
  "function payoutNumerators(bytes32 conditionId, uint256 index) external view returns (uint256)",
];

const SAFE_ABI = [
  "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures) external payable returns (bool success)",
  "function getTransactionHash(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) external view returns (bytes32)",
  "function nonce() external view returns (uint256)",
];

interface Position {
  conditionId: string;
  size: number;
  currentValue: number;
  cashPnl: number;
  initialValue: number;
  avgPrice: number;
  title: string;
  outcome: string;
  redeemable: boolean;
  proxyWallet: string;
  negativeRisk: boolean;
}

interface PendingRedemption {
  txHash: string;
  position: Position;
  timestamp: number;
}

export class PositionRedeemer {
  private readonly config = getConfig();
  private readonly provider: providers.JsonRpcProvider;
  private readonly wallet: Wallet;
  private readonly ctfContract: Contract;
  private lastRedemptionCheck = 0;
  private readonly checkIntervalMs = 5 * 60 * 1000; // 5 minutes
  private readonly pendingTxPath: string;
  private pendingRedemptions: PendingRedemption[] = [];

  constructor() {
    this.provider = new providers.JsonRpcProvider(
      this.config.api.polygonRpcUrl,
    );
    this.wallet = new Wallet(this.config.api.privateKey, this.provider);
    this.ctfContract = new Contract(CTF_ADDRESS, CTF_ABI, this.wallet);
    this.pendingTxPath = join(
      process.cwd(),
      "data",
      "pending-redemptions.json",
    );
    this.loadPendingRedemptions();
  }

  private loadPendingRedemptions(): void {
    try {
      if (existsSync(this.pendingTxPath)) {
        const data = JSON.parse(readFileSync(this.pendingTxPath, "utf-8"));
        this.pendingRedemptions = data.pending || [];
        console.log(
          `[Redeemer] Loaded ${this.pendingRedemptions.length} pending redemption(s)`,
        );
      }
    } catch {
      console.warn("[Redeemer] Failed to load pending redemptions");
    }
  }

  private savePendingRedemptions(): void {
    try {
      const dir = join(process.cwd(), "data");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(
        this.pendingTxPath,
        JSON.stringify({ pending: this.pendingRedemptions }, null, 2),
      );
    } catch {
      console.error("[Redeemer] Failed to save pending redemptions");
    }
  }

  shouldCheckRedemptions(): boolean {
    const now = Date.now();
    if (now - this.lastRedemptionCheck >= this.checkIntervalMs) {
      this.lastRedemptionCheck = now;
      return true;
    }
    return false;
  }

  private async checkPendingRedemptions(): Promise<void> {
    if (this.pendingRedemptions.length === 0) return;

    const stillPending: PendingRedemption[] = [];

    for (const pending of this.pendingRedemptions) {
      try {
        const receipt = await this.provider.getTransactionReceipt(
          pending.txHash,
        );
        if (!receipt) {
          stillPending.push(pending);
          continue;
        }
        if (receipt.status === 1) {
          console.log(
            `[Redeemer] Redeemed $${pending.position.currentValue} from ${pending.position.title}`,
          );
        } else {
          console.warn(`[Redeemer] Tx failed: ${pending.txHash}`);
        }
      } catch {
        stillPending.push(pending);
      }
    }

    this.pendingRedemptions = stillPending;
    this.savePendingRedemptions();
  }

  private hasPendingRedemption(conditionId: string): boolean {
    return this.pendingRedemptions.some(
      (p) => p.position.conditionId === conditionId,
    );
  }

  private async fetchPositions(): Promise<Position[]> {
    try {
      const response = await axios.get(
        "https://data-api.polymarket.com/positions",
        {
          params: {
            user: this.config.api.funderAddress,
            limit: 100,
            redeemable: true,
            sortBy: "CASHPNL",
            sortDirection: "DESC",
          },
          timeout: 10000,
        },
      );
      return response.data.filter(
        (p: Position) => p.cashPnl > 0 && p.currentValue > p.initialValue,
      );
    } catch {
      return [];
    }
  }

  private async isMarketResolved(conditionId: string): Promise<boolean> {
    try {
      const payout0 = await Promise.race([
        this.ctfContract.payoutNumerators(conditionId, 0),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 5000),
        ),
      ]);
      const payout1 = await Promise.race([
        this.ctfContract.payoutNumerators(conditionId, 1),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 5000),
        ),
      ]);
      return Number(payout0) > 0 || Number(payout1) > 0;
    } catch {
      return false;
    }
  }

  private async detectCollateral(
    position: Position,
  ): Promise<{ address: string; name: string }> {
    const parentCollectionId = ethers.constants.HashZero;
    const yesCollectionId = await this.ctfContract.getCollectionId(
      parentCollectionId,
      position.conditionId,
      1,
    );
    const noCollectionId = await this.ctfContract.getCollectionId(
      parentCollectionId,
      position.conditionId,
      2,
    );

    // Check bridged USDC first
    let yesPositionId = await this.ctfContract.getPositionId(
      USDC_BRIDGED_ADDRESS,
      yesCollectionId,
    );
    let noPositionId = await this.ctfContract.getPositionId(
      USDC_BRIDGED_ADDRESS,
      noCollectionId,
    );
    let yesBalance = await this.ctfContract.balanceOf(
      position.proxyWallet,
      yesPositionId,
    );
    let noBalance = await this.ctfContract.balanceOf(
      position.proxyWallet,
      noPositionId,
    );

    if (Number(yesBalance) > 0 || Number(noBalance) > 0) {
      return { address: USDC_BRIDGED_ADDRESS, name: "Bridged USDC" };
    }

    // Check wrapped collateral
    yesPositionId = await this.ctfContract.getPositionId(
      WRAPPED_COLLATERAL_ADDRESS,
      yesCollectionId,
    );
    noPositionId = await this.ctfContract.getPositionId(
      WRAPPED_COLLATERAL_ADDRESS,
      noCollectionId,
    );
    yesBalance = await this.ctfContract.balanceOf(
      position.proxyWallet,
      yesPositionId,
    );
    noBalance = await this.ctfContract.balanceOf(
      position.proxyWallet,
      noPositionId,
    );

    if (Number(yesBalance) > 0 || Number(noBalance) > 0) {
      return { address: WRAPPED_COLLATERAL_ADDRESS, name: "WrappedCollateral" };
    }

    return { address: USDC_NATIVE_ADDRESS, name: "Native USDC" };
  }

  private async redeemPosition(
    position: Position,
    nonce?: number,
  ): Promise<{ success: boolean; txHash?: string; position?: Position }> {
    try {
      const collateral = await this.detectCollateral(position);
      const parentCollectionId = ethers.constants.HashZero;
      const targetContract =
        collateral.address === WRAPPED_COLLATERAL_ADDRESS
          ? NEGRISK_ADAPTER_ADDRESS
          : CTF_ADDRESS;

      const iface = new ethers.utils.Interface(CTF_ABI);
      const redeemCalldata = iface.encodeFunctionData("redeemPositions", [
        collateral.address,
        parentCollectionId,
        position.conditionId,
        [1, 2],
      ]);

      const safe = new Contract(position.proxyWallet, SAFE_ABI, this.wallet);
      const safeNonce = nonce !== undefined ? nonce : await safe.nonce();

      const txHash = await safe.getTransactionHash(
        targetContract,
        0,
        redeemCalldata,
        0,
        0,
        0,
        0,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        safeNonce,
      );

      const flatSig = await this.wallet.signMessage(
        ethers.utils.arrayify(txHash),
      );
      const sig = ethers.utils.splitSignature(flatSig);
      const adjustedV = sig.v + 4;
      const signature = ethers.utils.hexConcat([
        sig.r,
        sig.s,
        ethers.utils.hexlify(adjustedV),
      ]);

      const feeData = await this.provider.getFeeData();
      const gasPrice = await this.provider.getGasPrice();
      const minPriorityFee = ethers.utils.parseUnits("42", "gwei");
      const priorityFee = feeData.maxPriorityFeePerGas?.gt(minPriorityFee)
        ? feeData.maxPriorityFeePerGas.mul(15).div(10)
        : minPriorityFee;
      const maxFee = gasPrice.add(priorityFee).mul(12).div(10);

      const tx = await safe.execTransaction(
        targetContract,
        0,
        redeemCalldata,
        0,
        0,
        0,
        0,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        signature,
        {
          gasLimit: 500000,
          maxFeePerGas: maxFee,
          maxPriorityFeePerGas: priorityFee,
        },
      );

      return { success: true, txHash: tx.hash, position };
    } catch (err) {
      console.error(`[Redeemer] Failed to redeem: ${position.title}`, err);
      return { success: false };
    }
  }

  async checkAndRedeemPositions(): Promise<void> {
    if (!this.shouldCheckRedemptions()) return;

    try {
      await this.checkPendingRedemptions();

      if (this.pendingRedemptions.length > 0) {
        console.log(
          `[Redeemer] Skipping - ${this.pendingRedemptions.length} tx(s) pending`,
        );
        return;
      }

      const positions = await this.fetchPositions();
      if (positions.length === 0) return;

      const sentTxs: Array<{ txHash: string; position: Position }> = [];
      let currentNonce: number | undefined;

      for (const position of positions) {
        if (this.hasPendingRedemption(position.conditionId)) continue;

        const resolved = await this.isMarketResolved(position.conditionId);
        if (!resolved) continue;

        if (currentNonce === undefined) {
          const safe = new Contract(
            position.proxyWallet,
            SAFE_ABI,
            this.wallet,
          );
          currentNonce = await safe.nonce();
        }

        const result = await this.redeemPosition(position, currentNonce);
        if (result.success && result.txHash && result.position) {
          sentTxs.push({ txHash: result.txHash, position: result.position });
          if (currentNonce !== undefined) currentNonce++;
        }
      }

      if (sentTxs.length === 0) return;

      // Wait 10s for txs to confirm
      await new Promise((r) => setTimeout(r, 10000));

      for (const { txHash, position } of sentTxs) {
        try {
          const receipt = await this.provider.getTransactionReceipt(txHash);
          if (!receipt) {
            console.log(`[Redeemer] Tx pending: ${txHash}`);
            this.pendingRedemptions.push({
              txHash,
              position,
              timestamp: Date.now(),
            });
            continue;
          }
          if (receipt.status === 1) {
            console.log(
              `[Redeemer] Redeemed $${position.currentValue} from ${position.title}`,
            );
          } else {
            console.warn(`[Redeemer] Tx failed: ${txHash}`);
          }
        } catch {
          this.pendingRedemptions.push({
            txHash,
            position,
            timestamp: Date.now(),
          });
        }
      }

      if (this.pendingRedemptions.length > 0) {
        this.savePendingRedemptions();
      }
    } catch (err) {
      console.error("[Redeemer] Error in redemption check", err);
    }
  }
}

let redeemerInstance: PositionRedeemer | null = null;

export function getPositionRedeemer(): PositionRedeemer {
  if (!redeemerInstance) {
    redeemerInstance = new PositionRedeemer();
  }
  return redeemerInstance;
}

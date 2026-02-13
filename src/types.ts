export type IotaNetwork = "mainnet" | "testnet" | "devnet" | "localnet" | "custom";
export type SignerMode = "local-keystore" | "external-signature" | "kms";

export type IotaWalletConfig = {
  enabled: boolean;
  cliPath: string;
  defaultNetwork: IotaNetwork;
  customRpcUrl?: string;
  requireApproval: boolean;
  approvalTtlSeconds: number;
  maxTransferNanos: bigint;
  recipientAllowlist: Set<string>;
  commandTimeoutMs: number;
  signer: {
    mode: SignerMode;
    keystorePath?: string;
    keyId?: string;
    base64PublicKey?: string;
    intent?: string;
  };
};

export type PreparedTransfer = {
  id: string;
  recipient: string;
  amountNanos: bigint;
  createdAt: number;
  expiresAt: number;
  approved: boolean;
  txBytes?: string;
  decodedTx?: unknown;
  signerAddress?: string;
  signature?: string;
};

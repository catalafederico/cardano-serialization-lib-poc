export interface Asset {
  assetId: string;
  policyId: string;
  name: null | string;
  amount: string;
}

export type UTxOsForAddressesResponse = Array<{
  utxo_id: string; // concat tx_hash and tx_index
  tx_hash: string;
  tx_index: number;
  block_num: number; // NOTE: not slot_no
  receiver: string;
  amount: string;
  dataHash: string;
  assets: Asset[];
}>;

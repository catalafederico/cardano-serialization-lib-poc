import axios from "axios";
import { UTxOsForAddressesResponse } from "./types";

const getUTxOsForAddresses = async (addresses: string[]) =>
  axios
    .post<UTxOsForAddressesResponse>(
      "https://testnet-backend.yoroiwallet.com/api/txs/utxoForAddresses",
      {
        addresses,
      }
    )
    .catch((err: any) => {
      console.error("error:", err);
      throw err;
    });

export default getUTxOsForAddresses;

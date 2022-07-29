import CardanoWasm from "@emurgo/cardano-serialization-lib-nodejs";
import { mnemonicToEntropy } from "bip39";
import axios from "axios";

function harden(num: number): number {
  return 0x80000000 + num;
}

const entropy = mnemonicToEntropy(
  [
    //mnemonic phras
  ].join(" ")
);

const rootKey = CardanoWasm.Bip32PrivateKey.from_bip39_entropy(
  Buffer.from(entropy, "hex"),
  Buffer.from("")
);

const accountKey = rootKey
  .derive(harden(1852)) // purpose
  .derive(harden(1815)) // coin type
  .derive(harden(0)); // account #0

const utxoPrivKey = accountKey
  .derive(0) // external
  .derive(0);

const utxoPubKey = utxoPrivKey.to_public();

const stakeKey = accountKey
  .derive(2) // chimeric
  .derive(0)
  .to_public();

const linearFee = CardanoWasm.LinearFee.new(
  CardanoWasm.BigNum.from_str("44"),
  CardanoWasm.BigNum.from_str("155381")
);
const txBuilderCfg = CardanoWasm.TransactionBuilderConfigBuilder.new()
  .fee_algo(linearFee)
  .pool_deposit(CardanoWasm.BigNum.from_str("500000000"))
  .key_deposit(CardanoWasm.BigNum.from_str("2000000"))
  .max_value_size(4000)
  .max_tx_size(8000)
  .coins_per_utxo_word(CardanoWasm.BigNum.from_str("34482"))
  .build();
const txBuilder = CardanoWasm.TransactionBuilder.new(txBuilderCfg);

// add a keyhash input - for ADA held in a Shelley-era normal address (Base, Enterprise, Pointer)
txBuilder.add_key_input(
  utxoPubKey.to_raw_key().hash(),
  CardanoWasm.TransactionInput.new(
    CardanoWasm.TransactionHash.from_bytes(
      Buffer.from(
        "ff4f259d799c5d674cef0846593826c2688904f225f787f378a7278ee63ccb99",
        "hex"
      )
    ), // tx hash
    0 // index
  ),
  CardanoWasm.Value.new(CardanoWasm.BigNum.from_str("1000000000"))
);

// base address

const shelleyOutputAddress = CardanoWasm.Address.from_bech32(
  "addr_test1qqhchrw4umcrf90ew5ep85zefj9724c5jcfg6kp667qau789d6z307gnggrp3hgye75yzgh5q0w6unkqnvfxjfu7vxlswtaxme"
);

// pointer address
const shelleyChangeAddress = CardanoWasm.Address.from_bech32(
  "addr_test1qq3wypwrz48h2z5jexpppql9ljq4wr7706dkgu9c8rxqdg8j8f7l04qm9h9jylhaw67vnupegfmgmv88s592l6mg0m9qcdtsan"
);

// add output to the tx
txBuilder.add_output(
  CardanoWasm.TransactionOutput.new(
    shelleyOutputAddress,
    CardanoWasm.Value.new(CardanoWasm.BigNum.from_str("1000000"))
  )
);

// set the time to live - the absolute slot value before the tx becomes invalid
txBuilder.set_ttl(70000000);

// calculate the min fee required and send any change to an address
txBuilder.add_change_if_needed(shelleyChangeAddress);

// once the transaction is ready, we build it to get the tx body without witnesses
const txBody = txBuilder.build();
const txHash = CardanoWasm.hash_transaction(txBody);
const witnesses = CardanoWasm.TransactionWitnessSet.new();

// add keyhash witnesses
const vkeyWitnesses = CardanoWasm.Vkeywitnesses.new();
const vkeyWitness = CardanoWasm.make_vkey_witness(
  txHash,
  utxoPrivKey.to_raw_key()
);
vkeyWitnesses.add(vkeyWitness);
witnesses.set_vkeys(vkeyWitnesses);

// create the finalized transaction with witnesses
const transaction = CardanoWasm.Transaction.new(
  txBody,
  witnesses,
  undefined // transaction metadata
);

const data = Buffer.from(
  Buffer.from(transaction.to_bytes()).toString("base64"),
  "base64"
);

axios
  .post("http://testnet-submittx.research.emurgo-rnd.com/api/submit/tx", data, {
    headers: {
      "Content-Type": "application/cbor",
    },
  })
  .then((x: any) => {
    console.log(x);
  })
  .catch((err: any) => {
    console.error(err);
  });

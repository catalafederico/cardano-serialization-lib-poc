import CardanoWasm from "@emurgo/cardano-serialization-lib-nodejs";
import { mnemonicToEntropy } from "bip39";
import axios from "axios";
import getUTxOsForAddresses from "./utxoForAddresses";

type KeyPair = {
  utxoPrivKey: CardanoWasm.Bip32PrivateKey;
  utxoPubKey: CardanoWasm.Bip32PublicKey;
};

function harden(num: number): number {
  return 0x80000000 + num;
}
async function main(): Promise<void> {
  const entropy = mnemonicToEntropy(
    [
      //mnemonic phrase
    ].join(" ")
  );

  const rootKey = CardanoWasm.Bip32PrivateKey.from_bip39_entropy(
    Buffer.from(entropy, "hex"),
    Buffer.from("")
  );

  const addresses: Record<string, KeyPair> = {};

  const accountKey = rootKey
    .derive(harden(1852)) // purpose
    .derive(harden(1815)) // coin type
    .derive(harden(0)); // account #0

  const stakeKey = accountKey
    .derive(2) // chimeric
    .derive(0)
    .to_public();

  for (let i = 0; i < 3; i++) {
    const utxoPrivKey = accountKey
      .derive(0) // external
      .derive(i);

    const utxoPubKey = utxoPrivKey.to_public();

    const address = CardanoWasm.BaseAddress.new(
      CardanoWasm.NetworkInfo.testnet().network_id(),
      CardanoWasm.StakeCredential.from_keyhash(utxoPubKey.to_raw_key().hash()),
      CardanoWasm.StakeCredential.from_keyhash(stakeKey.to_raw_key().hash())
    );

    addresses[address.to_address().to_bech32()] = {
      utxoPrivKey,
      utxoPubKey,
    };
    //addresses.set(address.to_address().to_bech32());
  }
  console.log(Object.keys(addresses));
  const { data: utxos } = await getUTxOsForAddresses(Object.keys(addresses));
  console.log(utxos);
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

  //Add key input for each UTxO
  utxos.forEach(({ tx_hash, tx_index, receiver, amount }) => {
    const { utxoPubKey } = addresses[receiver];
    // add a keyhash input - for ADA held in a Shelley-era normal address (Base, Enterprise, Pointer)
    txBuilder.add_key_input(
      utxoPubKey.to_raw_key().hash(),
      CardanoWasm.TransactionInput.new(
        CardanoWasm.TransactionHash.from_bytes(Buffer.from(tx_hash, "hex")), // tx hash
        tx_index // index
      ),
      CardanoWasm.Value.new(CardanoWasm.BigNum.from_str(amount))
    );
  });

  // output address
  const shelleyOutputAddress = CardanoWasm.Address.from_bech32(
    "addr_test1qztcmwpmcu8t2nkxkg9pr09ga7nh7h4e2h5smknje06tpg89d6z307gnggrp3hgye75yzgh5q0w6unkqnvfxjfu7vxlsed5ty5"
  );

  // change address
  const utxoPrivKey = accountKey
    .derive(1) // internal
    .derive(3);

  const utxoPubKey = utxoPrivKey.to_public();
  const shelleyChangeAddress = CardanoWasm.BaseAddress.new(
    CardanoWasm.NetworkInfo.testnet().network_id(),
    CardanoWasm.StakeCredential.from_keyhash(utxoPubKey.to_raw_key().hash()),
    CardanoWasm.StakeCredential.from_keyhash(stakeKey.to_raw_key().hash())
  ).to_address();

  // add output to the tx
  txBuilder.add_output(
    CardanoWasm.TransactionOutput.new(
      shelleyOutputAddress,
      CardanoWasm.Value.new(CardanoWasm.BigNum.from_str("150000000"))
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

  utxos.forEach(({ receiver }) => {
    const { utxoPrivKey } = addresses[receiver];
    const vkeyWitness = CardanoWasm.make_vkey_witness(
      txHash,
      utxoPrivKey.to_raw_key()
    );
    vkeyWitnesses.add(vkeyWitness);
  });
  witnesses.set_vkeys(vkeyWitnesses);

  // create the finalized transaction with witnesses
  const transaction = CardanoWasm.Transaction.new(
    txBody,
    witnesses,
    undefined // transaction metadata
  );

  const txBuffer = Buffer.from(
    Buffer.from(transaction.to_bytes()).toString("base64"),
    "base64"
  );

  axios
    .post(
      "http://testnet-submittx.research.emurgo-rnd.com/api/submit/tx",
      txBuffer,
      {
        headers: {
          "Content-Type": "application/cbor",
        },
      }
    )
    .then((x: any) => {
      console.log(x);
    })
    .catch((err: any) => {
      console.error(err);
    });
}

main();

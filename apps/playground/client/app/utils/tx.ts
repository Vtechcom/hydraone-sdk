import { CardanoWASM as C } from '@hydra-sdk/cardano-wasm';
import type { Utxo } from '@hydraone-sdk/core';

/*
 * Builds a real, unsigned "send to self" transaction from the wallet's UTxOs so the playground can
 * exercise signTx / submitTx. One input goes back to the change address; CSL computes the fee and the
 * change output.
 */

// Protocol parameters shared by mainnet and preprod (Conway). Only what a plain payment needs.
const PROTOCOL = {
  minFeeA: '44',
  minFeeB: '155381',
  coinsPerUtxoByte: '4310',
  poolDeposit: '500000000',
  keyDeposit: '2000000',
  maxValueSize: 5000,
  maxTxSize: 16384,
};

const big = (value: string) => C.BigNum.from_str(value);

function txConfig() {
  return C.TransactionBuilderConfigBuilder.new()
    .fee_algo(C.LinearFee.new(big(PROTOCOL.minFeeA), big(PROTOCOL.minFeeB)))
    .coins_per_utxo_byte(big(PROTOCOL.coinsPerUtxoByte))
    .pool_deposit(big(PROTOCOL.poolDeposit))
    .key_deposit(big(PROTOCOL.keyDeposit))
    .max_value_size(PROTOCOL.maxValueSize)
    .max_tx_size(PROTOCOL.maxTxSize)
    .build();
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));
}

function lovelaceOf(utxo: Utxo): bigint {
  return BigInt(utxo.output.amount.find((a) => a.unit === 'lovelace')?.quantity ?? '0');
}

/** Decoded `{ unit, quantity }` amounts (as the bridge sends them) to a CSL Value. */
function toValue(amount: Utxo['output']['amount']) {
  const value = C.Value.new(big(amount.find((a) => a.unit === 'lovelace')?.quantity ?? '0'));
  const tokens = amount.filter((a) => a.unit !== 'lovelace');
  if (tokens.length === 0) return value;
  const multiasset = C.MultiAsset.new();
  for (const { unit, quantity } of tokens) {
    multiasset.set_asset(
      C.ScriptHash.from_hex(unit.slice(0, 56)),
      // AssetName.from_hex expects the CBOR of the name; new() takes the raw name bytes.
      C.AssetName.new(hexToBytes(unit.slice(56))),
      big(quantity),
    );
  }
  value.set_multiasset(multiasset);
  return value;
}

function buildTx(utxo: Utxo, changeAddressHex: string): { cbor: string; fee: bigint } {
  const change = C.Address.from_hex(changeAddressHex);
  const builder = C.TransactionBuilder.new(txConfig());
  builder.add_regular_input(
    C.Address.from_bech32(utxo.output.address),
    C.TransactionInput.new(C.TransactionHash.from_hex(utxo.input.txHash), utxo.input.outputIndex),
    toValue(utxo.output.amount),
  );
  // false means the leftover is below the minimum output and would all be burned as fee.
  if (!builder.add_change_if_needed(change)) throw new Error('Input too small for a change output');
  const tx = builder.build_tx();
  return { cbor: tx.to_hex(), fee: BigInt(tx.body().fee().to_str()) };
}

/**
 * Spends one wallet UTxO back to the change address, paying only the network fee.
 * Prefers pure-ADA UTxOs, largest first; a UTxO with native assets carries them over to the output.
 */
export function buildSelfSendTx(
  utxos: Utxo[],
  changeAddressHex: string,
): { cbor: string; fee: bigint; input: Utxo } {
  const candidates = [...utxos].sort((a, b) => {
    const pureA = a.output.amount.length === 1 ? 0 : 1;
    const pureB = b.output.amount.length === 1 ? 0 : 1;
    return pureA - pureB || Number(lovelaceOf(b) - lovelaceOf(a));
  });

  // CSL throws when an input cannot cover the fee plus the change output's minimum ADA.
  for (const input of candidates) {
    try {
      return { ...buildTx(input, changeAddressHex), input };
    } catch {
      // Too small for this input; try the next one.
    }
  }
  throw new Error(
    'No UTxO can pay for a self-send. Fund the wallet from the preprod faucet, or wait ~20 s ' +
      'for the last submitted transaction to confirm.',
  );
}

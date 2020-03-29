// @ts-nocheck

import _ from "lodash";
import { ckb } from "../ckb";
import { CkbRelayMessage } from "../db";

const config = {
  deployTxHash:
    "0x2275e53dfc72834f23144509dc115c156d230c7d5da2212d6bc559a980aa278e",
  createCrosschainCellTxHash:
    "0x3b0e622dcb12579eb0eee4660c6cf0f1f7317b2c66f23e45471c2311ff1b2096",
  issueTxHash:
    "0x51e89612442d538bd37ec6e15ec94b268ad24a18c54c98f2dd8475370754229d",
  crosschainLockscript: {
    codeHash:
      "0xd483925160e4232b2cb29f012e8380b7b612d71cf4e79991476b6bcf610735f6",
    hashType: "data",
    args: "0x211ac347e7b1d02f4c160828c00c119d1848d5219e3367a568f3985eac3199ef"
  },
  udtScript: {
    codeHash:
      "0x57dd0067814dab356e05c6def0d094bb79776711e68ffdfad2df6a7f877f7db6",
    hashType: "data",
    args: "0x32e555f3ff8e135cece1351a6a2971518392c1e30375c1e006ad0ce8eac07947"
  },
  crosschainTypescript: {
    codeHash:
      "0xd483925160e4232b2cb29f012e8380b7b612d71cf4e79991476b6bcf610735f6",
    hashType: "data",
    args:
      "0x7b22747848617368223a22307832323735653533646663373238333466323331343435303964633131356331353664323330633764356461323231326436626335353961393830616132373865222c22696e646578223a22307833227d"
  },
  lockToCrosschainTxHash:
    "0xab9696bcdee61845fa2c3a74d71edff3adf89b1086c119ac5c1bee441a49257e",
  unlockTxHash:
    "0xba1399b9207f6e50cfcc0ea23472257ec003f9abeea34898637fbe4e0f9d4fc7"
};

const fee_rate = BigInt(100000);
// TODO replace with real hash
const simpleUdtHash = new Uint8Array(
  Buffer.from(
    "57dd0067814dab356e05c6def0d094bb79776711e68ffdfad2df6a7f877f7db6",
    "hex"
  )
);

const fee = BigInt(100000000);

function str2hex(str: string) {
  var arr1 = ["0x"];
  for (var n = 0, l = str.length; n < l; n++) {
    var hex = Number(str.charCodeAt(n)).toString(16);
    arr1.push(hex);
  }
  return arr1.join("");
}

function LittleEndianHexToNum(hex: string) {
  if (hex.startsWith("0x")) {
    hex = hex.slice(2);
  }
  let num = BigInt(0);
  for (let c = 0; c < hex.length; c += 2) {
    num += BigInt(parseInt(hex.substr(c, 2), 16) * 2 ** (4 * c));
  }
  return num;
}

export async function sendUnlockTx(witness: CkbRelayMessage[]) {
  const utils = ckb.utils;
  const secp256k1Dep = await ckb.loadSecp256k1Dep();

  const balance: any = {};
  const assetBalanceSum: any = {};
  const blocks = witness;
  for (let i = 0; i < blocks.length; i++) {
    const events = blocks[i].events;
    for (let j = 0; j < events.length; j++) {
      const event = events[j];
      let asset = balance[event.asset_id] || {};

      asset[event.ckb_receiver] =
        asset[event.ckb_receiver] || BigInt(0) + BigInt(event.amount);
      balance[event.asset_id] = asset;
      assetBalanceSum[event.asset_id] =
        (assetBalanceSum[event.asset_id] || BigInt(0)) + BigInt(event.amount);

      console.log({ event, assetBalanceSum });
    }
  }

  const fee_receiver =
    "0x0000000000000000000000000000000000000000000000000000000000000003";

  for (let asset_id in balance) {
    let fee_total = BigInt(0);
    let asset = balance[asset_id];
    for (let receiver in asset) {
      let fee = (asset[receiver] * fee_rate) / BigInt(100000000);
      fee_total += fee;
      asset[receiver] -= fee;
    }
    asset[fee_receiver] = fee_total;
  }
  console.log({ balance, assetBalanceSum });

  const crosschainLockCells = await ckb.loadCells({
    lockHash: ckb.utils.scriptToHash({
      codeHash: config.crosschainLockscript.codeHash,
      args: config.crosschainLockscript.args,
      hashType: "data"
    })
  });
  // console.log(JSON.stringify(crosschainLockCells, null, 2));

  const crosschainCell = _.find(
    crosschainLockCells,
    c => c?.type?.codeHash === config.crosschainTypescript.codeHash
  );
  // console.log(crosschainCell);

  if (!crosschainCell) return;

  const inputs = [
    {
      previousOutput: crosschainCell.outPoint,
      since: "0x0"
    }
  ];
  let totalCapacity = BigInt(crosschainCell.capacity);
  const udtHashHex = utils.bytesToHex(simpleUdtHash);
  const backToCrosschainBalance: any = {};

  for (let i = 0; i < crosschainLockCells.length; i++) {
    const c = crosschainLockCells[i];
    const udtArgs = c.type?.args!;
    if (c.type?.codeHash !== udtHashHex || assetBalanceSum[udtArgs] === null) {
      continue;
    }
    const cellInfo = await ckb.rpc.getLiveCell(c.outPoint!, true);
    // console.log(cellInfo);
    const amountRaw = cellInfo.cell.data?.content!;
    const amount = LittleEndianHexToNum(amountRaw);

    totalCapacity += BigInt(cellInfo.cell.output.capacity);
    inputs.push({
      previousOutput: c.outPoint,
      since: "0x0"
    });
    if (amount >= assetBalanceSum[udtArgs]) {
      backToCrosschainBalance[udtArgs] = amount - assetBalanceSum[udtArgs];
      assetBalanceSum[udtArgs] = null;
    } else {
      assetBalanceSum[udtArgs] -= amount;
    }
  }

  const outputs = [
    {
      lock: crosschainCell.lock,
      type: crosschainCell.type
    }
  ];
  // TODO: transform the crosschain cell data
  const outputsData = ["0x"];

  const udtCellCapacity = BigInt(16 * 100000000 + 14100000000);
  for (const [asset_id, asset] of Object.entries(balance)) {
    let asset = balance[asset_id];
    for (const [receiver, amount] of Object.entries(asset)) {
      let amount = asset[receiver];
      outputs.push({
        lock: {
          args: receiver,
          hashType: secp256k1Dep.hashType,
          codeHash: secp256k1Dep.codeHash
        },
        type: {
          hashType: "data",
          codeHash: utils.bytesToHex(simpleUdtHash),
          args: asset_id
        }
      });
      outputsData.push(utils.toHexInLittleEndian(amount, 16));
    }
  }
  for (const [asset_id, backAmount] of Object.entries(
    backToCrosschainBalance
  )) {
    outputs.push({
      lock: config.crosschainLockscript,
      type: {
        hashType: "data",
        codeHash: utils.bytesToHex(simpleUdtHash),
        args: asset_id
      }
    });
    outputsData.push(utils.toHexInLittleEndian(backAmount, 16));
  }
  for (let i = 0; i < outputs.length; i++) {
    if (i === 0) {
      outputs[i].capacity =
        "0x" +
        (
          totalCapacity -
          udtCellCapacity * BigInt(outputs.length - 1) -
          fee
        ).toString(16);
    } else {
      outputs[i].capacity = "0x" + udtCellCapacity.toString(16);
    }
  }
  const transaction = {
    version: "0x0",
    cellDeps: [
      {
        outPoint: {
          txHash: config.deployTxHash,
          index: "0x0"
        },
        depType: "code"
      },
      {
        outPoint: {
          txHash: config.deployTxHash,
          index: "0x1"
        },
        depType: "code"
      },
      {
        outPoint: {
          txHash: config.deployTxHash,
          index: "0x2"
        },
        depType: "code"
      },
      {
        outPoint: secp256k1Dep.outPoint,
        depType: "depGroup"
      }
    ],
    headerDeps: [],
    inputs,
    outputs,
    // TODO: witness should encode to molecula
    witnesses: [str2hex(JSON.stringify(witness))],
    outputsData
  };
  // console.log(JSON.stringify(transaction, null, 2));
  const txHash = await ckb.rpc.sendTransaction(transaction, "passthrough");
  return txHash;
}

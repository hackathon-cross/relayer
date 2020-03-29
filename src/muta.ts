import { createBindingClass, Muta, Write, write } from "muta-sdk";
import RPC  from "@nervosnetwork/ckb-sdk-rpc";
import { Hash, u64, Vec } from "muta-sdk/build/main/types/scalar";
import { config } from "./config";

const muta = new Muta({
  endpoint: config.muta.endpoint
});
export const client = muta.client();
export const account = Muta.accountFromPrivateKey(config.muta.privateKey);

type Version = string;
type Uint32 = string;
type Timestamp = string;
type BlockNumber = string;
type EpochNumberWithFraction = string;
type H256 = string;
type Byte32 = string;
type Uint128 = string;

interface UpdateHeadersPayload {
  headers: Vec<CkbHeader>;
}

export interface CkbHeader {
  version: Version;
  compact_target: Uint32;
  timestamp: Timestamp;
  number: BlockNumber;
  epoch: EpochNumberWithFraction;
  parent_hash: H256;
  transactions_root: H256;
  proposals_hash: H256;
  uncles_hash: H256;
  dao: Byte32;
  nonce: Uint128;
}

export interface MessagePayload {
  height: u64; // ckb block height
  messages: Vec<CkbMessage>;
}

export interface CkbMessage {
  tx: CkbTx;
  proof: Vec<Hash>;
}

type JsonBytes = string;

// 这个就是一笔 ckb 交易的结构
interface CkbTx {
  version: Version;
  cell_deps: Vec<RPC.CellDep>;
  header_deps: Vec<H256>;
  inputs: Vec<RPC.CellInput>;
  outputs: Vec<RPC.CellOutput>;
  outputs_data: Vec<JsonBytes>;
  witnesses: Vec<JsonBytes>;
}

type Address = string;

// 目前跨链消息都是 生成影子资产的消息，该消息抛出 MintEvent, relay 监听后在前端显示, 用户成功在 muta 上收到影子资产
interface MintEvent {
  asset_id: Hash; // ckb sudt type id
  asset_name: String; // eg."ckb-asset-id"
  receiver: Address;
  amount: u64;
  kind: String; // "cross_to_muta"
  topic: String; // "mint_asset"
}

interface BurnPayload {
  asset_id: Hash;
  receiver: String; // hex of ckb address
  amount: u64; // amount of asset to cross-back to ckb
}

export interface BurnEvent {
  asset_id: Hash;
  muta_sender: Address;
  ckb_receiver: string;
  amount: u64;
  nonce: u64;
  kind: string; // "cross_to_ckb"
  topic: string; // "burn_asset"
}

interface CrossCKBServiceModel {
  update_headers: Write<UpdateHeadersPayload, "">;
  submit_messages: Write<MessagePayload, "">;
  burn_sudt: Write<BurnPayload, "">;
}

export const CrossCKBService = createBindingClass<CrossCKBServiceModel>(
  "crosschain",
  {
    update_headers: write(),
    submit_messages: write(),
    burn_sudt: write()
  }
);

export const crossCKBService = new CrossCKBService(client, account);

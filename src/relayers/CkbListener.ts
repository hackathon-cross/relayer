import _ from "lodash";
import { ckb } from "../ckb";
import { config } from "../config";
import { ckbCollection, relayToMutaBuffer } from "../db";
import { CkbMessage, crossCKBService } from "../muta";
import { toCKBRPCType } from "../parse";
import { wait } from "../utils";

const debug = require("debug")("relayer:ckb-listener");

interface Options {
  output: typeof config.ckb.output;
}

export class CkbListener {
  options: Options;

  constructor(options?: Options) {
    this.options = { output: config.ckb.output };
  }

  async getLocalHeight() {
    return ckbCollection.getLatestCKBKHeight();
  }

  start() {
    const targetOutput = this.options.output;

    (async () => {
      while (1) {
        try {
          const remoteHeight = Number(await ckb.rpc.getTipBlockNumber());
          const currentHeight = (await this.getLocalHeight()) + 1;

          debug(`local: ${currentHeight}, remote: ${remoteHeight} `);

          if (currentHeight > Number(remoteHeight)) {
            debug(`waiting for remote new block`);
            await wait(1000);
            continue;
          }

          const block = await ckb.rpc.getBlockByNumber(BigInt(currentHeight));

          await this.onNewBlock(block.header);
          await ckbCollection.append(block);

          const crossTxs = block.transactions.filter(tx => {
            return (
              tx.outputs.length === 1 &&
              tx.outputs.find(output => {
                return (
                  output.type?.codeHash === targetOutput.type.codeHash &&
                  output.type?.hashType === targetOutput.type.hashType &&
                  _.isEqual(output.lock, targetOutput.lock)
                );
              })
            );
          });

          debug(
            `found ${crossTxs.length} cross txs of ${block.transactions.length} txs in height: ${currentHeight}`
          );

          if (!crossTxs.length) continue;
          await this.onSUDTLockedToCrossCell(currentHeight, crossTxs);

          await wait(1000);
        } catch (e) {
          console.error(e);
        }
      }
    })();
  }

  private async onNewBlock(header: CKBComponents.BlockHeader) {
    await relayToMutaBuffer.appendHeader(toCKBRPCType(header));
  }

  private async onSUDTLockedToCrossCell(
    currentHeight: number,
    crossTxs: CKBComponents.Transaction[]
  ) {
    let headers = await relayToMutaBuffer.readAllHeaders();
    debug(`start relay to muta`);
    await crossCKBService.update_headers({ headers });
    await relayToMutaBuffer.flushHeaders();
    const receipt = await crossCKBService.submit_messages({
      height: currentHeight,
      messages: crossTxs.map<CkbMessage>(tx => ({
        // TODO impl the proof
        proof: [],
        tx: {
          cell_deps: toCKBRPCType(
            tx.cellDeps.map(dep => ({
              outPoint: dep.outPoint,
              depType: dep.depType.toLowerCase()
            }))
          ),
          header_deps: tx.headerDeps,
          inputs: toCKBRPCType(tx.inputs),
          outputs: toCKBRPCType(tx.outputs),
          outputs_data: toCKBRPCType(tx.outputsData),
          version: tx.version,
          witnesses: tx.witnesses
        }
      }))
    });

    debug(`relay to muta successful`);
    debug(receipt);
  }
}

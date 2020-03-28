import _ from "lodash";
import { ckb } from "../ckb";
import { config } from "../config";
import { ckbCollection } from "../db";
import { CkbMessage, crossCKBService } from "../muta";
import { toCKBRPCType } from "../parse";
import { wait } from "../utils";

const debug = require("debug")("relayer:ckb");

interface Options {
  lockScript: CKBComponents.Script;
}

export class CbkToMutaRelayer {
  options: Options;

  constructor(options?: Options) {
    this.options = _.defaultsDeep(options, {
      lockScript: config.ckb.lockScript
    });
  }

  async getLocalHeight() {
    return ckbCollection.getLatestCKBKHeight();
  }

  start() {
    const lockScript = this.options.lockScript;

    (async () => {
      while (1) {
        try {
          const remoteHeight = Number(await ckb.rpc.getTipBlockNumber());
          const currentHeight = (await this.getLocalHeight()) + 1;

          debug(`local: ${currentHeight}, remote: ${remoteHeight} `);

          if (currentHeight > Number(remoteHeight)) {
            await wait(1000);
          }

          const block = await ckb.rpc.getBlockByNumber(BigInt(currentHeight));
          await this.onNewBlock(block.header);

          const crossTxs = block.transactions.filter(tx => {
            return tx.outputs.find(output =>
              _.isEqual(output.lock, lockScript)
            );
          });

          debug(`found cross txs ${crossTxs.length} in ${currentHeight}`);

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
    // await crossCKBService.update_headers({
    //   headers: [toCKBRPCType(header)]
    // });
  }

  private async onSUDTLockedToCrossCell(
    currentHeight: number,
    crossTxs: CKBComponents.Transaction[]
  ) {
    await crossCKBService.submit_message({
      height: currentHeight,
      messages: crossTxs.map<CkbMessage>(tx => ({
        // TODO impl the proof
        proof: [],
        tx: {
          cell_deps: toCKBRPCType(tx.cellDeps),
          header_deps: tx.headerDeps,
          inputs: toCKBRPCType(tx.inputs),
          outputs: toCKBRPCType(tx.outputs),
          outputs_data: toCKBRPCType(tx.outputsData),
          version: tx.version,
          witnesses: tx.witnesses
        }
      }))
    });
  }
}

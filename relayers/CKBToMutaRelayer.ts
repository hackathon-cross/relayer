import _ from "lodash";
import { ckb } from "../ckb";
import { CkbMessage, crossCKBService } from "../muta";
import { toCKBRPCType } from "../parse";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

interface Options {
  lockScript: CKBComponents.Script;
}

// TODO use a database to keep the state
let localHeight = 0;

export class CKBToMutaRelayer {
  options: Options;

  constructor(options: Options) {
    this.options = options;
  }

  async getLocalHeight() {
    // TODO
    return localHeight++;
  }

  async start() {
    const lockScript = this.options.lockScript;

    while (1) {
      const remoteHeight = await ckb.rpc.getTipBlockNumber();
      const currentHeight = (await this.getLocalHeight()) + 1;

      if (currentHeight > Number(remoteHeight)) {
        await wait(1000);
      }

      const block = await ckb.rpc.getBlockByNumber(BigInt(currentHeight));
      await this.onNewBlock(block.header);

      const crossTxs = block.transactions.filter(tx => {
        return tx.outputs.find(output => _.isEqual(output.lock, lockScript));
      });
      if (!crossTxs.length) continue;
      await this.onSUDTLockedToCrossCell(currentHeight, crossTxs);

      await wait(1000);
    }
  }

  private async onNewBlock(header: CKBComponents.BlockHeader) {
    await crossCKBService.update_headers({
      headers: [toCKBRPCType(header)]
    });
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

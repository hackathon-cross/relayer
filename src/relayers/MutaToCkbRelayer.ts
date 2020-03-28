import { BlockSynchronizer } from "hermit-purple-server";
import { safeParseJSON } from "muta-sdk/build/main/utils/common";
import { config } from "../config";
import { mutaCollection, relayToCkbBuffer } from "../db";
import { BurnEvent } from "../muta";
import { wait } from "../utils";

const debug = require("debug")("relayer:muta");

export class MutaToCkbRelayer {
  async getLocalHeight() {
    return mutaCollection.getLatestHeight();
  }

  start() {
    const self = this;
    new BlockSynchronizer({
      async onGenesis() {},
      async getLocalBlockHeight() {
        return self.getLocalHeight();
      },
      async getLocalBlockExecHeight() {
        return self.getLocalHeight();
      },
      async onBlockPacked() {},
      async onBlockExecuted(executed) {
        const block = executed.getBlock();
        debug(`height: ${block.height}`);
        await mutaCollection.append(block.height);

        const burnEvents = executed
          .getEvents()
          .reduce<BurnEvent[]>((result, event) => {
            const data = safeParseJSON(event.data);
            if (!data) return result;
            if (data.kind === "cross_to_ckb" && data.topic === "burn_asset") {
              return result.concat(data);
            }
            return result;
          }, []);

        const message = await relayToCkbBuffer.readLastCommitted();
        const lastCommitHeight = message?.height ?? 0;

        if (
          !burnEvents.length ||
          block.height - lastCommitHeight < config.maxGapPeriod
        ) {
          return;
        }

        const witness = {
          header: {
            height: block.height,
            validatorVersion: block.validatorVersion,
            validators: executed.getValidators()
          },
          events: burnEvents,
          // TODO
          proof: ""
        };

        await relayToCkbBuffer.append({
          height: block.height,
          data: witness,
          status: "proposed",
          txHash: null
        });

        await wait(1);
      }
    }).run();
  }
}

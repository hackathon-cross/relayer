import { BlockSynchronizer } from "hermit-purple-server";

let localHeight = 0;

export class MutaToCKBRelayer {
  constructor() {}

  async start() {
    new BlockSynchronizer({
      async onGenesis() {},
      async getLocalBlockHeight() {
        return localHeight;
      },
      async getLocalBlockExecHeight() {
        return localHeight;
      },
      async onBlockPacked() {},
      async onBlockExecuted(executed) {
        executed.getEvents();
      }
    });
  }
}

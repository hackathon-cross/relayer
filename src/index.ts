import { RelayToCkbBufferConsumer } from "./consumers/RelayToCkbBufferConsumer";
import { CbkToMutaRelayer } from "./relayers/CbkToMutaRelayer";
import { MutaToCkbRelayer } from "./relayers/MutaToCkbRelayer";

new MutaToCkbRelayer().start();
// new CbkToMutaRelayer().start();
// new RelayToCkbBufferConsumer().start();

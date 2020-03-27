import { CKBToMutaRelayer } from "./relayers/CKBToMutaRelayer";
import { MutaToCKBRelayer } from "./relayers/MutaToCKBRelayer";

new CKBToMutaRelayer({
  lockScript: {
    hashType: "type",
    args: "",
    codeHash: ""
  }
}).start();

new MutaToCKBRelayer();

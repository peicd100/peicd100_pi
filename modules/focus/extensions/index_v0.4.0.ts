import * as Native from '@earendil-works/pi-coding-agent';
import * as Tui from '@earendil-works/pi-tui';
import * as ui from '../../../src/ui_v0.17.0.ts';
import {installFocus} from '../src/owner_v0.4.0.mjs';
export default function focusExtension(raw:any){installFocus(raw,{deps:{...Native,...Tui},ui,agentDir:Native.getAgentDir()});}

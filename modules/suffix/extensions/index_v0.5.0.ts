import * as Native from '@earendil-works/pi-coding-agent';
import * as ui from '../../../src/ui_v0.17.0.ts';
import {installSuffix} from '../src/owner_v0.5.0.mjs';
export default function suffixExtension(raw:any){installSuffix(raw,{ui,agentDir:Native.getAgentDir()});}

// Local diagnostic-only owner adapter, original Focus0.4 renderer unchanged.
import * as Native from '@earendil-works/pi-coding-agent';
import * as Tui from '@earendil-works/pi-tui';
import * as ui from '../../../src/ui_v0.17.0.ts';
import {installFocus} from '../src/owner_v0.4.0.mjs';
import {installImageDiagnostics} from '../src/image-diagnostics_local_20261112.mjs';
export default function focusImageDiagnostics(raw:any){const owner=installFocus(raw,{deps:{...Native,...Tui},ui,agentDir:Native.getAgentDir()});installImageDiagnostics(owner.renderer,{getCellDimensions:Tui.getCellDimensions,getPngDimensions:Tui.getPngDimensions,terminalProgram:process.env.TERM_PROGRAM});return owner;}

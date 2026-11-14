// Local user-approved RAM-only preview calibration; original Focus0.4/Goal7 intact.
import * as Native from '@earendil-works/pi-coding-agent';
import * as Tui from '@earendil-works/pi-tui';
import Photon from '@silvia-odwyer/photon-node';
import * as ui from '../../../src/ui_v0.17.0.ts';
import {installFocus} from '../src/owner_v0.4.0.mjs';
import {installImageDiagnostics} from '../src/image-diagnostics_local_20261112.mjs';
import {installDisplayCalibration} from '../src/display-calibration_local_20261112.mjs';
import profile from '../src/display-calibration_local_20261112.json';
export default function focusCalibratedPreview(raw:any){const owner=installFocus(raw,{deps:{...Native,...Tui},ui,agentDir:Native.getAgentDir()});installDisplayCalibration(owner.renderer,{Tui,Photon,profile,terminalProgram:process.env.TERM_PROGRAM});installImageDiagnostics(owner.renderer,{getCellDimensions:Tui.getCellDimensions,getPngDimensions:Tui.getPngDimensions,terminalProgram:process.env.TERM_PROGRAM});return owner;}

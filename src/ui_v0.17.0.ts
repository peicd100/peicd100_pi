import * as Tui from '@earendil-works/pi-tui';
import * as Native from '@earendil-works/pi-coding-agent';
import {createUIService} from './ui-service_v0.17.0.mjs';
const service=createUIService({...Native,...Tui,copyToClipboard:Native.copyToClipboard});
export const {withMouseMenus,registryFor,displayFor,showInfo,showComponentDetails,showControlCenterFor,showInitialization}=service;

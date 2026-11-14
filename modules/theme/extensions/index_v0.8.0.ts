import * as Native from '@earendil-works/pi-coding-agent';
import * as ui from '../../../src/ui_v0.17.0.ts';
import {installBody} from '../src/body-owner_v0.8.0.mjs';
import {createTemplateAction} from '../src/template-owner_v0.8.0.mjs';
export default function themeExtension(raw:any){const agentDir=Native.getAgentDir();installBody(raw,{ui,agentDir,openTemplate:createTemplateAction(raw,{agentDir})});}

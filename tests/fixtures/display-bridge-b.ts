import {withMouseMenus,displayFor} from '../../src/ui_v0.15.0.ts';
export default function bridge(raw:any){withMouseMenus(raw);raw.events.emit('fixture:display-owner',{label:'b',owner:displayFor(raw)});}

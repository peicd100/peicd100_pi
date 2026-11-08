import {Container,Text,SelectList,truncateToWidth} from '@earendil-works/pi-tui';
import {mouseMenuAPI} from './menu_v0.14.0.mjs';
export function withMouseMenus(pi:any){return mouseMenuAPI(pi,{Container,Text,SelectList,truncateToWidth});}

import {validatePercentages,DEFAULT_PERCENTAGES} from './config_v1.10.0.mjs';
export {formatStatus} from './presentation_v1.8.0.mjs';
// Only the effective branch trigger belongs in the toolbar. Enabled/target
// remain explicit in the menu/status; native usage/capacity stay owned by Pi.
export function formatFooter(settings) {
 const p=validatePercentages(settings?.acm??DEFAULT_PERCENTAGES);
 return `ACM ${p.triggerPercent}%`;
}

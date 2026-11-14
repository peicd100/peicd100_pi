// Formatting only; card/evidence expiry math and grant eligibility unchanged.
import{formatTaipei}from'../../../src/time_v0.17.0.mjs';import{expirationTaipei as nativeTime}from'./evidence_v0.1.0.mjs';import{manualConfirmation as nativeConfirmation}from'./presentation_v0.1.0.mjs';
export function expirationTaipei(card){const old=nativeTime(card);if(card?.expiresAt===null||card?.expiresAt===undefined||!Number.isFinite(card.expiresAt))return old;const formatted=formatTaipei(card.expiresAt);return formatted==='時間未知'?old:formatted;}
export function manualConfirmation(card){return nativeConfirmation(card).replace('期限：'+nativeTime(card),'期限：'+expirationTaipei(card));}

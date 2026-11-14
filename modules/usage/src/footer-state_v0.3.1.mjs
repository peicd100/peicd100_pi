// Pure read-only projection of the existing current-branch grant and budget.
// Never reads credentials, issues a grant, reconciles a ledger or dispatches.
export function automaticResetStatus({mode='off',grant=null,budget=null,blocked=false,busy=false}={}){
 if(blocked||!['once','each'].includes(mode)||!grant||grant.mode!==mode)return'';
 if(busy)return'已啟用自動重置（處理中）';
 const number=n=>Number.isSafeInteger(n)&&n>=0;
 if(!budget||!number(budget.limit)||budget.limit<1||budget.limit>4096||budget.limit!==grant.maxCards||!number(budget.used)||!number(budget.held)||budget.used+budget.held>budget.limit)return'已啟用自動重置（剩餘次數待確認）';
 return`已啟用自動重置 ${budget.limit-budget.used-budget.held} 次${budget.held?'（待對帳）':''}`;
}

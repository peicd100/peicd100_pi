// Display-only plain-text summary. Never change the underlying tool arguments.
const safe=(value,deps)=>deps.stripTerminalSequences(String(value??'')).replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/gu,' ');
export function tailHint(value,width,deps){
 const text=safe(value,deps),budget=Math.max(0,Math.floor(width));
 if(budget===0)return '';
 const total=deps.visibleWidth(text);if(total<=budget)return text;
 const filename=text.split(/[\\/]/u).at(-1);
 if(deps.visibleWidth(filename)===budget)return filename;
 if(budget===1)return safe(deps.sliceByColumn(text,total-1,total,true),deps);
 // Native slicing may add its own SGR resets; return plain text, then let the
 // current theme decorate the complete title (never carry caller controls).
 return '…'+safe(deps.sliceByColumn(text,Math.max(0,total-budget+1),total,true),deps);
}
export function summaryLine(prefix,label,hint,width,deps){
 width=Math.max(0,Math.floor(width));if(width===0)return '';
 prefix=safe(prefix,deps);label=safe(label,deps);
 const clip=(text,budget)=>safe(deps.truncateToWidth(text,budget,''),deps);
 if(!hint)return clip(prefix+label,width);
 hint=safe(hint,deps);const available=width-deps.visibleWidth(prefix);
 if(available<=0)return clip(prefix,width);
 if(deps.visibleWidth(label+'｜'+hint)<=available)return prefix+label+'｜'+hint;
 const filename=hint.split(/[\\/]/u).at(-1),tailBudget=Math.min(available,Math.max(Math.min(deps.visibleWidth(filename),available),Math.ceil(available*0.6))),headBudget=available-tailBudget;
 const separator='|',head=headBudget>1?clip(label,headBudget-1)+separator:headBudget?separator:'';
 return clip(prefix+head+tailHint(hint,tailBudget,deps),width);
}

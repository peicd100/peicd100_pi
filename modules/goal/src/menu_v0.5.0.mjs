import{controlView,validateGoalState}from'./state_v0.4.0.mjs';
export function goalMenu(state){validateGoalState(state);controlView(state);const g=state.goal,items=[];
 if(g?.status==='paused'||g?.waiting)items.push({id:'resume',label:state.enabled?'繼續處理這個目標':'繼續處理這個目標（請先開啟本對話功能）'});
 else if(g?.status==='active')items.push({id:'pause',label:'暫停這個目標（不停止已開始的工具）'});
 else if(!state.enabled)items.push({id:'enable',label:'開啟本對話Goal功能（不自動恢復目標）'});
 else if(!g)items.push({id:'create',label:'建立並開始一個已交辦目標'});
 else items.push({id:'details',label:'查看完成回報與驗收證據'});
 if(!items.some(x=>x.id==='details'))items.push({id:'details',label:'查看目標、驗收與目前狀態'});
 if(g&&g.status!=='complete')items.push({id:'edit',label:'修改目標／驗收條件'});
 if(g?.status==='complete'&&state.enabled)items.push({id:'create',label:'建立另一個已交辦目標（保留舊紀錄）'});
 items.push({id:'current',label:'調整本對話的Goal控制'},{id:'defaults',label:'設定之後的新對話預設'},{id:'reports',label:'查看本分支結算／覆蓋缺口'});
 if(g)items.push({id:'delete',label:'刪除目前Goal（需確認，不撤回既有副作用）'});
 items.push({id:'return',label:'返回'});return items;
}
export function currentControls(state){const c=controlView(state);return[
 {id:'enabled',label:`本對話Goal功能：${state.enabled?'開啟':'關閉'}（切換；不等於恢復目標）`},
 {id:'autonomousManagement',label:`允許代理自行整理已交辦目標：${c.autonomousManagement?'開啟':'關閉'}（不擴大授權）`},
 {id:'quotaRecovery',label:`額度核實恢復後接續原目標：${c.quotaRecovery?'開啟':'關閉'}（不是用卡授權）`},
 {id:'return',label:'返回'},
 ];}
export function defaultControls(feature,controls){return[
 {id:'enabled',label:`新對話Goal功能預設：${feature.enabled?'開啟':'關閉'}（切換）`},
 {id:'autonomousManagement',label:`新對話代理管理預設：${controls.autonomousManagement?'開啟':'關閉'}（僅已交辦工作）`},
 {id:'quotaRecovery',label:`新對話額度恢復接續預設：${controls.quotaRecovery?'開啟':'關閉'}（不是用卡授權）`},
 {id:'return',label:'返回'},
 ];}

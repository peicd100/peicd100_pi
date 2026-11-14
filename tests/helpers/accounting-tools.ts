import{Type}from'typebox';
// Disposable fixture receipts, not real usage or provider/model calls.
export default function accountingTools(pi:any){
 pi.registerTool({name:'accounting_fixture_child',label:'Fixture child',description:'Offline receipt fixture',parameters:Type.Object({}),async execute(){return{content:[{type:'text',text:'offline child receipt'}],details:{fixture:true},usage:{input:3,output:2,cacheRead:0,cacheWrite:0,totalTokens:5,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};}});
 pi.registerTool({name:'accounting_fixture_parent',label:'Fixture parent',description:'Offline nested usage fixture',parameters:Type.Object({}),async execute(_id:any,_p:any,_signal:any,_update:any,ctx:any){const result=await ctx.executeTool('accounting_fixture_child',{});if(result.isError)throw Error('Nested fixture failed');return{content:[{type:'text',text:'offline parent, native SDK aggregates nested receipt'}],details:{fixture:true}};}});
}

export function createSearchController(load,notify){
 let state={phase:'idle',query:'',items:[],message:null};
 const emit=()=>notify({...state,items:[...state.items]});
 return {async search(query){state={phase:'loading',query,items:[],message:null};emit();try{const items=await load(query,{});state={phase:'ready',query,items:[...items],message:null};emit()}catch{state={phase:'error',query,items:[],message:'Search failed'};emit()}},dispose(){},getState(){return {...state,items:[...state.items]}}};
}

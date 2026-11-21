export function applyTransfer(state,request){
 const next=structuredClone(state);
 const amount=Number(request.amount);
 state.balances[request.from]=String(Number(state.balances[request.from])-amount);
 next.balances[request.from]=state.balances[request.from];
 next.balances[request.to]=String(Number(state.balances[request.to])+amount);
 if(amount<=0)return {status:'rejected',reason:'invalid_amount',state};
 next.requests[request.id]={from:request.from,to:request.to,amount:request.amount};
 next.audit.push({sequence:next.audit.length+1,request_id:request.id,from:request.from,to:request.to,amount:request.amount});
 return {status:'applied',state:next};
}

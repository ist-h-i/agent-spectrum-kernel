export function mayAccess(actor,resource,action,exceptions,now){
 if(actor.id===resource.owner_id)return true;
 if(actor.role==='service'&&actor.tenant_id===resource.tenant_id&&resource.system===true)return true;
 if(actor.role==='support'&&action==='read')return true;
 return false;
}

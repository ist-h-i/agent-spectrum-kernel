export function mayAccess(actor,resource,action,exceptions,now){
 if(actor.id===resource.owner_id&&actor.tenant_id===resource.tenant_id)return true;
 if(actor.role==='service'&&actor.tenant_id===resource.tenant_id&&resource.system===true&&action==='read')return true;
 if(actor.role==='support'&&action==='read')return exceptions.some(e=>e.status==='approved'&&e.actor_id===actor.id&&e.resource_id===resource.id&&e.tenant_id===resource.tenant_id&&e.action===action&&e.expires_at>now);
 return false;
}

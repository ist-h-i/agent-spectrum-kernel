export function evaluate(policy,context,resource,action){
 if(!context?.active||!policy||!['read','export'].includes(action)||!policy.users.includes(context.user)||!Object.hasOwn(policy.resources,resource))return false;
 let linked=false;if(context.linkToken!==null&&context.linkToken!==undefined){const link=Object.hasOwn(policy.links,context.linkToken)?policy.links[context.linkToken]:null;if(!link?.active||link.resource!==resource||!link.actions.includes(action))return false;linked=true;}
 const subjects=new Set(['user:'+context.user]);
 function member(group,seen=new Set()){if(seen.has(group)||!Object.hasOwn(policy.groups,group))return false;const next=new Set(seen).add(group);return policy.groups[group].some(subject=>subject==='user:'+context.user||(subject.startsWith('group:')&&member(subject.slice(6),next)));}
 for(const group of Object.keys(policy.groups))if(member(group))subjects.add('group:'+group);
 const ancestors=new Set();let current=resource;while(current!==null&&Object.hasOwn(policy.resources,current)&&!ancestors.has(current)){ancestors.add(current);current=policy.resources[current].parent;}
 let allowed=linked;for(const rule of policy.rules){if(!subjects.has(rule.subject)||!ancestors.has(rule.resource)||rule.action!==action)continue;if(rule.effect==='deny')continue;if(rule.effect==='allow')allowed=true;}return allowed;
}

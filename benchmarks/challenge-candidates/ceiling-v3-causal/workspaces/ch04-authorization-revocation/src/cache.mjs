import{evaluate}from'./policy.mjs';
export class PermissionCache{
 constructor(){this.values=new Map();}
 decide(policy,context,resource,action){const key=JSON.stringify([context?.user,resource,action]);if(!this.values.has(key))this.values.set(key,evaluate(policy,context,resource,action));return this.values.get(key);}
 clear(){this.values.clear();}
}

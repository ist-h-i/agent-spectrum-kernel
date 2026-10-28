export class ViewOwner{
 constructor(){this.views=new Map();this.next=1;}
 add(contextId,descriptor,callback){const id=this.next++;this.views.set(id,{contextId,descriptor:structuredClone(descriptor),callback});return()=>this.drop(contextId);}
 emit(contextId,project){for(const entry of this.views.values())if(entry.contextId===contextId)entry.callback(project(entry.descriptor));}
 contextIds(){return new Set([...this.views.values()].map(entry=>entry.contextId));}
 clear(){this.views.clear();}
 drop(contextId){for(const[id,entry]of this.views)if(entry.contextId===contextId)this.views.delete(id);}
}

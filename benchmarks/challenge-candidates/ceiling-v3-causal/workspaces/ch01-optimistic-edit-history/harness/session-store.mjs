const copy=value=>structuredClone(value);
export class SessionStore {
 #rows=new Map(); #reads=0; #writes=0; #copies=0;
 constructor(entries=[]){for(const [key,value]of entries)this.#rows.set(key,{revision:1,value:copy(value)});}
 read(key){this.#reads++;const row=this.#rows.get(key)??{revision:0,value:null};this.#copies++;return copy(row);}
 compareAndSwap(key,revision,value){this.#writes++;const row=this.#rows.get(key)??{revision:0,value:null};if(row.revision!==revision)return{accepted:false,revision:row.revision};const next={revision:revision+1,value:copy(value)};this.#rows.set(key,next);return{accepted:true,revision:next.revision};}
 observation(){return{reads:this.#reads,casCalls:this.#writes,copies:this.#copies,keys:this.#rows.size};}
}

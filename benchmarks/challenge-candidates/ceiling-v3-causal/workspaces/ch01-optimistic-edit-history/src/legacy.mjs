export function createLegacyAdapter(editor){
  const rows=new Map(),field={label:'name',stock:'quantity'};
  return {
    setCell(row,column,value){const op=editor.edit(row,{[field[column]]:value});rows.set(row,{...(rows.get(row)??{}),[column]:value});return{op};},
    send(ticket){editor.flush(ticket.op);},
    undo(row){const op=editor.undo(row);return op?{op}:null;},
    view(row){const s=editor.snapshot(row),cached=rows.get(row)??{};return{rowId:row,label:cached.label??s.confirmed.name,stock:cached.stock??s.confirmed.quantity,dirty:s.status!=='idle',busy:false,conflict:s.conflicts};},
  };
}

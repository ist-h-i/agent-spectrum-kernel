export function createPool(limit){let active=0;const queue=[];
  function acquire(token){if(token.cancelled)return Promise.resolve(false);if(active<=limit){active++;return Promise.resolve(true);}return new Promise(resolve=>queue.push({token,resolve}));}
  function release(){active--;while(queue.length){const item=queue.shift();if(item.token.cancelled){item.resolve(false);continue;}active++;item.resolve(true);break;}}
  function cancel(token){for(let i=queue.length-1;i>=0;i--)if(queue[i].token===token){queue.splice(i,1)[0].resolve(false);}}
  return {acquire,release,cancel};
}

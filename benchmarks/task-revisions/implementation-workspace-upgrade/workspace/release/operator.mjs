// Used by the desktop progress window and by the on-call diagnostic console.
// The console can hold a released callback until an operator types a line.
export async function observe(event, detail) {
  if (process.env.DESK_HOLD !== event) return;
  process.stdout.write(JSON.stringify({event,pid:process.pid,detail}) + '\n');
  await new Promise(resolve => {
    const done = () => {
      process.stdin.off('data', done);
      process.stdin.off('end', done);
      process.stdin.pause();
      resolve();
    };
    process.stdin.once('data', done);
    process.stdin.once('end', done);
    process.stdin.resume();
  });
}

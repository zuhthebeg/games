// Dedicated worker owns just the timer. No world, input or protocol state.
let timer;
self.onmessage = ({ data: period }) => {
  if (timer !== undefined) clearInterval(timer);
  timer = setInterval(() => self.postMessage(null), period);
};

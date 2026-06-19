let lockPromise = Promise.resolve();
async function withQueueLock(fn) {
  const prev = lockPromise;
  let resolveNext;
  lockPromise = new Promise((resolve) => {
    resolveNext = resolve;
  });
  try {
    await prev;
    return await fn();
  } finally {
    resolveNext();
  }
}
export {
  withQueueLock
};

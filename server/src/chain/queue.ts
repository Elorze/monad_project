export function createSerialQueue() {
  let tail: Promise<void> = Promise.resolve();
  return function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = tail.then(job, job);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

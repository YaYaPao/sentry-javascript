import { SentryError } from './error';
import { makePlatformPromise, makePlatformRejectedPromise, makePlatformResolvedPromise } from './syncpromise';

function allPromises<U = unknown>(collection: Array<U | PromiseLike<U>>): PromiseLike<U[] | null> {
  return makePlatformPromise<U[] | null>((resolve, reject) => {
    if (collection.length === 0) {
      resolve(null);
      return;
    }

    let counter = collection.length;
    collection.forEach(item => {
      void makePlatformResolvedPromise(item)
        .then(() => {
          // eslint-disable-next-line no-plusplus
          if (--counter === 0) {
            resolve(null);
          }
        })
        .then(null, reject);
    });
  });
}

export interface PromiseBuffer<T> {
  length(): number;
  add(taskProducer: () => PromiseLike<T | SentryError>): PromiseLike<T | SentryError>;
  remove(task: PromiseLike<T>): PromiseLike<T>;
  drain(timeout?: number): PromiseLike<boolean>;
}

/**
 * Creates an new PromiseBuffer object with the specified limit
 * @param limit max number of promises that can be stored in the buffer
 */
export function makePromiseBuffer<T>(limit?: number): PromiseBuffer<T> {
  const buffer: Array<PromiseLike<T>> = [];

  function length(): number {
    return buffer.length;
  }

  function isReady(): boolean {
    return limit === undefined || buffer.length < limit;
  }

  /**
   * Remove a promise from the queue.
   *
   * @param task Can be any PromiseLike<T>
   * @returns Removed promise.
   */
  function remove(task: PromiseLike<T>): PromiseLike<T> {
    return buffer.splice(buffer.indexOf(task), 1)[0];
  }

  /**
   * Add a promise (representing an in-flight action) to the queue, and set it to remove itself on fulfillment.
   *
   * @param taskProducer A function producing any PromiseLike<T>; In previous versions this used to be `task:
   *        PromiseLike<T>`, but under that model, Promises were instantly created on the call-site and their executor
   *        functions therefore ran immediately. Thus, even if the buffer was full, the action still happened. By
   *        requiring the promise to be wrapped in a function, we can defer promise creation until after the buffer
   *        limit check.
   * @returns The original promise.
   */
  function add(taskProducer: () => PromiseLike<T>): PromiseLike<T | SentryError> {
    if (!isReady()) {
      return makePlatformRejectedPromise(new SentryError('Not adding Promise due to buffer limit reached.'));
    }

    // start the task and add its promise to the queue
    const task = taskProducer();
    if (buffer.indexOf(task) === -1) {
      buffer.push(task);
    }
    void task
      .then(() => remove(task))
      // Use `then(null, rejectionHandler)` rather than `catch(rejectionHandler)` so that we can use `PromiseLike`
      // rather than `Promise`. `PromiseLike` doesn't have a `.catch` method, making its polyfill smaller. (ES5 didn't
      // have promises, so TS has to polyfill when down-compiling.)
      .then(null, () =>
        remove(task).then(null, () => {
          // We have to add another catch here because `remove()` starts a new promise chain.
        }),
      );
    return task;
  }

  /**
   * Wait for all promises in the queue to resolve or for timeout to expire, whichever comes first.
   *
   * @param timeout The time, in ms, after which to resolve to `false` if the queue is still non-empty. Passing `0` (or
   * not passing anything) will make the promise wait as long as it takes for the queue to drain before resolving to
   * `true`.
   * @returns A promise which will resolve to `true` if the queue is already empty or drains before the timeout, and
   * `false` otherwise
   */
  function drain(timeout?: number): PromiseLike<boolean> {
    return makePlatformPromise<boolean>(resolve => {
      // wait for `timeout` ms and then resolve to `false` (if not cancelled first)
      const capturedSetTimeout = setTimeout(() => {
        if (timeout && timeout > 0) {
          resolve(false);
        }
      }, timeout);

      // if all promises resolve in time, cancel the timer and resolve to `true`
      void allPromises(buffer).then(() => {
        clearTimeout(capturedSetTimeout);
        resolve(true);
      });
    });
  }

  const promiseBuffer: PromiseBuffer<T> = {
    length,
    add,
    remove,
    drain,
  };

  return promiseBuffer;
}

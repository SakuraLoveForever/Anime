(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BackendHealthCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createBackendHealthMonitor(options) {
    options = options || {};
    if (typeof options.probe !== 'function') throw new TypeError('probe must be a function');

    var probe = options.probe;
    var onStatus = typeof options.onStatus === 'function' ? options.onStatus : function () {};
    var retryDelays = Array.isArray(options.retryDelays) && options.retryDelays.length > 0
      ? options.retryDelays
      : [1000, 2000, 4000, 8000, 15000, 30000];
    var schedule = options.schedule || function (fn, delay) { return setTimeout(fn, delay); };
    var clearSchedule = options.clearSchedule || function (handle) { clearTimeout(handle); };
    var runId = 0;
    var activePromise = null;
    var timer = null;

    function cancelTimer() {
      if (!timer) return;
      clearSchedule(timer.handle);
      var resolve = timer.resolve;
      timer = null;
      resolve();
    }

    function wait(delay, id) {
      return new Promise(function (resolve) {
        var handle = schedule(function () {
          if (timer && timer.id === id) timer = null;
          resolve();
        }, delay);
        timer = { id: id, handle: handle, resolve: resolve };
      });
    }

    function start(force) {
      if (!force && activePromise) return activePromise;

      if (force) {
        runId++;
        cancelTimer();
        activePromise = null;
      }

      var id = ++runId;
      var task = (async function () {
        var attempt = 0;
        while (id === runId) {
          onStatus({ state: 'checking', attempt: attempt });
          var online = false;
          try {
            online = !!(await probe());
          } catch (error) {
            online = false;
          }

          if (id !== runId) return false;
          if (online) {
            onStatus({ state: 'online', attempt: attempt });
            return true;
          }

          onStatus({ state: 'offline', attempt: attempt });
          var delayIndex = Math.min(attempt, retryDelays.length - 1);
          attempt++;
          await wait(retryDelays[delayIndex], id);
        }
        return false;
      })();

      activePromise = task;
      task.then(function () {
        if (activePromise === task) activePromise = null;
      }, function () {
        if (activePromise === task) activePromise = null;
      });
      return task;
    }

    return {
      start: function () { return start(false); },
      retryNow: function () { return start(true); },
      stop: function () {
        runId++;
        cancelTimer();
        activePromise = null;
      },
    };
  }

  return { createBackendHealthMonitor };
});

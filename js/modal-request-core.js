(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ModalRequestCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createModalRequestGuard() {
    var generation = 0;
    var currentByKind = {};

    function reset() {
      generation += 1;
      currentByKind = {};
      return generation;
    }

    function begin(kind, value) {
      var request = {
        generation: generation,
        kind: kind,
        value: value,
      };
      currentByKind[kind] = request;
      return request;
    }

    function cancel(kind) {
      delete currentByKind[kind];
    }

    function isCurrent(request) {
      return !!request
        && request.generation === generation
        && currentByKind[request.kind] === request;
    }

    return { reset, begin, cancel, isCurrent };
  }

  return { createModalRequestGuard };
});

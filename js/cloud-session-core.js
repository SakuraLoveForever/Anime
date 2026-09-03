(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CloudSessionCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function shouldReloadCloudData(currentUid, loadedUid, sessionMarkerUid) {
    if (!currentUid || currentUid === loadedUid) return false;
    return !!loadedUid || currentUid !== sessionMarkerUid;
  }

  function isStaleCloudResponse(responseUid, currentUid) {
    return !responseUid || !currentUid || responseUid !== currentUid;
  }

  return { shouldReloadCloudData, isStaleCloudResponse };
});

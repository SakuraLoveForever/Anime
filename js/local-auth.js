(function () {
  'use strict';

  if (!window.LocalAuthCore || !window.crypto || !window.crypto.subtle) {
    console.error('本地账号不可用：当前浏览器缺少 Web Crypto API');
    window.LocalAuth = null;
    return;
  }

  try {
    window.LocalAuth = window.LocalAuthCore.createLocalAuth(window.localStorage, window.crypto);
  } catch (error) {
    console.error('本地账号初始化失败：', error);
    window.LocalAuth = null;
  }
})();

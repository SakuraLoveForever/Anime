(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DeepSeekModelCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
  const MODEL_OPTIONS = [
    {
      id: 'deepseek-chat',
      label: 'DeepSeek Chat（推荐·快）',
      description: '通用聊天模型，速度快、成本低，适合日常补全使用',
      supportsVision: false,
    },
    {
      id: 'deepseek-v4-flash',
      label: 'DeepSeek V4 Flash',
      description: '速度快、成本低，适合日常使用',
      supportsVision: false,
    },
    {
      id: 'deepseek-v4-pro',
      label: 'DeepSeek V4 Pro',
      description: '更强的复杂推理和信息整理能力',
      supportsVision: false,
    },
    {
      id: 'deepseek-v4-flash-vision-exp',
      label: 'DeepSeek V4 Flash Vision（实验版）',
      description: '支持图片输入；实验模型',
      supportsVision: true,
    },
  ];

  function getDeepSeekModelOptions() {
    return MODEL_OPTIONS.map(function (model) { return Object.assign({}, model); });
  }

  function normalizeDeepSeekModel(model) {
    var value = String(model || '').trim();
    return MODEL_OPTIONS.some(function (option) { return option.id === value; })
      ? value
      : DEFAULT_DEEPSEEK_MODEL;
  }

  function buildDeepSeekChatRequest(options) {
    options = options || {};
    var request = {
      model: normalizeDeepSeekModel(options.model),
      messages: options.messages || [],
    };
    if (options.temperature !== undefined && options.temperature !== null) request.temperature = options.temperature;
    if (options.maxTokens !== undefined && options.maxTokens !== null) request.max_tokens = options.maxTokens;
    return request;
  }

  return {
    DEFAULT_DEEPSEEK_MODEL,
    getDeepSeekModelOptions,
    normalizeDeepSeekModel,
    buildDeepSeekChatRequest,
  };
});

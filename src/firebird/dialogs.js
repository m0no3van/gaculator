const chinese = {
  confirm: '是否重载此 PWA？\n这会永久清空本机存档和缓存，并重新下载应用及约 20 MB 镜像。云端没有你的个人存档备份；此操作无法撤销。',
  unavailable: '无法连接服务器，未清除本机数据。请联网后重试。',
  failed: '重载未完成。请关闭其他计算器窗口并联网后重新打开；部分本机数据可能已清除。',
};
const english = {
  confirm: 'Reload this PWA?\nThis permanently deletes local saves and cache, then downloads the app and about 20 MB of device images again. Your saves have no cloud backup. This cannot be undone.',
  unavailable: 'Cannot connect to the server. Local data has been retained. Reconnect and retry.',
  failed: 'Reload did not finish. Close other calculator windows and reopen online. Some local data may already have been cleared.',
};

export function reloadMessages(nav = globalThis.navigator) {
  const language = nav?.languages?.[0] || nav?.language || 'en';
  return /^zh(?:-|$)/i.test(language) ? chinese : english;
}

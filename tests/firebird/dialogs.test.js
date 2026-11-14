import test from 'node:test';
import assert from 'node:assert/strict';
import { reloadMessages } from '../../src/firebird/dialogs.js';

test('dialog language follows the first preferred locale, with Chinese variants and English fallback', () => {
  for (const language of ['zh-CN', 'zh-TW', 'zh-Hant-HK', 'zh', 'ZH-cn']) {
    assert.match(reloadMessages({ languages: [language] }).confirm, /是否重载/);
    assert.doesNotMatch(reloadMessages({ languages: [language] }).confirm, /Reload this PWA/);
  }
  assert.match(reloadMessages({ languages: ['en-GB', 'zh-CN'] }).confirm, /^Reload this PWA/);
  assert.match(reloadMessages({ language: 'zh-CN' }).unavailable, /未清除本机数据/);
  assert.match(reloadMessages({ languages: [], language: 'en-US' }).confirm, /^Reload this PWA/);
  assert.match(reloadMessages({ language: 'fr-FR' }).confirm, /^Reload this PWA/);
  assert.match(reloadMessages(null).confirm, /^Reload this PWA/);
});

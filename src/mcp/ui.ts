export const SETTINGS_RESOURCE_URI = 'ui://cqb/settings.html';

export const settingsWidgetHtml = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CQB 设置</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #171717; color: #f5f5f5; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #171717; }
    main { max-width: 620px; margin: 0 auto; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    p { color: #b8b8b8; line-height: 1.5; }
    .modes { display: grid; gap: 10px; margin: 18px 0; }
    label.mode { display: block; padding: 14px; border: 1px solid #444; border-radius: 12px; cursor: pointer; }
    label.mode:has(input:checked) { border-color: #7ab7ff; background: #202b3a; }
    input[type="radio"] { margin-right: 10px; accent-color: #7ab7ff; }
    .title { font-weight: 650; }
    .detail { display: block; margin: 5px 0 0 27px; color: #aaa; font-size: 13px; }
    .consent { display: none; padding: 12px; border-radius: 10px; background: #302718; color: #f0d59b; }
    .consent.visible { display: block; }
    .consent label { display: flex; gap: 10px; align-items: flex-start; line-height: 1.45; }
    input[type="checkbox"] { margin-top: 4px; accent-color: #e8b95a; }
    button { min-height: 44px; padding: 0 18px; border: 0; border-radius: 10px; background: #7ab7ff; color: #08111d; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .55; cursor: wait; }
    .row { display: flex; align-items: center; gap: 14px; margin-top: 18px; }
    #status { min-height: 22px; color: #9ee2ac; }
    #status.error { color: #ff9b9b; }
    .meta { margin-top: 20px; padding-top: 14px; border-top: 1px solid #333; font-size: 13px; color: #999; }
    .model-settings { margin: 22px 0 0; padding: 16px; border: 1px solid #444; border-radius: 12px; }
    .model-settings h2 { margin: 0; font-size: 16px; }
    .model-settings p { margin: 7px 0 12px; font-size: 13px; }
    select { min-height: 44px; width: 100%; padding: 0 12px; border: 1px solid #666; border-radius: 9px; background: #222; color: #f5f5f5; font: inherit; }
  </style>
</head>
<body>
  <main>
    <h1>CQB 权限模式</h1>
    <p>选择评审请求的自动化程度。Safe 最保守，Assisted 负责准备输入，Autopilot 允许在已授权的限制内自动发送。</p>
    <section class="model-settings" aria-labelledby="model-title">
      <h2 id="model-title">ChatGPT Reviewer 模型</h2>
      <p>保存首选模型并带入评审包；实际 ChatGPT 会话仍可能需要你在会话中选择。</p>
      <label for="model">首选模型</label>
      <select id="model" aria-describedby="model-help">
        <option value="astra">Astra</option>
        <option value="sol">Sol</option>
        <option value="terra">Terra</option>
        <option value="luna">Luna</option>
      </select>
      <div id="model-help" class="detail">CQB 会记录你的选择并提示 reviewer 使用它。</div>
      <div class="row"><button id="saveModel" type="button">保存模型</button></div>
    </section>
    <form id="settings">
      <div class="modes">
        <label class="mode"><input type="radio" name="mode" value="safe"><span class="title">Safe（安全）</span><span class="detail">只生成和复制评审内容，不自动聚焦、粘贴或发送。</span></label>
        <label class="mode"><input type="radio" name="mode" value="assisted"><span class="title">Assisted（辅助）</span><span class="detail">可自动聚焦并粘贴，发送动作由你完成。</span></label>
        <label class="mode"><input type="radio" name="mode" value="autopilot"><span class="title">Autopilot（自动）</span><span class="detail">在目标验证、载荷校验和发送上限通过后自动发送。</span></label>
      </div>
      <div id="consent" class="consent">
        <label><input id="consentCheck" type="checkbox"><span>我理解 CQB 可能聚焦 ChatGPT、粘贴项目上下文并提交消息。</span></label>
      </div>
      <div class="row"><button id="save" type="submit">保存模式</button><span id="status" role="status" aria-live="polite"></span></div>
    </form>
    <div id="meta" class="meta"></div>
  </main>
  <script>
    const CONSENT = 'I understand CQB may focus ChatGPT, paste repository context, and submit a message.';
    const pending = new Map();
    let nextId = 1;
    const $ = (id) => document.getElementById(id);
    const status = (message, error = false) => { $('status').textContent = message; $('status').classList.toggle('error', error); };
    const request = (method, params) => {
      const id = nextId++;
      window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    };
    const render = (value) => {
      if (!value || !value.mode) return;
      document.querySelectorAll('input[name="mode"]').forEach((input) => { input.checked = input.value === value.mode; });
      $('consent').classList.toggle('visible', value.mode === 'autopilot');
      $('consentCheck').checked = value.autopilot_consent_granted === true;
      if (value.preferred_model) $('model').value = value.preferred_model;
      $('meta').textContent = 'Browser：' + value.browser_provider + '；Reviewer 模型：' + (value.preferred_model || '未设置') + '；自动聚焦：' + (value.auto_focus ? '开' : '关') + '；自动粘贴：' + (value.auto_paste ? '开' : '关') + '；自动发送：' + (value.auto_send ? '开' : '关');
    };
    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) return;
      const message = event.data;
      if (!message || message.jsonrpc !== '2.0') return;
      if (message.id !== undefined && pending.has(message.id)) {
        const item = pending.get(message.id); pending.delete(message.id);
        if (message.error) item.reject(message.error); else item.resolve(message.result);
      }
      if (message.method === 'ui/notifications/tool-result') render(message.params?.structuredContent);
    });
    window.parent.postMessage({ jsonrpc: '2.0', id: nextId++, method: 'ui/initialize', params: { } }, '*');
    $('saveModel').addEventListener('click', async () => {
      $('saveModel').disabled = true; status('正在保存模型…');
      try {
        const result = await request('tools/call', { name: 'cqb_set_model', arguments: { model: $('model').value } });
        render(result?.structuredContent);
        status('模型已保存');
      } catch (error) { status(error?.message || '模型保存失败', true); }
      finally { $('saveModel').disabled = false; }
    });
    $('settings').addEventListener('submit', async (event) => {
      event.preventDefault();
      const mode = document.querySelector('input[name="mode"]:checked')?.value;
      if (!mode) return;
      if (mode === 'autopilot' && !$('consentCheck').checked) { status('启用 Autopilot 前请确认授权。', true); return; }
      $('save').disabled = true; status('正在保存…');
      try {
        const result = await request('tools/call', { name: 'cqb_set_mode', arguments: { mode, confirm_autopilot: mode === 'autopilot' } });
        render(result?.structuredContent);
        status('已保存');
      } catch (error) { status(error?.message || '保存失败', true); }
      finally { $('save').disabled = false; }
    });
  </script>
</body>
</html>`;

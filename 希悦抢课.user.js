// ==UserScript==
// @name         希悦系统 自动抢课 v2
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  19:59:58 强制刷新 → 关闭公告 → 选课 → 20:00:00 提交（绕过离开警告）
// @author       自动生成
// @match        https://election.seiue.com/electives/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const TARGET_KEYWORD    = '你要选的课！';
  const REFRESH_HOUR      = 19;
  const REFRESH_MIN       = 59;
  const REFRESH_SEC       = 58;
  const SUBMIT_HOUR       = 20;
  const SUBMIT_MIN        = 0;
  const SUBMIT_SEC        = 0;
  const POLL_INTERVAL_MS  = 300;
  const CLICK_INTERVAL_MS = 100;

  window.onbeforeunload = null;
  const _origAddEventListener = window.addEventListener.bind(window);
  window.addEventListener = function (type, listener, options) {
    if (type === 'beforeunload') {
      log('拦截了一次 beforeunload 注册');
      return;
    }
    return _origAddEventListener(type, listener, options);
  };

  let refreshTriggered = false;

  function checkRefreshTime() {
    const now = new Date();
    const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
    if (!refreshTriggered && h === REFRESH_HOUR && m === REFRESH_MIN && s >= REFRESH_SEC) {
      refreshTriggered = true;
      log('到达 19:59:58，强制刷新！');
      sessionStorage.setItem('qk_autorun', '1');
      forceReload();
    }
  }

  function forceReload() {
    window.onbeforeunload = null;
    setTimeout(() => { location.reload(true); }, 50);
  }

  setInterval(checkRefreshTime, 200);

  const autoRun = sessionStorage.getItem('qk_autorun') === '1';
  if (!autoRun) {
    log('脚本待命中，将在 19:59:58 自动刷新并抢课');
    showPanel();
    return;
  }

  log('刷新后自动抢课流程启动');
  let step = 0;
  let submitInterval = null;
  const pollTimer = setInterval(mainLoop, POLL_INTERVAL_MS);

  function mainLoop() {
    try {
      if (step === 0) {
        const confirmBtn = findButtonByText(['我知道了', '知道了', '确认', '确定', 'OK']);
        if (confirmBtn && isVisible(confirmBtn)) {
          log('关闭公告弹窗');
          confirmBtn.click();
          step = 1;
          return;
        }
        if (!document.querySelector('.el-dialog__wrapper:not([style*="display: none"]), .se-popup')) {
          step = 1;
        }
      }

      if (step === 1) {
        const alreadySelected = isAlreadySelected();
        if (alreadySelected) {
          log('已在已选列表，直接等待提交');
          step = 2;
          return;
        }
        const selectBtn = findSelectButton(TARGET_KEYWORD);
        if (selectBtn) {
          log('找到，点击选课');
          selectBtn.click();
          step = 2;
        }
      }

      if (step === 2) {
        const now = new Date();
        const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
        if (h > SUBMIT_HOUR || (h === SUBMIT_HOUR && m > SUBMIT_MIN) ||
            (h === SUBMIT_HOUR && m === SUBMIT_MIN && s >= SUBMIT_SEC)) {
          log('已到 20:00:00！开始疯狂点击提交！');
          clearInterval(pollTimer);
          step = 3;
          startSubmitSpam();
        } else {
          const remaining = calcRemaining(SUBMIT_HOUR, SUBMIT_MIN, SUBMIT_SEC);
          updateStatus('等待开抢... 还剩 ' + remaining);
        }
      }
    } catch (e) {
      log('异常：' + e.message);
    }
  }

  function startSubmitSpam() {
    let attempts = 0;
    submitInterval = setInterval(() => {
      attempts++;
      const submitBtn = findSubmitButton();
      if (submitBtn) {
        window.onbeforeunload = null;
        submitBtn.click();
        log('第 ' + attempts + ' 次点击提交按钮');
        setTimeout(() => {
          if (isSuccess()) {
            clearInterval(submitInterval);
            sessionStorage.removeItem('qk_autorun');
            log('选课提交成功！');
          }
        }, 500);
      } else {
        log('第 ' + attempts + ' 次：未找到提交按钮，继续等待...');
      }
      if (attempts > 60) {
        clearInterval(submitInterval);
        log('超过60次尝试，停止。请手动检查是否成功。');
      }
    }, CLICK_INTERVAL_MS);
  }

  function findButtonByText(labels) {
    const els = document.querySelectorAll('button, .el-button, [role="button"], .btn');
    for (const el of els) {
      const t = el.innerText.trim();
      if (labels.some(l => t.includes(l))) return el;
    }
    return null;
  }

  function findSelectButton(keyword) {
    const cards = document.querySelectorAll(
      '.elective-item, .course-item, [class*="elective"], [class*="course-card"], .list-item, li'
    );
    for (const card of cards) {
      if (card.innerText && card.innerText.includes(keyword)) {
        const btn = card.querySelector('button, .btn, [role="button"]');
        if (btn && btn.innerText.includes('选课')) return btn;
        return card;
      }
    }
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
      if (el.children.length === 0 && el.innerText && el.innerText.trim().includes(keyword) && isVisible(el)) {
        let parent = el.parentElement;
        for (let i = 0; i < 5; i++) {
          if (!parent) break;
          const btn = parent.querySelector('button');
          if (btn && btn.innerText.includes('选课')) return btn;
          parent = parent.parentElement;
        }
      }
    }
    return null;
  }

  function isAlreadySelected() {
    const selectedArea = document.querySelector('[class*="selected"], [class*="chosen"], .side, .sidebar, aside');
    const searchIn = selectedArea || document.body;
    return searchIn.innerText.includes(TARGET_KEYWORD);
  }

  function findSubmitButton() {
    const candidates = document.querySelectorAll('button, .btn, [role="button"], .el-button');
    for (const el of candidates) {
      const t = el.innerText.trim();
      if (t.includes('提交') && !el.disabled) return el;
    }
    return null;
  }

  function isSuccess() {
    const body = document.body.innerText;
    return body.includes('提交成功') || body.includes('选课成功') || body.includes('已提交');
  }

  function isVisible(el) {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }

  function calcRemaining(th, tm, ts) {
    const now = new Date();
    const target = new Date();
    target.setHours(th, tm, ts, 0);
    const diff = Math.max(0, Math.floor((target - now) / 1000));
    const m = Math.floor(diff / 60), s = diff % 60;
    return m + '分' + s + '秒';
  }

  let panel, statusLine;

  function showPanel() {
    panel = document.createElement('div');
    panel.id = '_qk_panel';
    panel.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;width:280px;background:rgba(15,15,20,0.92);color:#e0e0e0;font-size:13px;padding:12px 16px;border-radius:10px;line-height:1.7;font-family:Microsoft YaHei,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);';
    panel.innerHTML = '<div style="font-weight:bold;font-size:14px;margin-bottom:6px;color:#7ecfff">自动抢课</div><div id="_qk_status" style="color:#aaffaa">待命中，等待 19:59:58 刷新</div><div id="_qk_log" style="margin-top:8px;max-height:120px;overflow:hidden;font-size:12px;color:#999"></div><div style="margin-top:8px;font-size:11px;color:#666">开抢：20:00:00 | 刷新：19:59:58</div>';
    document.body.appendChild(panel);
    statusLine = document.getElementById('_qk_status');
    setInterval(() => {
      const r = calcRemaining(REFRESH_HOUR, REFRESH_MIN, REFRESH_SEC);
      if (statusLine) statusLine.textContent = '距刷新还剩 ' + r;
    }, 500);
  }

  function updateStatus(msg) {
    if (statusLine) statusLine.textContent = msg;
  }

  function log(msg) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    console.log('[抢课 ' + time + '] ' + msg);
    if (!panel) showPanel();
    const logDiv = document.getElementById('_qk_log');
    if (logDiv) {
      const line = document.createElement('div');
      line.textContent = '[' + time + '] ' + msg;
      logDiv.appendChild(line);
      while (logDiv.children.length > 10) logDiv.removeChild(logDiv.firstChild);
    }
    if (statusLine && msg.length > 0) statusLine.textContent = msg;
  }

  showPanel();
})();
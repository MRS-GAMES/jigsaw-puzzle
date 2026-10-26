(() => {
  "use strict";
  const status = document.getElementById("offline-status");
  const retry = document.getElementById("offline-retry");
  if (!status || !retry) return;
  let registration, checking = false;
  const show = (message, failed = false) => {status.textContent = message;retry.hidden = !failed;};
  const failure = () => show("オフライン準備ができませんでした。通信を確認して再試行してください。", true);
  function checkReady(worker, type = "CHECK_READY") {
    return new Promise((resolve,reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => {channel.port1.close();reject(new Error("Timeout"));}, type === "REPAIR" ? 15000 : 4000);
      channel.port1.onmessage = e => {clearTimeout(timer);channel.port1.close();resolve(e.data.ready);};
      worker.postMessage({type}, [channel.port2]);
    });
  }
  async function report() {
    if (!registration?.active) return;
    try {
      if (await checkReady(registration.active)) show("オフラインで遊べます");
      else failure();
    } catch { failure(); }
  }
  function watch(worker) {
    if (!worker) return;
    const deadline = setTimeout(() => {if(worker.state !== "activated" && worker.state !== "installed") failure();}, 20000);
    const changed = () => {
      if(["redundant","installed","activated"].includes(worker.state)) clearTimeout(deadline);
      if (worker.state === "redundant") { report(); if(!registration.active) failure(); }
      if (worker.state === "installed" || worker.state === "activated") {
        if (registration.waiting && navigator.serviceWorker.controller) {
          show("更新の準備ができました。ゲームを閉じて開き直すと反映されます。");
        } else if (registration.active) report();
        else if (worker.state === "installed") show("オフライン準備の仕上げ中…");
      }
    };
    worker.addEventListener("statechange", changed);changed();
  }
  async function prepare() {
    if (checking) return;
    checking = true; show("オフライン準備中…");
    const timer = setTimeout(() => {checking = false;failure();}, 20000);
    try {
      if (!("serviceWorker" in navigator)) {show("この環境ではオフライン準備に対応していません。");return;}
      registration = await navigator.serviceWorker.register("./sw.js", {updateViaCache:"none"});
      registration.addEventListener("updatefound", () => watch(registration.installing));
      watch(registration.installing);
      if (registration.waiting) {
        show("更新の準備ができました。ゲームを閉じて開き直すと反映されます。");
      } else if (registration.active) {
        await report();
      }
      if (!registration.installing && !registration.waiting && registration.active) await report();
    } catch { failure(); }
    finally {
      clearTimeout(timer);checking = false;
    }
  }
  retry.addEventListener("click", async () => {
    if(checking) return;
    if (registration?.active) {
      checking = true;show("オフライン準備を再試行中…");
      try {
        if(await checkReady(registration.active,"REPAIR")) {
          show("オフラインで遊べます");return;
        }
        show("準備できませんでした。通信を確認してください。更新がある場合はゲームを閉じて開き直してください。",true);
        registration.update().catch(()=>{});
      } catch { failure(); }
      finally {checking = false;}
      return;
    }
    await prepare();
  });
  prepare();
  // The ad's real height, including safe-area, determines the reserved game area.
  let observer;
  const attach = () => {
    const ad = document.querySelector(".ad-banner");
    if (!ad || observer) return;
    const measure = () => {
      const height = Math.ceil(ad.getBoundingClientRect().height);
      if (height > 0) {
        document.documentElement.style.setProperty("--ad-height", height + "px");
        window.dispatchEvent(new Event("resize"));
      }
    };
    observer = new ResizeObserver(measure);observer.observe(ad);measure();
  };
  const mutation = new MutationObserver(() => {attach();if(observer)mutation.disconnect();});
  mutation.observe(document.body,{childList:true});attach();
})();

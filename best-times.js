(function () {
  "use strict";
  window.JigsawModules = window.JigsawModules || {};
  window.JigsawModules.bestTimes = function (app) {
    function bestTimeKey(level) { return "jigsaw_best_" + level; }
    function readBestTime(level) {
      const value = localStorage.getItem(bestTimeKey(level));
      const seconds = value === null ? NaN : Number(value);
      return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
    }
    function getBestTime(level) {
      try { return readBestTime(level); }
      catch (error) { app.reportStorageReadFailure(); return null; }
    }
    // true: saved, false: no new record, null: storage unavailable.
    function trySaveBestTime(level, seconds) {
      try {
        const current = readBestTime(level);
        if (current !== null && seconds >= current) return false;
        localStorage.setItem(bestTimeKey(level), String(seconds));
        return true;
      } catch (error) { return null; }
    }
    function formatTime(totalSeconds) {
      const m=Math.floor(totalSeconds/60), s=Math.floor(totalSeconds%60), cs=Math.floor((totalSeconds*100)%100);
      return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(cs).padStart(2,"0")}`;
    }
    function renderBestTimes() {
      app.el.bestTimesList.innerHTML="";
      app.LEVEL_ORDER.forEach((lvl)=>{const best=getBestTime(lvl),row=document.createElement("div");row.className="best-time-row";row.innerHTML=`<span class="lvl">${lvl}</span><span class="val">${best!==null?formatTime(best):"--:--"}</span>`;app.el.bestTimesList.appendChild(row);});
    }
    app.bestTimes={getBestTime,trySaveBestTime,formatTime,renderBestTimes};
  };
})();

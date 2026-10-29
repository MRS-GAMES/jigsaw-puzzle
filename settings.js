(function () {
  "use strict";
  window.JigsawModules=window.JigsawModules||{};
  window.JigsawModules.settings=function(app){
    const KEYS={guidePicture:"jigsaw_guide_picture",guideLine:"jigsaw_guide_line",completionImage:"jigsaw_completion_image",hiddenSamples:"jigsaw_hidden_samples",sampleEnabled:"jigsaw_sample_images",backupHidden:"jigsaw_hidden_samples_before_sample_off"};
    const SAMPLE_IDS=app.SAMPLE_IMAGES.map((img)=>img.id);
    const sessionValues = new Map();
    function readValue(key) {
      if (sessionValues.has(key)) return sessionValues.get(key);
      try { return localStorage.getItem(key); }
      catch (error) { app.reportStorageReadFailure(); return null; }
    }
    function writeValues(values) {
      let saved = true;
      Object.entries(values).forEach(([key, value]) => {
        sessionValues.set(key, value);
        try { localStorage.setItem(key, value); } catch (error) { saved = false; }
      });
      if (!saved) alert("設定を保存できませんでした。この画面では反映されますが、画面を閉じると元に戻る可能性があります。");
      return saved;
    }
    function getBoolSetting(key,defaultValue){const v=readValue(key);return v===null?defaultValue:v==="1";}
    function setBoolSetting(key,value){return writeValues({[key]:value?"1":"0"});}
    function getHiddenSamples(){try{const v=JSON.parse(readValue(KEYS.hiddenSamples)||"[]");return Array.isArray(v)?v:[];}catch(e){return[];}}
    function setHiddenSamples(ids){return writeValues({[KEYS.hiddenSamples]:JSON.stringify(ids)});}
    function isSampleVisible(id){return !getHiddenSamples().includes(id);}
    function isSampleEnabled(){return getBoolSetting(KEYS.sampleEnabled,true);}
    function setSampleEnabled(enabled){
      if(enabled===isSampleEnabled())return;
      if(!enabled){
        const hidden=getHiddenSamples();
        return writeValues({[KEYS.backupHidden]:JSON.stringify(hidden),[KEYS.hiddenSamples]:JSON.stringify(Array.from(new Set([...hidden,...SAMPLE_IDS]))),[KEYS.sampleEnabled]:"0"});
      }
      let backup=null;
      try{backup=JSON.parse(readValue(KEYS.backupHidden)||"null");}catch(e){}
      return writeValues({...(Array.isArray(backup)?{[KEYS.hiddenSamples]:JSON.stringify(backup)}:{}),[KEYS.sampleEnabled]:"1"});
    }
    function renderSettings(uploadedCount){
      const gp=getBoolSetting(KEYS.guidePicture,true),gl=getBoolSetting(KEYS.guideLine,true),ci=getBoolSetting(KEYS.completionImage,true);
      app.el.settingGuidePicture.querySelector("strong").textContent=gp?"ON":"OFF";app.el.settingGuideLine.querySelector("strong").textContent=gl?"ON":"OFF";app.el.settingCompletionImage.querySelector("strong").textContent=ci?"ON":"OFF";
      app.el.settingGuidePicture.classList.toggle("off",!gp);app.el.settingGuideLine.classList.toggle("off",!gl);app.el.settingCompletionImage.classList.toggle("off",!ci);
      const toggle=document.getElementById("setting-sample-images");if(toggle){const enabled=isSampleEnabled(),canToggle=uploadedCount>0;toggle.querySelector("strong").textContent=enabled?"ON":"OFF";toggle.classList.toggle("off",!enabled);toggle.classList.toggle("disabled",!canToggle);toggle.disabled=!canToggle;}
    }
    function openSettings(){renderSettings(app.imageManager?app.imageManager.getUploadedCount():0);app.ui.showModal(app.modals.settings);}
    app.settings={keys:KEYS,sampleIds:SAMPLE_IDS,getBoolSetting,setBoolSetting,getHiddenSamples,setHiddenSamples,isSampleVisible,isSampleEnabled,setSampleEnabled,renderSettings,openSettings};
  };
})();

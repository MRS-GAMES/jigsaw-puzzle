(function () {
  "use strict";
  const LEVELS={KIDS:{label:"KIDS",pieces:6,cols:3,rows:2},EASY:{label:"EASY",pieces:12,cols:4,rows:3},NORMAL:{label:"NORMAL",pieces:35,cols:7,rows:5},HARD:{label:"HARD",pieces:96,cols:12,rows:8}};
  const LEVEL_ORDER=["KIDS","EASY","NORMAL","HARD"];
  const SAMPLE_IMAGES=[{id:"sample1",src:"assets/images/sample1.svg",name:"山と湖"},{id:"sample2",src:"assets/images/sample2.svg",name:"ねこ"},{id:"sample3",src:"assets/images/sample3.svg",name:"花畑"},{id:"sample4",src:"assets/images/sample4.svg",name:"街なみ"},{id:"sample5",src:"assets/images/sample5.svg",name:"宇宙"}];
  const state={selectedLevel:"EASY",currentImage:null,selectedPiece:null,startTimestamp:0,elapsedBeforePause:0,timerHandle:null,isPaused:false,isRunning:false};
  const $=id=>document.getElementById(id);
  const screens={title:$("screen-title"),level:$("screen-level"),imageselect:$("screen-imageselect"),game:$("screen-game"),clear:$("screen-clear")};
  const modals={pause:$("modal-pause"),resume:$("modal-resume"),uploadList:$("modal-upload-list"),settings:$("modal-settings"),guidePreview:$("modal-guide-preview")};
  const el={bestTimesList:$("best-times-list"),levelGrid:$("level-grid"),imageSelectGrid:$("image-select-grid"),uploadedGrid:$("uploaded-grid"),uploadedEmpty:$("uploaded-empty"),gameLevelTag:$("game-level-tag"),gameTimer:$("game-timer"),gameCanvas:$("game-canvas"),clearTime:$("clear-time"),clearBestTag:$("clear-best-tag"),fileInput:$("file-input"),guideThumbnail:$("guide-thumbnail"),guideThumbnailImage:$("guide-thumbnail-image"),guidePreviewImage:$("guide-preview-image"),settingGuidePicture:$("setting-guide-picture"),settingGuideLine:$("setting-guide-line"),settingCompletionImage:$("setting-completion-image")};
  const ctx=el.gameCanvas.getContext("2d");
  const app={LEVELS,LEVEL_ORDER,SAMPLE_IMAGES,state,screens,modals,el,ctx};
  let storageReadFailureReported=false;
  app.reportStorageReadFailure=()=>{
    if(storageReadFailureReported)return;
    storageReadFailureReported=true;
    alert("保存データを読み込めませんでした。保存済みのデータは削除していません。読み込めない設定・記録は初期表示で起動します。ブラウザの保存設定を確認して、もう一度開いてください。");
  };
  window.JigsawModules.bestTimes(app);window.JigsawModules.timer(app);window.JigsawModules.ui(app);window.JigsawModules.settings(app);window.JigsawModules.imageManager(app);window.JigsawModules.puzzle(app);
  function renderLevelGrid(){el.levelGrid.innerHTML="";LEVEL_ORDER.forEach(lvl=>{const cfg=LEVELS[lvl],btn=document.createElement("button");btn.className="level-btn"+(lvl===state.selectedLevel?" active":"");btn.innerHTML=`<span class="lvl-name">${cfg.label}</span><span class="lvl-pieces">${cfg.pieces}ピース</span>`;btn.addEventListener("click",()=>{state.selectedLevel=lvl;renderLevelGrid();});el.levelGrid.appendChild(btn);});}
  function startGame(resumeData){app.puzzle.startGame(resumeData);}
  function goToClear(){app.ui.hideModal(modals.pause);app.timer.stopTimer();app.puzzle.stopGameLoop();state.isRunning=false;app.puzzle.clearResumeState();const seconds=app.timer.currentElapsedSeconds(),isNewRecord=app.bestTimes.trySaveBestTime(state.selectedLevel,seconds);el.clearTime.textContent=app.bestTimes.formatTime(seconds);el.clearBestTag.textContent=isNewRecord===null?"記録を保存できませんでした":isNewRecord?"🎉 ベストタイム更新！":"";app.ui.showScreen("clear");}
  app.startGame=startGame;app.goToClear=goToClear;
  function updateCompletionImageVisibility(){el.guideThumbnail.classList.toggle("hidden",!app.settings.getBoolSetting(app.settings.keys.completionImage,true));}
  let openingLevel=false;
  async function openLevelOrResume(){
    if(openingLevel)return;openingLevel=true;
    try{
      let imagesLoaded=true;
      try{await app.imageManager.loadUploadedImagesFromDB();}catch(error){imagesLoaded=false;}
      const resumeData=app.puzzle.getResumeState();
      if(!imagesLoaded){
        if(resumeData&&!SAMPLE_IMAGES.some(image=>image.id===resumeData.imageId)){
          alert("中断したパズルの画像を読み込めませんでした。中断データは残しています。「はじめる」でもう一度お試しください。");return;
        }
        alert("登録画像を読み込めませんでした。サンプル画像で遊べます。登録画像は削除していません。「はじめる」で再試行できます。");
      }
      if(resumeData){
        if(!app.imageManager.getImageById(resumeData.imageId)){
          app.puzzle.clearResumeState();alert("中断したパズルの画像が削除されました。はじめから開始します。");
        }else{app.ui.showModal(modals.resume);return;}
      }
      app.imageManager.guardNoImages();renderLevelGrid();app.ui.showScreen("level");
    }finally{openingLevel=false;}
  }
  $("btn-start").addEventListener("click",openLevelOrResume);
  $("btn-level-back").addEventListener("click",()=>{app.bestTimes.renderBestTimes();app.ui.showScreen("title");});
  $("btn-play-random").addEventListener("click",()=>{app.imageManager.guardNoImages();state.currentImage=app.imageManager.pickRandomImage();if(state.currentImage)startGame();});
  $("btn-play-choose").addEventListener("click",()=>{app.imageManager.guardNoImages();app.imageManager.renderImageSelectGrid();app.ui.showScreen("imageselect");});
  $("btn-imageselect-back").addEventListener("click",()=>app.ui.showScreen("level"));
  let backgrounded=document.hidden, pendingSaveFailure=false;
  function gameIsActive(){return state.isRunning&&!screens.game.classList.contains("hidden");}
  function pauseCurrentGame(){
    if(!gameIsActive())return;
    app.timer.pauseTimer();app.puzzle.pauseGame();
    app.ui.hideModal(modals.guidePreview);app.ui.showModal(modals.pause);
  }
  function pauseForBackground(){
    if(!gameIsActive())return;
    pauseCurrentGame();
    if(!app.puzzle.saveResumeState())pendingSaveFailure=true;
  }
  function reportBackgroundSaveFailure(){
    if(document.hidden||!pendingSaveFailure)return;
    pendingSaveFailure=false;
    alert("中断データを保存できませんでした。この画面では続けられますが、画面を閉じると進み具合が失われる可能性があります。");
  }
  document.addEventListener("visibilitychange",()=>{
    backgrounded=document.hidden;
    if(backgrounded)pauseForBackground();else reportBackgroundSaveFailure();
  });
  window.addEventListener("pagehide",()=>{backgrounded=true;pauseForBackground();});
  window.addEventListener("pageshow",()=>{backgrounded=document.hidden;reportBackgroundSaveFailure();});
  app.onGameReady=()=>{if(backgrounded||document.hidden)pauseForBackground();};
  $("btn-pause").addEventListener("click",pauseCurrentGame);
  $("btn-resume").addEventListener("click",()=>{
    if(!gameIsActive()||document.hidden||backgrounded||!state.isPaused)return;
    app.timer.resumeTimer();app.puzzle.resumeGame();app.ui.hideModal(modals.pause);
  });
  $("btn-pause-title").addEventListener("click",()=>{if(!app.puzzle.saveResumeState()){alert("中断データを保存できませんでした。この画面で続けられます。画面を閉じずに、もう一度お試しください。");return;}app.puzzle.stopGame();app.ui.hideModal(modals.pause);app.bestTimes.renderBestTimes();el.guideThumbnail.classList.add("hidden");app.ui.showScreen("title");});
  $("btn-resume-yes").addEventListener("click",()=>{const resumeData=app.puzzle.getResumeState();app.ui.hideModal(modals.resume);if(!resumeData){renderLevelGrid();app.ui.showScreen("level");return;}const image=app.imageManager.getImageById(resumeData.imageId);if(!image){app.puzzle.clearResumeState();alert("中断したパズルの画像が削除されました。はじめから開始します。");app.imageManager.guardNoImages();renderLevelGrid();app.ui.showScreen("level");return;}state.selectedLevel=resumeData.level;state.currentImage=image;startGame(resumeData);});
  $("btn-resume-no").addEventListener("click",()=>{app.puzzle.clearResumeState();app.ui.hideModal(modals.resume);app.imageManager.guardNoImages();renderLevelGrid();app.ui.showScreen("level");});
  modals.resume.addEventListener("click",e=>{if(e.target===modals.resume)app.ui.hideModal(modals.resume);});
  $("btn-clear-retry").addEventListener("click",()=>{app.puzzle.clearResumeState();state.currentImage=app.imageManager.pickRandomImage();if(state.currentImage)startGame();});
  $("btn-clear-title").addEventListener("click",()=>{app.puzzle.clearResumeState();app.bestTimes.renderBestTimes();el.guideThumbnail.classList.add("hidden");app.ui.showScreen("title");});
  $("btn-open-settings").addEventListener("click",()=>app.settings.openSettings());
  $("btn-settings-close").addEventListener("click",()=>app.ui.hideModal(modals.settings));
  el.settingGuidePicture.addEventListener("click",()=>{const key=app.settings.keys.guidePicture;app.settings.setBoolSetting(key,!app.settings.getBoolSetting(key,true));app.settings.renderSettings(app.imageManager.getUploadedCount());app.puzzle.renderGame();});
  el.settingGuideLine.addEventListener("click",()=>{const key=app.settings.keys.guideLine;app.settings.setBoolSetting(key,!app.settings.getBoolSetting(key,true));app.settings.renderSettings(app.imageManager.getUploadedCount());app.puzzle.renderGame();});
  el.settingCompletionImage.addEventListener("click",()=>{const key=app.settings.keys.completionImage;app.settings.setBoolSetting(key,!app.settings.getBoolSetting(key,true));app.settings.renderSettings(app.imageManager.getUploadedCount());updateCompletionImageVisibility();});
  $("setting-sample-images").addEventListener("click",()=>{const toggle=$("setting-sample-images");if(toggle.disabled)return;app.settings.setSampleEnabled(!app.settings.isSampleEnabled());app.settings.renderSettings(app.imageManager.getUploadedCount());});
  el.guideThumbnail.addEventListener("click",()=>{if(!state.currentImage)return;el.guidePreviewImage.src=state.currentImage.src;app.ui.showModal(modals.guidePreview);});
  $("btn-guide-preview-close").addEventListener("click",()=>app.ui.hideModal(modals.guidePreview));
  $("btn-open-upload").addEventListener("click",()=>el.fileInput.click());
  el.fileInput.addEventListener("change",e=>{const file=e.target.files&&e.target.files[0];app.imageManager.handleFileSelected(file);e.target.value="";});
  $("btn-upload-list").addEventListener("click",()=>{
    app.imageManager.renderUploadedGrid();app.ui.showModal(modals.uploadList);
    app.imageManager.loadUploadedImagesFromDB().catch(()=>alert("登録画像を読み込めませんでした。画像は削除していません。一度閉じて、もう一度開くと再試行できます。"));
  });
  $("btn-uploaded-close").addEventListener("click",()=>app.ui.hideModal(modals.uploadList));
  app.bestTimes.renderBestTimes();app.settings.renderSettings(app.imageManager.getUploadedCount());app.imageManager.loadUploadedImagesFromDB().catch(()=>alert("登録画像を読み込めませんでした。画像と中断データは削除していません。「はじめる」または設定の「登録画像」から再試行できます。"));app.ui.showScreen("title");
  window.JigsawBooted=true;
})();

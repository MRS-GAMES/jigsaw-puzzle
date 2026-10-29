(function () {
  "use strict";
  window.JigsawModules=window.JigsawModules||{};
  window.JigsawModules.imageManager=function(app){
    const DB_NAME="jigsaw_puzzle_db",DB_VERSION=1,DB_STORE="images",UPLOAD_MAX_DIM=800,UPLOAD_JPEG_QUALITY=0.85;
    let dbPromise=null,loadPromise=null,uploadedImages=[];
    function openDB(){
      if(dbPromise)return dbPromise;
      dbPromise=new Promise((resolve,reject)=>{
        let settled=false;
        const timeout=setTimeout(()=>fail(new Error("画像保存先の応答がありません")),10000);
        function fail(error){if(settled)return;settled=true;clearTimeout(timeout);reject(error);}
        try{
          if(!window.indexedDB)throw new Error("このブラウザはIndexedDBに対応していません");
          const req=indexedDB.open(DB_NAME,DB_VERSION);
          req.onupgradeneeded=(e)=>{const db=e.target.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE,{keyPath:"id"});};
          req.onsuccess=()=>{
            const db=req.result;
            if(settled){db.close();return;}
            settled=true;clearTimeout(timeout);
            db.onversionchange=()=>{db.close();dbPromise=null;};
            db.onclose=()=>{dbPromise=null;};
            resolve(db);
          };
          req.onerror=()=>fail(req.error);
          req.onblocked=()=>fail(new Error("ほかの画面が画像保存先を使用しています"));
        }catch(error){fail(error);}
      }).catch(error=>{dbPromise=null;throw error;});
      return dbPromise;
    }
    function imageTransaction(mode,operation){
      return openDB().then(db=>new Promise((resolve,reject)=>{
        let tx,result,settled=false;
        const timeout=setTimeout(()=>{fail(new Error("画像保存先の応答がありません"));try{tx?.abort();}catch(e){}},10000);
        function fail(error){if(settled)return;settled=true;clearTimeout(timeout);reject(error);}
        try{
          tx=db.transaction(DB_STORE,mode);
          tx.oncomplete=()=>{if(settled)return;settled=true;clearTimeout(timeout);resolve(result);};
          tx.onerror=()=>fail(tx.error);
          tx.onabort=()=>fail(tx.error||new Error("画像の保存処理が中断されました"));
          const request=operation(tx.objectStore(DB_STORE));
          request.onsuccess=()=>{result=request.result;};
          request.onerror=()=>fail(request.error);
        }catch(error){dbPromise=null;fail(error);}
      }));
    }
    function dbPutImage(record){return imageTransaction("readwrite",store=>store.put(record));}
    function dbGetAllImages(){return imageTransaction("readonly",store=>store.getAll());}
    function dbDeleteImage(id){return imageTransaction("readwrite",store=>store.delete(id));}
    function getUploadedCount(){return uploadedImages.length;}
    function loadUploadedImagesFromDB(){
      if(loadPromise)return loadPromise;
      loadPromise=dbGetAllImages().then((records)=>{
        records=records||[];records.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
        uploadedImages=records;app.el.uploadedEmpty.textContent="登録した画像はありません";
        renderUploadedGrid();refreshSampleToggle();
      }).catch((error)=>{
        if(!uploadedImages.length)app.el.uploadedEmpty.textContent="画像を読み込めませんでした。一度閉じて、もう一度開くと再試行できます。";
        throw error;
      }).finally(()=>{loadPromise=null;});
      return loadPromise;
    }
    function resizeImageFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error||new Error("ファイルの読み込みに失敗しました"));reader.onload=(e)=>{const img=new Image();img.onerror=()=>reject(new Error("画像として読み込めませんでした"));img.onload=()=>{let w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;if(Math.max(w,h)>UPLOAD_MAX_DIM){const s=UPLOAD_MAX_DIM/Math.max(w,h);w=Math.round(w*s);h=Math.round(h*s);}const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;const cctx=canvas.getContext("2d");cctx.fillStyle="#ffffff";cctx.fillRect(0,0,w,h);cctx.drawImage(img,0,0,w,h);resolve(canvas.toDataURL("image/jpeg",UPLOAD_JPEG_QUALITY));};img.src=e.target.result;};reader.readAsDataURL(file);});}
    function refreshSampleToggle(){app.settings.renderSettings(uploadedImages.length);if(uploadedImages.length===0&&!app.settings.isSampleEnabled()){app.settings.setSampleEnabled(true);alert("使用する画像が無くなったため、サンプル画像を有効にします");app.settings.renderSettings(0);}}
    function renderUploadedGrid(){app.el.uploadedGrid.innerHTML="";if(uploadedImages.length===0){app.el.uploadedEmpty.classList.remove("hidden");return;}app.el.uploadedEmpty.classList.add("hidden");uploadedImages.forEach((img)=>{const cell=document.createElement("div");cell.className="image-thumb";cell.innerHTML=`<img src="${img.src}" alt="${img.name}"><button class="thumb-delete" aria-label="削除">✕</button>`;cell.querySelector(".thumb-delete").addEventListener("click",async(e)=>{
      e.stopPropagation();const button=e.currentTarget;button.disabled=true;
      try{await dbDeleteImage(img.id);uploadedImages=uploadedImages.filter((u)=>u.id!==img.id);renderUploadedGrid();refreshSampleToggle();}
      catch(error){alert("画像を削除できませんでした。画像は残っています。もう一度お試しください。");}
      finally{button.disabled=false;}
    });app.el.uploadedGrid.appendChild(cell);});}
    async function handleFileSelected(file){
      if(!file)return;
      if(!file.type||file.type.indexOf("image/")!==0){alert("画像ファイルを選んでください");return;}
      let dataUrl;
      try{dataUrl=await resizeImageFile(file);}catch(error){alert("画像の読み込みに失敗しました");return;}
      try{
        // Confirm existing images before adding, so a failed read never replaces the list.
        await loadUploadedImagesFromDB();
        const record={id:"upload_"+Date.now()+"_"+Math.floor(Math.random()*1e6),src:dataUrl,name:"マイ画像"+(uploadedImages.length+1),createdAt:Date.now()};
        await dbPutImage(record);
        uploadedImages.push(record);renderUploadedGrid();refreshSampleToggle();
      }catch(error){alert("画像を保存できませんでした。画像は追加されていません。空き容量やブラウザの保存設定を確認して、もう一度お試しください。");}
    }
    function getImagePool(){const samples=app.SAMPLE_IMAGES.filter((img)=>app.settings.isSampleEnabled()&&app.settings.isSampleVisible(img.id));return[...samples,...uploadedImages];}
    function getImageById(id){return app.SAMPLE_IMAGES.find((img)=>img.id===id)||uploadedImages.find((img)=>img.id===id)||null;}
    function pickRandomImage(){const pool=getImagePool();return pool.length?pool[Math.floor(Math.random()*pool.length)]:null;}
    function renderImageSelectGrid(){app.el.imageSelectGrid.innerHTML="";getImagePool().forEach((img)=>{const cell=document.createElement("div");cell.className="image-thumb";cell.innerHTML=`<img src="${img.src}" alt="${img.name}"><div class="thumb-label">${img.name}</div>`;cell.addEventListener("click",()=>{app.state.currentImage=img;app.startGame();});app.el.imageSelectGrid.appendChild(cell);});}
    function guardNoImages(){if(getImagePool().length===0){app.settings.setSampleEnabled(true);app.settings.renderSettings(getUploadedCount());}}
    app.imageManager={getUploadedCount,loadUploadedImagesFromDB,handleFileSelected,renderUploadedGrid,getImagePool,getImageById,pickRandomImage,renderImageSelectGrid,guardNoImages,refreshSampleToggle};
  };
})();

/* ===== Helpers ===== */
const VIDEO_EXT=/\.(mp4|webm|ogv|mov|mkv|avi|m4v|mpeg|mpg)$/i;
const AUDIO_EXT=/\.(mp3|wav|flac|m4a|aac|opus|wma|oga|ogg)$/i;

function uid(prefix){return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`}
function baseName(p){const s=String(p||'');const parts=s.split(/[\\/]/);return parts[parts.length-1]||s}
function nameNoExt(n){return String(n||'').replace(/\.[^.]+$/,'')}
function kindFromName(n){return AUDIO_EXT.test(String(n||''))?'audio':'video'}
function isMediaName(n){return VIDEO_EXT.test(String(n||''))||AUDIO_EXT.test(String(n||''))}
function isLocalMkvPath(p){return typeof p==='string'&&/\.mkv$/i.test(p)&&!/^(blob:|https?:|file:|data:)/i.test(p)}
function formatTime(s){if(isNaN(s)||!isFinite(s))return'00:00';const m=Math.floor(s/60),ss=Math.floor(s%60);return`${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`}
function delay(ms){return new Promise(r=>setTimeout(r,ms))}
function clampNum(v,min,max,def){const n=Number(v);if(!isFinite(n))return def;return Math.max(min,Math.min(max,Math.round(n)))}

/* Turn a plain path into a media URL the renderer is allowed to load. */
function toMediaSrc(src){
    const s=String(src||'').trim();
    if(!s)return '';
    if(/^(blob:|https?:|file:|data:)/i.test(s))return s;
    let p=s.replace(/\\/g,'/');
    if(/^[a-zA-Z]:\//.test(p))p='/'+p;
    const parts=p.split('/');
    return 'file://'+parts.map((seg,i)=>{
        if(i===0&&seg==='')return '';
        if(i===1&&/^[a-zA-Z]:$/.test(seg))return seg;
        return encodeURIComponent(seg);
    }).join('/');
}

/* ===== Data ===== */
const CANVAS_PRESETS={colorbars:'彩色测试图',static:'雪花信号'};

function onlineSample(name,file){
    return{
        id:uid('it'),name,
        src:`https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/${file}`,
        kind:'video'
    };
}

function buildDefaultChannels(){
    return[
        {id:'ch-test',name:'彩色测试图',type:'canvas',preset:'colorbars',items:[]},
        {id:'ch-snow',name:'雪花信号',type:'canvas',preset:'static',items:[]},
        {id:'ch-bunny',name:'大雄兔',type:'playlist',items:[onlineSample('BigBuckBunny.mp4','BigBuckBunny.mp4')]},
        {id:'ch-dream',name:'梦境之间',type:'playlist',items:[onlineSample('ElephantsDream.mp4','ElephantsDream.mp4')]},
        {id:'ch-blaze',name:'烈焰追踪',type:'playlist',items:[onlineSample('ForBiggerBlazes.mp4','ForBiggerBlazes.mp4')]}
    ];
}
let channels=buildDefaultChannels();

const effects=[
    {name:'正常',filter:'',scanlines:false,rgb:false,flicker:false},
    {name:'黑白',filter:'grayscale(1)',scanlines:false,rgb:false,flicker:false},
    {name:'CRT黑白',filter:'grayscale(1) contrast(1.25) brightness(1.1)',scanlines:true,rgb:false,flicker:true},
    {name:'CRT彩色',filter:'contrast(1.18) saturate(1.35) brightness(1.05)',scanlines:true,rgb:true,flicker:true},
    {name:'复古胶片',filter:'sepia(0.55) contrast(1.1) brightness(0.88) saturate(0.75)',scanlines:false,rgb:false,flicker:false},
    {name:'赛博朋克',filter:'contrast(1.4) saturate(1.6) brightness(1.1) hue-rotate(15deg)',scanlines:true,rgb:true,flicker:true}
];

const brands=[
    {name:'默认',fullName:'RETRO TV',filter:''},
    {name:'SONY',fullName:'SONY TRINITRON',filter:'contrast(1.15) saturate(1.2) brightness(1.06)'},
    {name:'飞利浦',fullName:'PHILIPS',filter:'contrast(1.08) brightness(1.1) hue-rotate(-10deg)'},
    {name:'松下',fullName:'Panasonic',filter:'contrast(1.06) saturate(1.08)'},
    {name:'三星',fullName:'SAMSUNG',filter:'contrast(1.28) saturate(1.4) brightness(1.08)'},
    {name:'夏普',fullName:'SHARP AQUOS',filter:'contrast(1.2) saturate(0.88) brightness(1.14) hue-rotate(6deg)'},
    {name:'三洋',fullName:'SANYO',filter:'saturate(0.78) brightness(0.9) sepia(0.2)'}
];

const aspectRatios=[
    {name:'4:3',  w:4,  h:3,  label:'经典 4:3'},
    {name:'16:9', w:16, h:9,  label:'宽屏 16:9'},
    {name:'21:9', w:21, h:9,  label:'超宽 21:9'},
    {name:'1:1',  w:1,  h:1,  label:'方形 1:1'},
    {name:'3:4',  w:3,  h:4,  label:'竖屏 3:4'},
    {name:'9:16', w:9,  h:16, label:'竖屏 9:16'},
    {name:'AUTO', w:0,  h:0,  label:'自动检测'}
];

const state={power:false,channel:0,volume:50,effect:0,brand:0,arIndex:0,switching:false,paused:false,isFullscreen:false};

/* ===== DOM ===== */
const $=id=>document.getElementById(id);
const screen=$('screen'),screenContent=$('screenContent');
const video=$('video'),testCanvas=$('testCanvas'),staticCanvas=$('staticCanvas');
const testCtx=testCanvas.getContext('2d'),staticCtx=staticCanvas.getContext('2d');
const scanlines=$('scanlines'),rgbOverlay=$('rgbOverlay');
const channelDisplay=$('channelDisplay'),volumeDisplay=$('volumeDisplay');
const fileNameDisplay=$('fileNameDisplay'),arOSD=$('arOSD');
const volBar=$('volBar'),volValue=$('volValue');
const powerBtn=$('powerBtn'),led=$('led');
const pinBtn=$('pinBtn'),minBtn=$('minBtn'),closeBtn=$('closeBtn');
const chKnob=$('chKnob'),volKnob=$('volKnob');
const effectDisplay=$('effectDisplay'),brandDisplay=$('brandDisplay'),arDisplay=$('arDisplay');
const brandNameplate=$('brandNameplate');
const fileInput=$('fileInput'),fileSlot=$('fileSlot');
const dropOverlay=$('dropOverlay');
const progressContainer=$('progressContainer'),progressFill=$('progressFill');
const progressTrack=$('progressTrack'),progressTime=$('progressTime');
const fsOverlayBtn=$('fsOverlayBtn'),fsCtrlBtn=$('fsCtrlBtn');
const exitHint=$('exitHint');
const loadingOverlay=$('loadingOverlay'),offGlow=$('offGlow');

let chDispTimer,volDispTimer,fileDispTimer,arDispTimer,animFrameId,progressTimer,progressHideTimer,exitHintTimer;
let audioCtx=null,localObjectURLs=[];
const desktop=window.tvAPI||null;

/* ===== Audio ===== */
function getAudioCtx(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();return audioCtx}
function playPowerSound(){try{const c=getAudioCtx(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=15700;o.type='sine';g.gain.setValueAtTime(0.06,c.currentTime);g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+0.9);o.start();o.stop(c.currentTime+0.9)}catch(e){}}
function playStaticSound(d=0.2){try{const c=getAudioCtx(),l=c.sampleRate*d,b=c.createBuffer(1,l,c.sampleRate),da=b.getChannelData(0);for(let i=0;i<l;i++)da[i]=Math.random()*2-1;const s=c.createBufferSource(),g=c.createGain();s.buffer=b;s.connect(g);g.connect(c.destination);g.gain.setValueAtTime(0.1,c.currentTime);g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+d);s.start()}catch(e){}}
function playClickSound(){try{const c=getAudioCtx(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=900;o.type='square';g.gain.setValueAtTime(0.04,c.currentTime);g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+0.06);o.start();o.stop(c.currentTime+0.06)}catch(e){}}
function playInsertSound(){try{const c=getAudioCtx(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type='sine';o.frequency.setValueAtTime(600,c.currentTime);o.frequency.linearRampToValueAtTime(1200,c.currentTime+0.15);g.gain.setValueAtTime(0.05,c.currentTime);g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+0.25);o.start();o.stop(c.currentTime+0.25)}catch(e){}}

/* ===== Canvas ===== */
function drawColorBars(ctx,w,h){
    const colors=['#bfbfbf','#bfbf00','#00bfbf','#00bf00','#bf00bf','#bf0000','#0000bf'];
    const bw=w/7,topH=h*0.67;
    colors.forEach((c,i)=>{ctx.fillStyle=c;ctx.fillRect(i*bw,0,bw,topH)});
    for(let i=0;i<7;i++){const v=Math.round(i*255/6);ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(i*bw,topH,bw,h*0.08)}
    const py=topH+h*0.08,ph=h-py;
    ['#1a1a1a','#000','#bf0000','#00bf00','#0000bf','#1a1a1a','#333','#000'].forEach((c,i)=>{ctx.fillStyle=c;ctx.fillRect(i*bw,py,bw,ph)});
    ctx.strokeStyle='rgba(255,255,255,0.7)';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(w/2,h*0.42,Math.min(w,h)*0.18,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(w/2,h*0.42-20);ctx.lineTo(w/2,h*0.42+20);ctx.stroke();
    ctx.beginPath();ctx.moveTo(w/2-20,h*0.42);ctx.lineTo(w/2+20,h*0.42);ctx.stroke();
    ctx.fillStyle='#fff';ctx.textAlign='center';
    ctx.font='bold 22px "Press Start 2P",monospace';ctx.fillText('RETRO TV',w/2,h*0.42-30);
    ctx.font='12px "Press Start 2P",monospace';ctx.fillText('TEST PATTERN',w/2,h*0.42+48);
    ctx.font='10px "Press Start 2P",monospace';ctx.fillStyle='#aaa';ctx.fillText(new Date().toLocaleTimeString(),w/2,h*0.42+68);
}
function drawStatic(ctx,w,h){
    const id=ctx.createImageData(w,h),d=id.data;
    for(let i=0;i<d.length;i+=4){const v=Math.random()*255|0;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255}
    ctx.putImageData(id,0,0);
}
function drawAudioScreen(ctx,w,h){
    ctx.fillStyle='#050505';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(0,255,65,0.14)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,h*0.5);ctx.lineTo(w,h*0.5);ctx.stroke();
    const bars=56,bw=w/bars,t=performance.now()/1000;
    const active=!video.paused&&!video.ended;
    for(let i=0;i<bars;i++){
        const wave=Math.abs(Math.sin(t*1.9+i*0.33))*Math.abs(Math.sin(t*0.7+i*0.11));
        const base=active?0.12+0.88*wave:0.04;
        const bh=Math.max(2,base*h*0.4);
        const grad=ctx.createLinearGradient(0,h*0.5-bh/2,0,h*0.5+bh/2);
        grad.addColorStop(0,'#00ff41');grad.addColorStop(0.55,'#00bb33');grad.addColorStop(1,'#00551a');
        ctx.fillStyle=grad;
        ctx.fillRect(i*bw+bw*0.18,h*0.5-bh/2,bw*0.64,bh);
    }
    ctx.fillStyle='#00cc33';ctx.textAlign='center';
    ctx.font='9px "Press Start 2P",monospace';ctx.fillText('AUDIO',w/2,34);
    ctx.font='14px "ZCOOL QingKe HuangYou",sans-serif';ctx.fillStyle='#8a8a8a';
    const label=currentItem?currentItem.name:'';
    ctx.fillText(label.length>34?label.slice(0,31)+'...':label,w/2,h-34);
}

/* ===== Display ===== */
function showChannelInfo(t){channelDisplay.textContent=t;channelDisplay.classList.add('show');clearTimeout(chDispTimer);chDispTimer=setTimeout(()=>channelDisplay.classList.remove('show'),2500)}
function showFileName(n){fileNameDisplay.textContent=n;fileNameDisplay.classList.add('show');clearTimeout(fileDispTimer);fileDispTimer=setTimeout(()=>fileNameDisplay.classList.remove('show'),5000)}
function hideFileName(){clearTimeout(fileDispTimer);fileNameDisplay.classList.remove('show')}
function showVolumeInfo(){volBar.style.width=state.volume+'%';volValue.textContent=state.volume;volumeDisplay.classList.add('show');clearTimeout(volDispTimer);volDispTimer=setTimeout(()=>volumeDisplay.classList.remove('show'),1800)}
function showARInfo(label){arOSD.textContent='ASPECT '+label;arOSD.classList.add('show');clearTimeout(arDispTimer);arDispTimer=setTimeout(()=>arOSD.classList.remove('show'),2200)}
function showExitHint(){exitHint.classList.add('show');clearTimeout(exitHintTimer);exitHintTimer=setTimeout(()=>exitHint.classList.remove('show'),2500)}

/* ===== Aspect Ratio ===== */
function getScreenMaxWidth(){
    // TV body 920px - padding 18*2=36 - bezel padding 12*2=24 = 860
    return 860;
}

function applyAspectRatio(){
    const ar=aspectRatios[state.arIndex];
    let ratio;
    if(ar.w===0){
        ratio=(video.videoWidth&&video.videoHeight)?video.videoWidth/video.videoHeight:4/3;
    }else{
        ratio=ar.w/ar.h;
    }
    const maxW=getScreenMaxWidth();
    const maxH=Math.min(680,window.innerHeight*0.72);
    let w=maxW;
    let h=w/ratio;
    if(h>maxH){h=maxH;w=h*ratio}
    screen.style.width=Math.round(w)+'px';
    screen.style.height=Math.round(h)+'px';
}

function cycleAspectRatio(dir){
    state.arIndex=(state.arIndex+dir+aspectRatios.length)%aspectRatios.length;
    const ar=aspectRatios[state.arIndex];
    arDisplay.textContent=ar.name;
    applyAspectRatio();
    showARInfo(ar.label);
    playClickSound();
    scheduleSave();
}

video.addEventListener('loadedmetadata',()=>{
    if(aspectRatios[state.arIndex].w===0) applyAspectRatio();
});

window.addEventListener('resize',()=>{if(!state.isFullscreen)applyAspectRatio()});

/* ===== Progress ===== */
function updateProgress(){
    if(!video.duration)return;
    progressFill.style.width=(video.currentTime/video.duration)*100+'%';
    progressTime.textContent=formatTime(video.currentTime)+' / '+formatTime(video.duration);
}
function scheduleProgressHide(){
    clearTimeout(progressHideTimer);
    progressHideTimer=setTimeout(()=>progressContainer.classList.remove('show'),3000);
}
function startProgressTracking(){
    stopProgressTracking();progressContainer.classList.add('show');
    updateProgress();
    progressTimer=setInterval(updateProgress,200);
    scheduleProgressHide();
}
function stopProgressTracking(){
    clearInterval(progressTimer);progressTimer=null;
    clearTimeout(progressHideTimer);
    progressContainer.classList.remove('show');
}
progressTrack.addEventListener('click',e=>{if(!video.duration)return;const r=progressTrack.getBoundingClientRect();video.currentTime=((e.clientX-r.left)/r.width)*video.duration});
screen.addEventListener('mousemove',()=>{
    if(state.power&&currentItem&&currentItem.kind!=='audio'){
        progressContainer.classList.add('show');
        scheduleProgressHide();
    }
});

/* ===== Filters ===== */
function applyFilters(){
    const ef=effects[state.effect].filter,bf=brands[state.brand].filter;
    let c='';if(ef&&bf)c=ef+' '+bf;else c=ef||bf;
    video.style.filter=c;testCanvas.style.filter=c;staticCanvas.style.filter=c;
    scanlines.classList.toggle('active',effects[state.effect].scanlines);
    rgbOverlay.classList.toggle('active',effects[state.effect].rgb);
    screen.classList.toggle('flickering',effects[state.effect].flicker);
}

/* ===== Playback ===== */
let currentItem=null,playStart=0,playEnd=0;
let advanceTimer=null;
let failedItems=new Set();
let staticFallback=false;
let ignoreVideoError=false;
let playToken=0;
let playFromStart=false;
let pendingMediaNotice='';

function itemKey(item){return String((item&&item.src)||'')}
function clearPlaybackTimers(){clearTimeout(advanceTimer);advanceTimer=null}
function showLoading(text){loadingOverlay.textContent=text||'LOADING...';loadingOverlay.classList.add('show')}
function hideLoading(){loadingOverlay.classList.remove('show')}

function showContent(type){
    video.style.display='none';testCanvas.classList.remove('active');staticCanvas.classList.remove('active');
    if(type==='video')video.style.display='block';
    else if(type==='audio')testCanvas.classList.add('active');
    else if(type==='test')testCanvas.classList.add('active');
    else if(type==='static')staticCanvas.classList.add('active');
}

function stopPlayback(){
    playToken++;
    clearPlaybackTimers();
    hideLoading();
    ignoreVideoError=true;
    try{video.pause()}catch(e){}
    try{video.removeAttribute('src');video.load()}catch(e){}
    currentItem=null;playStart=0;playEnd=0;
    stopProgressTracking();
}

function availableItems(ch){
    return ((ch&&ch.items)||[]).filter(it=>it&&it.src&&!failedItems.has(itemKey(it)));
}

/* Pick a random start and a random end inside the media duration. */
function randomSegment(duration){
    if(!isFinite(duration)||duration<=0)return{start:0,end:0};
    if(duration<=4)return{start:0,end:duration};
    const minLen=Math.min(10,Math.max(2.5,duration*0.3));
    const latestStart=Math.max(0,duration-minLen);
    const start=Math.random()*latestStart;
    const end=start+minLen+Math.random()*Math.max(0,duration-start-minLen);
    return{start:Math.round(start*10)/10,end:Math.round(Math.min(end,duration)*10)/10};
}

async function playItem(item,opts){
    const token=++playToken;
    ignoreVideoError=false;
    currentItem=item;
    state.paused=false;
    pendingMediaNotice='';
    const isAudio=item.kind==='audio';
    showContent(isAudio?'audio':'video');
    video.volume=state.volume/100;

    // MKV files often carry AC3/DTS audio, which Chromium cannot decode.
    // Ask the main process to remux the audio to AAC when needed.
    let src=item.src;
    if(!isAudio&&isLocalMkvPath(src)&&desktop&&desktop.prepareMedia){
        showLoading('AUDIO SYNC...');
        try{
            const res=await desktop.prepareMedia(src);
            if(token!==playToken)return;
            if(res&&res.path)src=res.path;
            if(res&&res.message){pendingMediaNotice=res.message;showFileName('⚠ '+res.message)}
        }catch(e){console.warn('Prepare media failed:',e)}
        if(token!==playToken)return;
        hideLoading();
    }

    playFromStart=!!(opts&&opts.fromStart);
    video.src=toMediaSrc(src);
    video.load();
    video.play().catch(()=>{});
    startProgressTracking();
}

/* Entering a channel keeps the original strategy: random item + random segment. */
function startPlaylist(ch){
    const prev=currentItem;
    stopPlayback();
    staticFallback=false;
    const items=availableItems(ch);
    if(!items.length){
        staticFallback=true;
        showContent('static');
        showFileName('该频道暂无内容');
        return;
    }
    let item=items[Math.floor(Math.random()*items.length)];
    // Do not replay the exact same entry twice in a row when there is a choice.
    if(prev&&items.length>1&&itemKey(item)===itemKey(prev)){
        item=items[(items.indexOf(item)+1)%items.length];
    }
    playItem(item,{fromStart:false});
}

/* Inside a channel entries play in list order, looping, each from its start. */
function advancePlaylist(ch){
    if(!ch||ch.type!=='playlist')return;
    const all=(ch.items||[]).filter(it=>it&&it.src);
    if(!all.length){
        stopPlayback();
        staticFallback=true;
        showContent('static');
        showFileName('该频道暂无内容');
        return;
    }
    const cur=currentItem;
    let base=-1;
    if(cur)base=all.findIndex(it=>it.id===cur.id||itemKey(it)===itemKey(cur));
    let next=null;
    for(let step=1;step<=all.length;step++){
        const idx=((base+step)%all.length+all.length)%all.length;
        const it=all[idx];
        if(it&&!failedItems.has(itemKey(it))){next=it;break}
    }
    if(!next){
        stopPlayback();
        staticFallback=true;
        showContent('static');
        showFileName('该频道暂无内容');
        return;
    }
    staticFallback=false;
    playItem(next,{fromStart:true});
}

function activateChannel(){
    const ch=channels[state.channel];
    failedItems.clear();
    staticFallback=false;
    stopPlayback();
    if(!ch){showContent('none');return}
    if(ch.type==='playlist'){startPlaylist(ch);return}
    // Canvas channels have no media item, so drop the previous channel's label.
    hideFileName();
    if(ch.preset==='static'){showContent('static');return}
    showContent('test');
    drawColorBars(testCtx,960,720);
}

function scheduleNextItem(){
    if(advanceTimer)return;
    const ch=channels[state.channel];
    if(!ch||ch.type!=='playlist')return;
    advanceTimer=setTimeout(()=>{
        advanceTimer=null;
        if(!state.power)return;
        const cur=channels[state.channel];
        if(cur&&cur.type==='playlist')advancePlaylist(cur);
    },300);
}

video.addEventListener('loadedmetadata',()=>{
    const item=currentItem;
    if(!item)return;
    if(aspectRatios[state.arIndex].w===0)applyAspectRatio();
    const dur=video.duration;
    if(playFromStart){
        playStart=0;
        playEnd=0;
    }else{
        const seg=randomSegment(dur);
        playStart=seg.start;
        playEnd=seg.end;
        if(playStart>0){try{video.currentTime=playStart}catch(e){}}
    }
    const endLabel=playEnd>0?formatTime(playEnd):formatTime(dur);
    const kind=item.kind==='audio'?'♪':'▶';
    const notice=pendingMediaNotice?'  ⚠ '+pendingMediaNotice:'';
    showFileName(`${kind} ${item.name}  ${formatTime(playStart)}-${endLabel}${notice}`);
    updateProgress();
});

video.addEventListener('timeupdate',()=>{
    if(!state.power||!currentItem)return;
    if(playEnd>0&&video.currentTime>=playEnd-0.06)scheduleNextItem();
});

video.addEventListener('ended',()=>{
    if(state.power&&currentItem)scheduleNextItem();
});

video.addEventListener('error',()=>{
    if(ignoreVideoError||!state.power)return;
    const item=currentItem;
    if(!item)return;
    const ch=channels[state.channel];
    if(!ch||ch.type!=='playlist')return;
    failedItems.add(itemKey(item));
    showFileName(`✖ 无法播放：${item.name}`);
    const remaining=availableItems(ch);
    if(!remaining.length){
        stopPlayback();
        staticFallback=true;
        showContent('static');
        return;
    }
    scheduleNextItem();
});

/* ===== Knobs ===== */
function updateKnobs(){
    chKnob.style.transform=`rotate(${-135+(state.channel/(channels.length-1||1))*270}deg)`;
    volKnob.style.transform=`rotate(${-135+(state.volume/100)*270}deg)`;
}

/* ===== Fullscreen ===== */
function isBrowserFs(){return !!(document.fullscreenElement||document.webkitFullscreenElement)}
function enterBrowserFs(){(screen.requestFullscreen||screen.webkitRequestFullscreen).call(screen)}
function exitBrowserFs(){if(isBrowserFs())(document.exitFullscreen||document.webkitExitFullscreen).call(document)}
async function toggleFs(){
    if(desktop&&desktop.setFullscreen){
        try{await desktop.setFullscreen();return}catch(e){console.warn('Fullscreen failed:',e)}
    }
    isBrowserFs()?exitBrowserFs():enterBrowserFs();
}
async function exitFs(){
    if(desktop&&desktop.setFullscreen){
        try{await desktop.setFullscreen(false);return}catch(e){console.warn('Exit fullscreen failed:',e)}
    }
    exitBrowserFs();
}

function updateFullscreenUI(fs){
    state.isFullscreen=!!fs;
    screen.classList.toggle('is-fullscreen',state.isFullscreen);
    fsCtrlBtn.textContent=state.isFullscreen?'✖':'⛶';
    fsOverlayBtn.classList.toggle('exit-fs',state.isFullscreen);
    if(state.isFullscreen)showExitHint();
    else applyAspectRatio();
}
function initFullscreen(){
    if(desktop&&desktop.onFullscreenChange){
        desktop.onFullscreenChange(fs=>updateFullscreenUI(fs));
        if(desktop.isFullscreen)desktop.isFullscreen().then(fs=>updateFullscreenUI(fs)).catch(()=>{});
    }else{
        document.addEventListener('fullscreenchange',()=>updateFullscreenUI(isBrowserFs()));
        document.addEventListener('webkitfullscreenchange',()=>updateFullscreenUI(isBrowserFs()));
    }
}
fsOverlayBtn.addEventListener('click',e=>{e.stopPropagation();toggleFs()});
fsCtrlBtn.addEventListener('click',toggleFs);

/* ===== Mini Window Controls ===== */
function updatePinUI(pinned){
    pinBtn.classList.toggle('active',pinned);
    const label=pinned?'取消窗口置顶':'窗口置顶';
    pinBtn.title=label;pinBtn.setAttribute('aria-label',label);
}
pinBtn.addEventListener('click',async()=>{
    if(!desktop||!desktop.toggleAlwaysOnTop)return;
    try{updatePinUI(await desktop.toggleAlwaysOnTop())}catch(e){console.warn('Pin failed:',e)}
});
minBtn.addEventListener('click',()=>{if(desktop&&desktop.minimize)desktop.minimize()});
closeBtn.addEventListener('click',()=>{flushSave(true);if(desktop&&desktop.close)desktop.close()});
function initWindowControls(){
    if(desktop&&desktop.isAlwaysOnTop)desktop.isAlwaysOnTop().then(updatePinUI).catch(()=>{});
}

let lastClickTime=0;
screen.addEventListener('click',e=>{
    if(e.target.closest('.fs-overlay-btn,.file-slot,.progress-container,.drop-overlay'))return;
    const now=Date.now();
    if(now-lastClickTime<350){toggleFs();lastClickTime=0}
    else lastClickTime=now;
});

/* ===== Power ===== */
let shutdownTimer=null;

/* CRT power-off: the picture collapses into a bright line, then a glowing dot. */
function playShutdownGlow(){
    if(!offGlow)return;
    clearTimeout(shutdownTimer);
    offGlow.classList.remove('animate');
    void offGlow.offsetWidth;
    offGlow.classList.add('animate');
    shutdownTimer=setTimeout(()=>{offGlow.classList.remove('animate');shutdownTimer=null},900);
}

function resetShutdownGlow(){
    clearTimeout(shutdownTimer);shutdownTimer=null;
    if(offGlow)offGlow.classList.remove('animate');
}

async function togglePower(){
    state.power=!state.power;playPowerSound();
    if(state.power){
        resetShutdownGlow();
        screen.classList.remove('powering-down');
        powerBtn.classList.add('on');led.classList.add('on');
        screenContent.classList.remove('powering-off');screenContent.classList.add('powering-on');
        await delay(900);screenContent.classList.remove('powering-on');
        activateChannel();
        const ch=channels[state.channel];
        if(ch)showChannelInfo(`CH ${String(state.channel+1).padStart(2,'0')}  ${ch.name}`);
    }else{
        powerBtn.classList.remove('on');led.classList.remove('on');
        screen.classList.add('powering-down');
        screenContent.classList.remove('powering-on');screenContent.classList.add('powering-off');
        playShutdownGlow();
        stopPlayback();staticFallback=false;
        await delay(850);screenContent.classList.remove('powering-off');
        resetShutdownGlow();
        showContent('none');
    }
}

/* ===== Channel ===== */
async function switchChannel(n){
    if(state.switching||!state.power||!channels.length)return;
    if(n<0)n=channels.length-1;if(n>=channels.length)n=0;if(n===state.channel)return;
    state.switching=true;playClickSound();
    drawStatic(staticCtx,960,720);
    staticCanvas.classList.add('active');playStaticSound(0.22);
    showChannelInfo(`CH ${String(n+1).padStart(2,'0')}  ${channels[n].name}`);
    await delay(220);state.channel=n;updateKnobs();activateChannel();scheduleSave();
    // activateChannel() decides what the new channel shows; a static/noise channel
    // keeps the canvas active, so do not hide it here.
    await delay(80);state.switching=false;
}

/* ===== Volume ===== */
function adjustVolume(v){
    state.volume=Math.max(0,Math.min(100,v));
    video.volume=state.volume/100;
    updateKnobs();showVolumeInfo();playClickSound();scheduleSave();
}

/* ===== Effect / Brand ===== */
function cycleEffect(d){state.effect=(state.effect+d+effects.length)%effects.length;effectDisplay.textContent=effects[state.effect].name;applyFilters();playClickSound();scheduleSave()}
function cycleBrand(d){state.brand=(state.brand+d+brands.length)%brands.length;brandDisplay.textContent=brands[state.brand].name;brandNameplate.textContent=brands[state.brand].fullName;applyFilters();playClickSound();scheduleSave()}

/* ===== Media picking ===== */
function filesToItems(files){
    const items=[];
    Array.from(files||[]).forEach(f=>{
        const name=f.name||'';
        const mimeOk=typeof f.type==='string'&&(f.type.startsWith('video/')||f.type.startsWith('audio/'));
        if(!isMediaName(name)&&!mimeOk)return;
        let p='';
        if(desktop&&desktop.getPathForFile){try{p=desktop.getPathForFile(f)}catch(e){}}
        if(p){
            items.push({id:uid('it'),name,src:p,kind:kindFromName(name)});
        }else{
            const u=URL.createObjectURL(f);
            localObjectURLs.push(u);
            items.push({id:uid('it'),name,src:u,kind:kindFromName(name),transient:true});
        }
    });
    return items;
}

function addPathsAsChannel(paths){
    const items=(paths||[]).filter(p=>p&&isMediaName(p)).map(p=>({id:uid('it'),name:baseName(p),src:p,kind:kindFromName(p)}));
    if(!items.length)return;
    appendPlaylistChannel(items);
}

function appendPlaylistChannel(items){
    if(!items.length)return;
    const nameBase=items.length===1?nameNoExt(items[0].name):`本地列表 ${channels.length+1}`;
    const ch={id:uid('ch'),name:nameBase.slice(0,24),type:'playlist',items};
    channels.push(ch);
    failedItems.clear();
    state.channel=channels.length-1;
    updateKnobs();
    if(state.power)activateChannel();
    showChannelInfo(`CH ${String(state.channel+1).padStart(2,'0')}  ${ch.name}`);
    playInsertSound();
    scheduleSave();
}

async function openMediaPicker(){
    if(desktop&&desktop.pickMedia){
        try{
            const paths=await desktop.pickMedia();
            if(paths&&paths.length)addPathsAsChannel(paths);
            return;
        }catch(e){console.warn('Pick media failed:',e)}
    }
    fileInput.click();
}

fileSlot.addEventListener('click',e=>{e.stopPropagation();openMediaPicker()});
fileInput.addEventListener('change',e=>{
    const files=Array.from(e.target.files||[]);
    e.target.value='';
    if(!files.length)return;
    const items=filesToItems(files);
    if(!items.length)return;
    if(modalOpen){
        const ch=selectedDraft();
        if(ch&&ch.type==='playlist'){
            ch.items=(ch.items||[]).concat(items);
            renderPlaylist();
        }
        return;
    }
    appendPlaylistChannel(items);
});

/* ===== Drag & Drop ===== */
let dragCounter=0;
screen.addEventListener('dragenter',e=>{e.preventDefault();e.stopPropagation();dragCounter++;if(state.power)dropOverlay.classList.add('show')});
screen.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation()});
screen.addEventListener('dragleave',e=>{e.preventDefault();e.stopPropagation();dragCounter--;if(dragCounter<=0){dragCounter=0;dropOverlay.classList.remove('show')}});
screen.addEventListener('drop',e=>{
    e.preventDefault();e.stopPropagation();dragCounter=0;dropOverlay.classList.remove('show');
    const items=filesToItems(e.dataTransfer.files);
    if(items.length)appendPlaylistChannel(items);
});
/* Stop Electron from navigating to files dropped outside the screen */
window.addEventListener('dragenter',e=>{e.preventDefault()});
window.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation()});
window.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation()});

/* ===== Render Loop ===== */
function renderLoop(){
    if(state.power){
        if(state.switching)drawStatic(staticCtx,960,720);
        const ch=channels[state.channel];
        if(staticFallback)drawStatic(staticCtx,960,720);
        else if(ch){
            if(ch.type==='canvas'&&ch.preset==='static')drawStatic(staticCtx,960,720);
            else if(ch.type==='playlist'&&currentItem&&currentItem.kind==='audio')drawAudioScreen(testCtx,960,720);
        }
    }
    animFrameId=requestAnimationFrame(renderLoop);
}

/* ===== Persistence ===== */
function cloneChannels(list){
    return (list||[]).map(c=>({
        id:c.id,name:c.name,type:c.type,preset:c.preset,
        items:(c.items||[]).map(it=>({id:it.id,name:it.name,src:it.src,kind:it.kind,transient:it.transient}))
    }));
}

function sanitizeStoredChannels(list){
    if(!Array.isArray(list))return null;
    const out=[],seen=new Set();
    list.forEach((c,i)=>{
        if(!c||typeof c!=='object')return;
        let id=String(c.id||'').trim()||uid('ch');
        if(seen.has(id))id=uid('ch');
        seen.add(id);
        const name=(String(c.name||'').trim()||`频道 ${i+1}`).slice(0,24);
        if(c.type==='canvas'){
            out.push({id,name,type:'canvas',preset:c.preset==='static'?'static':'colorbars',items:[]});
            return;
        }
        const items=(Array.isArray(c.items)?c.items:[])
            .filter(it=>it&&typeof it.src==='string'&&it.src&&!it.src.startsWith('blob:'))
            .map(it=>({
                id:String(it.id||uid('it')),
                name:String(it.name||baseName(it.src)).slice(0,80),
                src:it.src,
                kind:it.kind==='audio'?'audio':kindFromName(it.name||it.src)
            }));
        out.push({id,name,type:'playlist',items});
    });
    return out.length?out:null;
}

function persistedChannels(){return sanitizeStoredChannels(channels)||[]}

function buildStoreData(){
    const ch=channels[state.channel]||channels[0]||null;
    return{
        version:1,
        channels:persistedChannels(),
        settings:{
            volume:state.volume,
            effect:state.effect,
            brand:state.brand,
            aspect:state.arIndex,
            lastChannelId:ch?ch.id:null
        }
    };
}

let saveTimer=null;
function scheduleSave(){
    if(!desktop||!desktop.saveStore)return;
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>{saveTimer=null;flushSave()},300);
}
function flushSave(sync){
    clearTimeout(saveTimer);saveTimer=null;
    if(!desktop)return;
    if(sync&&desktop.saveStoreSync){
        try{desktop.saveStoreSync(buildStoreData())}catch(e){console.warn('Save failed:',e)}
        return;
    }
    if(!desktop.saveStore)return;
    try{
        const p=desktop.saveStore(buildStoreData());
        if(p&&p.catch)p.catch(err=>console.warn('Save failed:',err));
    }catch(e){console.warn('Save failed:',e)}
}
window.addEventListener('beforeunload',()=>flushSave(true));

function syncSettingUI(){
    effectDisplay.textContent=effects[state.effect].name;
    brandDisplay.textContent=brands[state.brand].name;
    brandNameplate.textContent=brands[state.brand].fullName;
    arDisplay.textContent=aspectRatios[state.arIndex].name;
    volBar.style.width=state.volume+'%';
    volValue.textContent=state.volume;
}

function applyStoredData(data){
    if(!data||typeof data!=='object')return;
    const chs=sanitizeStoredChannels(data.channels);
    if(chs&&chs.length)channels=chs;
    const s=data.settings||{};
    state.volume=clampNum(s.volume,0,100,state.volume);
    state.effect=clampNum(s.effect,0,effects.length-1,0);
    state.brand=clampNum(s.brand,0,brands.length-1,0);
    state.arIndex=clampNum(s.aspect,0,aspectRatios.length-1,0);
    const idx=s.lastChannelId?channels.findIndex(c=>c.id===s.lastChannelId):-1;
    state.channel=idx>=0?idx:0;
}

/* ===== Settings Modal ===== */
let modalOpen=false,draftChannels=null,draftSelectedId=null;
let openCurrentId=null,openCurrentSignature=null;
let modalRefs=null;

function channelSignature(ch){
    if(!ch)return '';
    return JSON.stringify({
        type:ch.type,
        preset:ch.preset,
        items:(ch.items||[]).map(it=>[it.name,it.src,it.kind])
    });
}

function selectedDraft(){
    if(!draftChannels)return null;
    return draftChannels.find(c=>c.id===draftSelectedId)||null;
}

function initSettingsModal(){
    modalRefs={
        modal:$('settingsModal'),
        list:$('channelList'),
        pane:$('channelEditPane'),
        name:$('channelNameInput'),
        typeCanvas:$('typeCanvasBtn'),
        typePlaylist:$('typePlaylistBtn'),
        presetRow:$('presetRow'),
        preset:$('presetSelect'),
        playlistSection:$('playlistSection'),
        playlist:$('playlistItems'),
        empty:$('playlistEmpty')
    };
    $('settingsBtn').addEventListener('click',openSettings);
    $('settingsClose').addEventListener('click',closeSettings);
    $('settingsCancel').addEventListener('click',closeSettings);
    $('settingsSave').addEventListener('click',commitSettings);
    $('addChannelBtn').addEventListener('click',addDraftChannel);
    $('addMediaBtn').addEventListener('click',addDraftMedia);
    modalRefs.modal.addEventListener('click',e=>{if(e.target===modalRefs.modal)closeSettings()});
    modalRefs.list.addEventListener('click',onChannelListClick);
    modalRefs.playlist.addEventListener('click',onPlaylistClick);
    modalRefs.name.addEventListener('input',()=>{
        const ch=selectedDraft();if(!ch)return;
        ch.name=modalRefs.name.value;
        syncListNames();
    });
    modalRefs.preset.addEventListener('change',()=>{
        const ch=selectedDraft();if(!ch)return;
        ch.preset=modalRefs.preset.value;
    });
    modalRefs.typeCanvas.addEventListener('click',()=>setDraftType('canvas'));
    modalRefs.typePlaylist.addEventListener('click',()=>setDraftType('playlist'));
}

function openSettings(){
    draftChannels=cloneChannels(channels);
    if(!draftChannels.length)draftChannels=[{id:uid('ch'),name:'频道 1',type:'playlist',items:[]}];
    const cur=channels[state.channel];
    draftSelectedId=(cur&&draftChannels.some(c=>c.id===cur.id))?cur.id:draftChannels[0].id;
    openCurrentId=cur?cur.id:null;
    openCurrentSignature=channelSignature(cur);
    renderChannelList();
    renderEditor();
    modalRefs.modal.classList.remove('hidden');
    modalOpen=true;
}

function closeSettings(){
    modalOpen=false;
    draftChannels=null;
    draftSelectedId=null;
    if(modalRefs)modalRefs.modal.classList.add('hidden');
}

function renderChannelList(){
    const list=modalRefs.list;
    list.innerHTML='';
    draftChannels.forEach((ch,i)=>{
        const li=document.createElement('li');
        li.className='channel-item'+(ch.id===draftSelectedId?' active':'');
        li.dataset.id=ch.id;

        const num=document.createElement('span');
        num.className='ch-num';num.textContent=String(i+1).padStart(2,'0');

        const name=document.createElement('span');
        name.className='ch-name';name.textContent=ch.name||'未命名';

        const tag=document.createElement('span');
        tag.className='ch-tag';tag.textContent=ch.type==='canvas'?'画布':'列表';

        const del=document.createElement('button');
        del.className='ch-del';del.textContent='✕';
        del.title='删除频道';del.dataset.action='delete';
        del.disabled=draftChannels.length<=1;

        li.append(num,name,tag,del);
        list.append(li);
    });
}

function syncListNames(){
    const ch=selectedDraft();
    if(!ch)return;
    const li=modalRefs.list.querySelector(`.channel-item[data-id="${ch.id}"]`);
    const el=li&&li.querySelector('.ch-name');
    if(el)el.textContent=ch.name||'未命名';
}

function renderEditor(){
    const ch=selectedDraft();
    if(!ch){
        modalRefs.pane.classList.add('hidden');
        return;
    }
    modalRefs.pane.classList.remove('hidden');
    modalRefs.name.value=ch.name||'';
    modalRefs.typeCanvas.classList.toggle('active',ch.type==='canvas');
    modalRefs.typePlaylist.classList.toggle('active',ch.type==='playlist');
    modalRefs.presetRow.classList.toggle('hidden',ch.type!=='canvas');
    modalRefs.playlistSection.classList.toggle('hidden',ch.type!=='playlist');
    modalRefs.preset.value=ch.preset==='static'?'static':'colorbars';
    renderPlaylist();
}

function renderPlaylist(){
    const ch=selectedDraft();
    const list=modalRefs.playlist;
    list.innerHTML='';
    const items=(ch&&ch.type==='playlist')?(ch.items||[]):[];
    items.forEach(it=>{
        const li=document.createElement('li');
        li.className='playlist-item';
        li.dataset.id=it.id||'';

        const kind=document.createElement('span');
        kind.className='kind';kind.textContent=it.kind==='audio'?'音乐':'视频';

        const name=document.createElement('span');
        name.className='p-name';
        name.textContent=it.name||baseName(it.src||'');
        name.title=it.src||'';

        const del=document.createElement('button');
        del.className='p-del';del.textContent='✕';
        del.title='从列表移除';del.dataset.action='remove-item';

        li.append(kind,name,del);
        list.append(li);
    });
    modalRefs.empty.classList.toggle('hidden',items.length>0);
}

function onChannelListClick(e){
    const li=e.target.closest('.channel-item');
    if(!li)return;
    if(e.target.dataset.action==='delete'){
        deleteDraftChannel(li.dataset.id);
        return;
    }
    draftSelectedId=li.dataset.id;
    renderChannelList();
    renderEditor();
}

function deleteDraftChannel(id){
    if(draftChannels.length<=1)return;
    draftChannels=draftChannels.filter(c=>c.id!==id);
    if(draftSelectedId===id)draftSelectedId=draftChannels[0].id;
    renderChannelList();
    renderEditor();
}

function addDraftChannel(){
    const ch={id:uid('ch'),name:`频道 ${draftChannels.length+1}`,type:'playlist',items:[]};
    draftChannels.push(ch);
    draftSelectedId=ch.id;
    renderChannelList();
    renderEditor();
    modalRefs.name.focus();
    modalRefs.name.select();
}

function setDraftType(type){
    const ch=selectedDraft();
    if(!ch)return;
    ch.type=type;
    if(type==='canvas'&&!ch.preset)ch.preset='colorbars';
    renderChannelList();
    renderEditor();
}

function onPlaylistClick(e){
    const btn=e.target.closest('[data-action="remove-item"]');
    if(!btn)return;
    const li=btn.closest('.playlist-item');
    const ch=selectedDraft();
    if(!ch||!li)return;
    ch.items=(ch.items||[]).filter(it=>it.id!==li.dataset.id);
    renderPlaylist();
}

async function addDraftMedia(){
    const ch=selectedDraft();
    if(!ch||ch.type!=='playlist')return;
    let paths=[];
    if(desktop&&desktop.pickMedia){
        try{paths=await desktop.pickMedia()}catch(e){console.warn('Pick media failed:',e)}
    }
    if(!paths||!paths.length){
        if(!desktop||!desktop.pickMedia)fileInput.click();
        return;
    }
    paths.forEach(p=>{
        ch.items=ch.items||[];
        ch.items.push({id:uid('it'),name:baseName(p),src:p,kind:kindFromName(p)});
    });
    renderPlaylist();
    playInsertSound();
}

function commitSettings(){
    const cleaned=sanitizeStoredChannels(draftChannels);
    if(!cleaned||!cleaned.length)return;
    const prevId=channels[state.channel]?channels[state.channel].id:null;
    channels=cleaned;
    let idx=channels.findIndex(c=>c.id===prevId);
    if(idx<0)idx=0;
    state.channel=idx;
    failedItems.clear();
    staticFallback=false;
    updateKnobs();
    const current=channels[state.channel];
    const needsRestart=state.power&&(current.id!==openCurrentId||channelSignature(current)!==openCurrentSignature);
    if(needsRestart)activateChannel();
    else if(state.power)showChannelInfo(`CH ${String(state.channel+1).padStart(2,'0')}  ${current.name}`);
    scheduleSave();
    flushSave();
    closeSettings();
}

/* ===== Controls ===== */
powerBtn.addEventListener('click',togglePower);
$('chUp').addEventListener('click',()=>switchChannel(state.channel+1));
$('chDown').addEventListener('click',()=>switchChannel(state.channel-1));
$('volUp').addEventListener('click',()=>adjustVolume(state.volume+5));
$('volDown').addEventListener('click',()=>adjustVolume(state.volume-5));
$('effectPrev').addEventListener('click',()=>cycleEffect(-1));
$('effectNext').addEventListener('click',()=>cycleEffect(1));
$('brandPrev').addEventListener('click',()=>cycleBrand(-1));
$('brandNext').addEventListener('click',()=>cycleBrand(1));
$('arPrev').addEventListener('click',()=>cycleAspectRatio(-1));
$('arNext').addEventListener('click',()=>cycleAspectRatio(1));
chKnob.addEventListener('wheel',e=>{e.preventDefault();switchChannel(state.channel+(e.deltaY<0?-1:1))});
volKnob.addEventListener('wheel',e=>{e.preventDefault();adjustVolume(state.volume+(e.deltaY<0?5:-5))});

/* ===== Keyboard ===== */
document.addEventListener('keydown',e=>{
    if(modalOpen){
        if(e.key==='Escape'){e.preventDefault();closeSettings()}
        return;
    }
    const target=e.target;
    if(target&&(target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.tagName==='SELECT'))return;
    const k=e.key.toLowerCase();
    if(k==='p')togglePower();
    else if(k==='arrowup'){e.preventDefault();switchChannel(state.channel-1)}
    else if(k==='arrowdown'){e.preventDefault();switchChannel(state.channel+1)}
    else if(k==='arrowleft'){e.preventDefault();adjustVolume(state.volume-5)}
    else if(k==='arrowright'){e.preventDefault();adjustVolume(state.volume+5)}
    else if(k==='e')cycleEffect(1);
    else if(k==='b')cycleBrand(1);
    else if(k==='a')cycleAspectRatio(1);
    else if(k==='escape'){if(state.isFullscreen){e.preventDefault();exitFs()}}
    else if(k==='f'){e.preventDefault();toggleFs()}
    else if(k==='o'){e.preventDefault();openMediaPicker()}
    else if(k==='s'){e.preventDefault();openSettings()}
    else if(k===' '){e.preventDefault();if(state.power&&currentItem){state.paused=!state.paused;state.paused?video.pause():video.play().catch(()=>{})}}
    else if(k>='1'&&k<='9'){const n=parseInt(k)-1;if(n<channels.length)switchChannel(n)}
});

/* ===== Init ===== */
async function init(){
    if(desktop&&desktop.loadStore){
        try{applyStoredData(await desktop.loadStore())}catch(e){console.warn('Load store failed:',e)}
    }
    syncSettingUI();
    showContent('none');
    updateKnobs();
    applyFilters();
    applyAspectRatio();
    initFullscreen();
    initWindowControls();
    initSettingsModal();
    drawColorBars(testCtx,960,720);
    drawStatic(staticCtx,960,720);
    renderLoop();
}
init();

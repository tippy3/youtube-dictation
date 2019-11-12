window.onload = ()=>{
  const SUPERAGENT = window.superagent;
  const YOUTUBE_CC_API = 'https://video.google.com/timedtext';
  const LANG = "en";
  const TIME_BUFFER = 0.15;
  let video = null;
  let video_id = null;
  let ccs = []; // CClist
  let cc_index = 0;
  let clicked = false;
  let started = false;
  let timeout_id = null;

  let html = document.createElement("div");
  html.id = "yt-typing-container";
  html.innerHTML = '<p id="yt-typing-text">YouTube Typing</p><p id="yt-typing-credit">Click to start (or Esc to hide)</p>';
  html.addEventListener('click', clickEvent);
  document.body.appendChild(html);

  function updateCC(text){
    document.getElementById("yt-typing-text").innerHTML = text;
    // XSS対策が必要
  }

  function getVideoID(){
    if( location.pathname != "/watch" ){
      return null;
    }
    const tmp = location.search.match('v=[a-zA-Z0-9-=_]{11}');
    if( tmp == null ){
      return null;
    }else{
      return tmp[0].replace("v=","");
    }
  }

  function clickEvent(){
    // 連続してクリックしても反応しないようにする
    if(clicked){
      return false;
    }else{
      clicked = true;
    }
    video_id = getVideoID();
    if( video_id == null ){
      // 動画視聴ページでない場合
      updateCC("This page has no video");
      setTimeout(()=>{
        updateCC("YouTube Typing");
        clicked = false;
      },3000);
    }else{
      console.log(video_id);
      requestCCList();
    }
  }

  function requestCCList(){
    updateCC("Loading...");
    SUPERAGENT
    .get(YOUTUBE_CC_API)
    .accept('json')
    .query({
      type: 'list',
      v: video_id
    })
    .end(responseCCList);
  }

  function responseCCList(err, res){
    if (err) {
      updateCC("Error: Something is wrong");
      throw new Error(err);
    }
    let cc_track = null;
    if (res.text && res.type === 'text/xml' && res.xhr && res.xhr.responseXML) {
      const tracks = res.xhr.responseXML.querySelectorAll('track');
      // console.log(tracks);
      for (let i = 0, l = tracks.length; i < l; i++) {
        const tmp = tracks[i];
        const tmp_lang = tmp.getAttribute('lang_code');
        if (tmp_lang === LANG) {
          // console.log('langが一致', tmp);
          cc_track = tmp.getAttribute('name');
          break;
        }
      }
      if (cc_track != null) {
        requestCC(cc_track);
      } else {
        updateCC("This video has no CC in English");
        throw new Error("This video has no CC in English");
      }
    }
  }

  function requestCC(target_track){
    SUPERAGENT
    .get(YOUTUBE_CC_API)
    .accept('json')
    .query({
        lang: LANG,
        name: target_track,
        v: video_id
    })
    .end(responseCC);
  }

  function responseCC(err, res){
    if (err) {
      updateCC("Error: Something is wrong");
      throw new Error(err);
    }
    let parser = new DOMParser();
    const body = parser.parseFromString(res.text, 'text/xml');
    const cc_xml = Array.from(body.getElementsByTagName('text')); // 問題数上限
    Array.prototype.forEach.call(cc_xml, (tmp,i) => {
      ccs.push({
        start: Number(tmp.getAttribute('start')),
        dur: Number(tmp.getAttribute('dur')),
        content: tmp.textContent,
        words: tmp.textContent.split(' ')
      });
    });
    console.log(ccs);
    startGame();
  }

  function words2blank(){
    //wordsの一部をinputタグに変換する処理
  }

  function startGame(){
    started = true;
    video = document.getElementsByTagName("video")[0];
    // videoがないときのエラー処理
    const tmp = document.getElementById("yt-typing-credit");
    tmp.innerHTML = "Click here to reload";
    tmp.addEventListener('click', adjustCCindex);

    // updateCC("the <input id='yt-typing-input' type='text' size='8' autofocus></input> story is about connecting the dots.");
    adjustCCindex();
  }

  function adjustCCindex(){
    cc_index = 0;
    while(true){
      if ( video.currentTime < ccs[cc_index+1].start - TIME_BUFFER || cc_index >= ccs.length-2){
        break;
      }
      cc_index++;
    }
    console.log(`adjusted_cc: ${cc_index}`);
    playVideoWithCC();
  }

  function playVideoWithCC(){
    console.log(`current_cc: ${cc_index}`);
    if( video_id != getVideoID() ){
      // 動画ページから離脱していたら終了
      endGame();
      return false;
    }
    if( video.currentTime > ccs[cc_index+1].start - TIME_BUFFER ){
      // CCが動画より遅れていたらcc_indexを修正
      adjustCCindex();
      return false;
    }
    video.play();
    clearTimeout(timeout_id);
    timeout_id = setTimeout(()=>{
      video.pause();
    }, ( ccs[cc_index+1].start - TIME_BUFFER - video.currentTime )*1000 );
    updateCC(ccs[cc_index].content);
  }

  function endGame(){
    started = false;
    clearTimeout(timeout_id);
    document.body.removeChild( document.getElementById("yt-typing-container") );
    console.log("See you again!");
  }

  document.onkeydown = (event)=>{
    if (event.key === 'Enter') {
      if(started){
        console.log("enter");
        // 答え合わせが必要
        cc_index++;
        playVideoWithCC();
      }
    }else if (event.keyCode === 27) {
      // Escキーの処理
      endGame();
    }
  }

}
window.onload = ()=>{
  const SUPERAGENT = window.superagent;
  const YOUTUBE_CC_API = 'https://video.google.com/timedtext';
  const LANG = "en";
  const TIME_BUFFER = 0.15;
  let video = null;
  let video_id = null;
  let ccs = []; // CClist
  let cc_index = 0;
  let score_flag = [];
  let score = 0;
  let clicked = false;
  let started = false;
  let timeout_id = null;
  let input_errored = false;

  let html = document.createElement("div");
  html.id = "yt-typing-container";
  html.innerHTML = '<p id="yt-typing-text">YouTube Typing</p><p id="yt-typing-credit">Click to start (or Esc to hide)</p><div id="yt-typing-close">x</div>';
  html.addEventListener('click', clickEvent);
  document.body.appendChild(html);
  document.getElementById("yt-typing-close").addEventListener('click', endGame);

  function updateCC(text){
    // textはエスケープ済みです
    document.getElementById("yt-typing-text").innerHTML = text;
  }

  function removeSymbol(text){
    return text.replace(/,/g,'').replace(/\./g,'').replace(/\?/g,'')
    .replace(/:/g,'').replace(/;/g,'').replace(/-/g,'').toLowerCase();
  }

  function getVideoIDorDeny(){
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
    video_id = getVideoIDorDeny();
    if( video_id == null ){
      // 動画視聴ページでない場合
      updateCC("This page has no video");
      setTimeout(()=>{
        updateCC("YouTube Typing");
        clicked = false;
      },3000);
    }else{
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
    const cc_xml = Array.from(body.getElementsByTagName('text')); // .slice(0,20); // 問題数上限はなし
    cc_xml.forEach((tmp)=>{
      ccs.push({
        start: Number(tmp.getAttribute('start')),
        dur: Number(tmp.getAttribute('dur')),
        words: tmp.textContent.replace(/&quot;/g,'').replace(/&amp;/g,'').replace(/&lt;/g,'').replace(/&gt;/g,'').split(' ')
      });
      // textContentでXSS対策済
    });
    words2input();
    console.log(ccs);
    console.log(ccs.length);
    console.log(score_flag.length);
    startGame();
  }

  function words2input(){
    //wordsの一部をinputタグに変換する処理
    ccs.forEach((tmp)=>{
      const rnd = Math.floor( Math.random()*(tmp.words.length-2) )+1; // 最初と最後の単語は除外
      tmp.answer = removeSymbol(tmp.words[rnd]); // 正解を保存
      tmp.words[rnd] = `<input id="yt-typing-input" type="text" size="${tmp.answer.length}" autofocus>`;
      score_flag.push(false);
    });
  }

  function startGame(){
    started = true;
    video = document.getElementsByTagName("video")[0];
    // videoがないときのエラー処理

    const tmp = document.getElementById("yt-typing-credit");
    tmp.innerHTML = "Click here to reload cc";
    tmp.addEventListener('click', adjustCCindex);
    let html = document.createElement("div");
    html.id = "yt-typing-score";
    html.innerHTML = "score: 0";
    document.getElementById("yt-typing-container").appendChild(html);
    adjustCCindex();
  }

  function adjustCCindex(){
    input_errored = false;
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
    if( video_id != getVideoIDorDeny() ){
      // 動画ページから離脱していたら終了
      endGame();
      return false;
    }
    if( cc_index <= ccs.length-2 && video.currentTime > ccs[cc_index+1].start - TIME_BUFFER ){
      // CCが動画より遅れていたらcc_indexを修正
      adjustCCindex();
      return false;
    }
    if ( cc_index >= ccs.length-1 ){
      finishGame();
      return false;
    }
    video.play();
    clearTimeout(timeout_id);
    timeout_id = setTimeout(()=>{
      video.pause();
    }, ( ccs[cc_index+1].start - TIME_BUFFER - video.currentTime )*1000 );
    updateCC( ccs[cc_index].words.join(" ") );
    document.getElementById("yt-typing-input").focus();
  }

  function finishGame(){
    console.log("finish!");
    updateCC( `Finish! Your score is ${score} of ${ccs.length}` );
    document.getElementById("yt-typing-text").classList.add("yt-typing-text-red");
    const tmp = document.getElementById("yt-typing-credit");
    tmp.innerHTML = "Reload this page to play again";
    tmp.removeEventListener('click', adjustCCindex);
  }

  function endGame(){
    clicked = true;
    started = false;
    clearTimeout(timeout_id);
    document.body.removeChild( document.getElementById("yt-typing-container") );
    console.log("See you again!");
    return false;
  }

  document.onkeydown = (event)=>{
    if (event.key === 'Enter') {
      if(started){
        // 答え合わせ
        const input_box = document.getElementById("yt-typing-input");
        const user_answer = removeSymbol(input_box.value);
        if( user_answer == ccs[cc_index].answer || input_errored ){
          if( !input_errored && !score_flag[cc_index] ){
            score_flag[cc_index] = true;
            score++;
            document.getElementById("yt-typing-score").textContent = `score: ${score}`;
          }
          input_errored = false;
          cc_index++;
          playVideoWithCC();
        }else{
          input_errored = true;
          input_box.value = "";
          input_box.placeholder = ccs[cc_index].answer;
          input_box.classList.add("yt-typing-input-error");
        }
      }
    }else if (event.keyCode === 27) {
      // Escキーの処理
      endGame();
    }
  }

}
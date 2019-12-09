// MIT License
// Copyright (c) tippy3 and motonari728
// https://github.com/tippy3/youtube-dictation


window.onload = ()=>{
  const SUPERAGENT = window.superagent;
  const LEMMATIZER = new Lemmatizer();
  const YOUTUBE_CC_API = 'https://video.google.com/timedtext';
  const LANG = "en";
  const TIME_BUFFER = 0.1;
  const USER_SVL_LEVEL = 5;
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
  html.id = "yt-dictation-container";
  html.innerHTML = '<p id="yt-dictation-text">YouTube-Dictation</p><p id="yt-dictation-credit">Click to start (or Esc to hide)</p><div id="yt-dictation-close">x</div>';
  html.addEventListener('click', clickEvent);
  document.body.appendChild(html);
  document.getElementById("yt-dictation-close").addEventListener('click', endGame);

  function updateCC(text){
    // textはエスケープ済みです
    document.getElementById("yt-dictation-text").innerHTML = text;
  }

  function removeSymbol(text){
    return text.replace(/,/g,'').replace(/\./g,'').replace(/-/g,'').replace(/\?/g,'')
    .replace(/:/g,'').replace(/;/g,'').replace(/\[/g,'').replace(/\]/g,'').toLowerCase();
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
        updateCC("YouTube-Dictation");
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
      }
    }
  }

  function requestCC(target_track){
    updateCC("Loading......");
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
      }); // textContentでXSS対策済
      score_flag.push(false);
    });
    createQuiz();
    // console.log(ccs);
    startGame();
  }

  function createQuiz(){
    updateCC("Loading.........");
    ccs.forEach((cc,num)=>{
      let candidates = []; // 問題にする単語の候補(単語のインデックス番号が入る)
      let min_diff = 99;
      // console.log( "#" + num + "  " + cc.words.join(" ") + " (" +  cc.words.length + ")" );
      // 3単語以上で問題を出題する
      if(cc.words.length >= 3){
        cc.words.forEach((word,index)=>{
          if( index == 0 || index==cc.words.length-1 ){
            // 最初と最後の単語は除外
            return false;
          }
          const original_word = removeSymbol(word);
          let result = kanten_dictionary[original_word]; // まずは英単語を辞書で検索
          if(result && result.svl_level){
            // 辞書にヒットした場合
            console.log("ヒット: " + result.svl_level + " : " + word);
          }else{
            // 辞書にヒットしなかった場合
            const lemma = LEMMATIZER.lemmas( original_word ); // 英単語を原型に戻す
            if(lemma.length==0){
              console.log("原型に戻せず: " + word);
              return false;
            }else{
              result = lemma[0][0];
            }
            result = kanten_dictionary[result];
            if(!result || !result.svl_level){
              // 原型でも辞書にヒットしなかった場合
              console.log("原型でもヒットせず: " + word);
              return false
            }else{
              console.log("原型でヒット: " + result.svl_level + " : " + word);
            }
          }

          // 単語のレベルとユーザーのレベルの差を求める
          const diff = Math.abs( result.svl_level - USER_SVL_LEVEL );
          if( diff<min_diff || min_diff==99 ){
            // よりレベルの近い単語が見つかった場合、その単語を候補にする
            min_diff = diff;
            candidates = [];
            candidates.push(index);
          }else if( diff==min_diff ){
            // レベルの差が同じ単語が見つかった場合、その単語を候補に入れる
            candidates.push(index);
          }
        });
      }

      if(candidates.length==0){
        // 問題候補がゼロの場合
        cc.words.push('<span id="yt-dictation-pressenter"> (press enter)</span>');
        return false;
      }else{
        // 候補から１つ選び問題を作成
        const final_result = _.shuffle(candidates)[0];
        // console.log(candidates.join(",") + " -> " + final_result );
        cc.answer = removeSymbol(cc.words[final_result]);
        cc.words[final_result] = `<input id="yt-dictation-input" type="text" size="${cc.answer.length}" autofocus>`;
        // cc.kanten = kanten_dictionary[]; //TODO 和訳を入れる
      }
    });
  }

  function startGame(){
    started = true;
    video = document.getElementsByTagName("video")[0];
    const tmp = document.getElementById("yt-dictation-credit");
    tmp.innerHTML = "Click here to reload cc";
    tmp.addEventListener('click', adjustCCindex);
    let html = document.createElement("div");
    html.id = "yt-dictation-score";
    html.innerHTML = "score: 0";
    document.getElementById("yt-dictation-container").appendChild(html);
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
    // console.log(`adjusted_cc: ${cc_index}`);
    playVideoWithCC();
  }

  function playVideoWithCC(){
    // console.log(`current_cc: ${cc_index}`);
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
    const input_box = document.getElementById("yt-dictation-input");
    if(input_box){
      input_box.focus();
    }
  }

  function finishGame(){
    // console.log("finish!");
    updateCC( `Finish! Your score is ${score} of ${ccs.length}` );
    document.getElementById("yt-dictation-text").classList.add("yt-dictation-text-red");
    const tmp = document.getElementById("yt-dictation-credit");
    tmp.innerHTML = "Reload this page to play again";
    tmp.removeEventListener('click', adjustCCindex);
  }

  function endGame(){
    clicked = true;
    started = false;
    clearTimeout(timeout_id);
    document.body.removeChild( document.getElementById("yt-dictation-container") );
    // console.log("See you again!");
    return false;
  }

  document.onkeydown = (event)=>{
    if (event.key === 'Enter') {
      if(started){
        // 答え合わせ
        const input_box = document.getElementById("yt-dictation-input");
        if( !input_box || input_errored || removeSymbol(input_box.value) == ccs[cc_index].answer ){
          if( !input_box || (!input_errored && !score_flag[cc_index]) ){
            score_flag[cc_index] = true;
            score++;
            document.getElementById("yt-dictation-score").textContent = `score: ${score}`;
          }
          input_errored = false;
          cc_index++;
          playVideoWithCC();
        }else{
          input_errored = true;
          input_box.value = "";
          input_box.placeholder = ccs[cc_index].answer;
          input_box.classList.add("yt-dictation-input-error");
        }
      }
    }else if (event.keyCode === 27) {
      // Escキーの処理
      endGame();
    }
  }

}
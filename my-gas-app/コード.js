// ==============================================================================
// ▼▼▼ 1. 共通設定・ルーティング (ページ切り替え) ▼▼▼
// ==============================================================================

function doGet(e) {
  // URLパラメータ ?page=xxx を取得。なければ 'pc' をデフォルトにする
  let page = e.parameter.page || 'pc';
  let template;
  let title = '会社ポータル';
 
  // ページごとのHTMLファイル指定
  switch(page) {
    case 'skills':
      template = HtmlService.createTemplateFromFile('skills');
      title = 'Member & Skills (タレント名鑑)';
      break;
    case 'books':
      template = HtmlService.createTemplateFromFile('books');
      title = '社内図書管理';
      break;
    case 'incident':
      template = HtmlService.createTemplateFromFile('incident');
      title = 'クレーム＆ヒヤリハット';
      break;
    case 'events':
      template = HtmlService.createTemplateFromFile('events');
      title = 'イベント開催履歴';
      break;
    case 'pc':
    default:
      template = HtmlService.createTemplateFromFile('index'); // PC管理 (index.html)
      title = 'PC機材貸し出し管理';
      break;
  }
 
  return template.evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL) // Googleサイト埋め込み許可
    .setTitle(title);
 }
 
 
 // ==============================================================================
 // ▼▼▼ 2. シート定義・初期化 (メニューから実行) ▼▼▼
 // ==============================================================================
 
 function onOpen() {
  SpreadsheetApp.getUi().createMenu('ポータル管理')
    .addItem('全機能のシート・列定義を初期化', 'initAllSheets')
    .addToUi();
 }
 
 // これを実行すると、必要なシートとヘッダーが一括で作成されます
 function initAllSheets() {
  const definitions = [
    { name: 'PC管理', headers: ['機材名', '所持者', '貸出日', '備考'] },
    // スキル管理は項目が多いので注意
    { name: 'スキル管理', headers: ['氏名', '部署・役職', '得意スキル', '勉強中・興味', 'ステータス', 'SlackID', '画像URL', '自己紹介', 'MBTI'] },
    { name: '図書管理', headers: ['書籍名', '種類', '保管場所/URL', '所持者/状態', '画像URL', 'ISBN', 'レビュー', 'いいね数', '登録者'] },
    { name: 'リクエスト本', headers: ['書籍名', '購入リンク', '申請者', 'いいね数', 'ステータス', '理由', '画像URL', 'ISBN'] },
    { name: 'ヒヤリハット', headers: ['発生日', '種別', '件名', '事実', '原因', '対策', 'ステータス', '改善効果(Before/After)', '報告者'] },
    { name: 'イベント履歴', headers: ['開催日', 'イベント名', '場所', '参加人数', 'アルバムURL', 'サムネイルURL', '関連資料URL', '参加メンバー'] }
   ];
 
  const ss = SpreadsheetApp.getActiveSpreadsheet();
 
  definitions.forEach(def => {
    let sheet = ss.getSheetByName(def.name);
    // シートがなければ作成
    if (!sheet) sheet = ss.insertSheet(def.name);
   
    // ヘッダー行(1行目)を設定
    sheet.getRange(1, 1, 1, def.headers.length)
         .setValues([def.headers])
         .setFontWeight('bold')
         .setBackground('#f3f3f3')
         .setBorder(true, true, true, true, true, true);
  });
 
  Browser.msgBox("全てのシート準備が完了しました！\n※既存データがある場合、列の並びがズレていないか確認してください。");
 }
 
 
 // ==============================================================================
 // ▼▼▼ 3. 共通ヘルパー関数 (読み書き削除の処理を共通化) ▼▼▼
 // ==============================================================================
 
 // データを取得する共通関数
 // データを取得する共通関数 (読み込みエラー対策：Lockと範囲指定の厳格化)
 function getDataCommon(sheetName) {
   const lock = LockService.getScriptLock();
   // 読み込み時は短い待ち時間で試行
   try {
     lock.waitLock(10000); 
     const ss = SpreadsheetApp.getActiveSpreadsheet();
     const sheet = ss.getSheetByName(sheetName);
     
     // シートが無い、または完全に空の場合は空配列を返す
     if (!sheet) return [];
     const lastRow = sheet.getLastRow();
     if (lastRow < 2) return [];
 
     // データ範囲を明示的に取得
     const rawData = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
 
     return rawData.map((row, i) => {
       // 日付型があれば文字列(yyyy-MM-dd)に変換
       row = row.map(cell => {
         if (Object.prototype.toString.call(cell) === '[object Date]') {
           return Utilities.formatDate(cell, Session.getScriptTimeZone(), 'yyyy-MM-dd');
         }
         return cell;
       });
       // 行番号(rowNumber)を付与してオブジェクト化
       return { rowNumber: i + 2, data: row };
     });
   } catch (e) {
     console.error("getDataCommon Error: " + e.message);
     throw new Error("データの読み込みに失敗しました。再読み込みしてください。");
   } finally {
     lock.releaseLock();
   }
 }
 
 // データを保存(新規・編集)する共通関数
 function saveDataCommon(sheetName, dataObj) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    const row = dataObj.rowNumber ? Number(dataObj.rowNumber) : null;
    const values = dataObj.values; // 保存する配列データ
 
    if (row) {
      // 編集 (指定行を上書き)
      sheet.getRange(row, 1, 1, values.length).setValues([values]);
    } else {
      // 新規 (末尾に追加)
      sheet.appendRow(values);
    }
    return "SUCCESS";
  } catch (e) {
    return "ERROR: " + e.message;
  }
 }
 
 // 削除する共通関数
 function deleteDataCommon(sheetName, rowNumber) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    sheet.deleteRow(Number(rowNumber));
    return "SUCCESS";
  } catch (e) {
    return "ERROR: " + e.message;
  }
 }
 
 
 // ==============================================================================
 // ▼▼▼ 4. 各機能ごとの呼び出し口 (HTMLから呼ばれる関数) ▼▼▼
 // ==============================================================================
 
 
 // ---------------------------
 // A. PC機材貸し出し管理
 // ---------------------------
 function getPcData() { return getDataCommon('PC管理'); }
 function registerPc(data) {
  // registerとeditを統合的に処理
  return saveDataCommon('PC管理', {
    rowNumber: data.rowNumber,
    values: [data.pcName, data.holder, data.date, data.note]
  });
 }
 function editPc(data) { return registerPc(data); } // 共通ロジックへ
 function deletePc(row) { return deleteDataCommon('PC管理', row); }
 
 
 // ==============================================================================
 // B. スキル管理 (Member & Skills) 修正版
 // ==============================================================================
 
 function getSkillData() { return getDataCommon('スキル管理'); }
 
 function saveSkill(data) {
   const status = data.status || '募集中';
   
   // 画像データの処理:
   // URL形式(https://...)ならそのまま、Base64形式(data:image...)ならそのまま保存
   // ※今回はHTML側でBase64を送るように変更します
   const photoData = data.photoUrl; 
 
   return saveDataCommon('スキル管理', {
     rowNumber: data.rowNumber,
     values: [
       data.name,    
       data.dept,    // 役職（選択された値）
       data.skills,  // スキル（カンマ区切り文字列）
       data.studying,// 勉強中（カンマ区切り文字列）
       status,       
       data.slackId, 
       photoData,
       data.comment,
       data.mbti     // ★追加: MBTI
     ]
   });
 }
 
 function deleteSkill(row) { return deleteDataCommon('スキル管理', row); }
 
 // ステータス更新機能（修正なしでOK）
 function updateSkillStatus(rowNumber, newStatus) {
   try {
     const ss = SpreadsheetApp.getActiveSpreadsheet();
     const sheet = ss.getSheetByName('スキル管理');
     sheet.getRange(Number(rowNumber), 5).setValue(newStatus);
     return "SUCCESS";
   } catch(e) {
     return "ERROR: " + e.message;
   }
 }
 
 // uploadProfileImage 関数は、今回の「シート保存方式」では使用しません。
 // もしドライブにも残したい場合は残しておいても良いですが、表示には使いません。
 
 
 // ==============================================================================
 // C. 図書管理 (Sent. Library) - Update
 // ==============================================================================
 
 // SlackのWebhook URL (事前にSlackで発行してください)
 const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'; 
 
 function getBookData() { 
   try {
     // 共通関数を呼び出すが、失敗してもキャッチできるようにする
     const data = getDataCommon('図書管理');
     return data; 
   } catch (e) {
     // エラーが起きた場合、HTML側で処理できる形のエラーを投げる
     throw new Error("データ取得失敗: " + e.message);
   }
 }
 
 // ==============================================================================
 // C. 図書管理 (Sent. Library) - Update
 // ==============================================================================
 
 // ... (getBookDataなどはそのまま) ...
 
 // 書籍登録・編集（レビューといいね数を保護するように修正）
 function saveBook(data) {
   // 編集時(rowNumberあり)は、既存のレビューといいね数を取得して消えないようにする
   let currentReviews = '';
   let currentLikes = 0;
 
   if (data.rowNumber) {
     const ss = SpreadsheetApp.getActiveSpreadsheet();
     const sheet = ss.getSheetByName('図書管理');
     // 7列目(レビュー), 8列目(いいね) の値を取得
     const range = sheet.getRange(Number(data.rowNumber), 7, 1, 2);
     const values = range.getValues()[0];
     currentReviews = values[0];
     currentLikes = values[1];
   }
 
   // フロントから値が送られてくればそれを使い、なければ既存データ(current)を使う
   const reviewsToSave = (data.reviews !== undefined && data.reviews !== null) ? data.reviews : currentReviews;
   const likesToSave = (data.likes !== undefined && data.likes !== null) ? data.likes : currentLikes;
 
   return saveDataCommon('図書管理', {
     rowNumber: data.rowNumber,
     values: [
       data.title,
       data.type,      // 書籍 or PDF
       data.location,  // PDFならDrive URL、紙なら場所
       data.status,    // "貸出可" or "貸出中: 霍"
       data.imageUrl,  // 表紙画像
       data.isbn,      // ISBNコード
       reviewsToSave,  // ★修正: 既存レビューを保持
       likesToSave,    // ★修正: 既存いいねを保持
       data.registrant
     ]
   });
 }
 
 // ... (deleteBook以降はそのまま) ...
 
 function deleteBook(row) { return deleteDataCommon('図書管理', row); }
 
 // ▼▼▼ 追加機能: 貸出・返却・レビュー ▼▼▼
 
 // 1クリック貸出処理
 function borrowBookAction(rowNumber, bookTitle, userName) {
   const ss = SpreadsheetApp.getActiveSpreadsheet();
   const sheet = ss.getSheetByName('図書管理');
   
   // 4列目(所持者/状態)を更新
   const statusCell = sheet.getRange(Number(rowNumber), 4);
   const currentStatus = statusCell.getValue();
   
   if (currentStatus.includes('貸出中')) {
     return "ALREADY_BORROWED";
   }
 
   const newStatus = `貸出中: ${userName}`;
   statusCell.setValue(newStatus);
 
   // Slack通知
   sendSlackMessage(`📚 *図書貸出通知*\n${userName} さんが『${bookTitle}』を借りました！\n感想が楽しみですね！`);
   
   return "SUCCESS";
 }
 
 // 返却処理
 function returnBookAction(rowNumber, bookTitle, userName) {
   const ss = SpreadsheetApp.getActiveSpreadsheet();
   const sheet = ss.getSheetByName('図書管理');
   sheet.getRange(Number(rowNumber), 4).setValue('貸出可');
   
   sendSlackMessage(`↩️ *図書返却通知*\n${userName} さんが『${bookTitle}』を返却しました。`);
   return "SUCCESS";
 }
 
 // レビュー投稿
 function addBookReview(rowNumber, rating, comment, userName) {
   const ss = SpreadsheetApp.getActiveSpreadsheet();
   const sheet = ss.getSheetByName('図書管理');
   const cell = sheet.getRange(Number(rowNumber), 7); // 7列目: レビュー
   
   let currentReviews = cell.getValue();
   // 簡易的に追記していくスタイル
   const newReview = `[${rating}] ${comment} (by ${userName})\n`;
   
   cell.setValue(currentReviews + newReview);
   return "SUCCESS";
 }
 
 // ▼▼▼ 追加: レビュー削除機能 ▼▼▼
 function deleteBookReview(rowNumber, reviewIndex) {
   try {
     const ss = SpreadsheetApp.getActiveSpreadsheet();
     const sheet = ss.getSheetByName('図書管理');
     const cell = sheet.getRange(Number(rowNumber), 7); // 7列目がレビュー
     let val = cell.getValue();
     
     if (!val) return "SUCCESS"; // 既に空なら何もしない
 
     // 改行で区切って配列化（空行は無視）
     let reviews = val.toString().split('\n').filter(line => line.trim() !== "");
     
     // 指定されたインデックスのレビューを削除
     if (reviewIndex >= 0 && reviewIndex < reviews.length) {
       reviews.splice(reviewIndex, 1);
     }
     
     // 再結合して保存（末尾に改行を付与）
     const newVal = reviews.length > 0 ? reviews.join('\n') + '\n' : "";
     cell.setValue(newVal);
     
     return "SUCCESS";
   } catch (e) {
     return "ERROR: " + e.message;
   }
 }
 
 // Slack通知送信関数
 function sendSlackMessage(text) {
   if (!SLACK_WEBHOOK_URL || SLACK_WEBHOOK_URL.includes('YOUR')) return; // 設定なければスキップ
   
   const payload = {
     username: "Sent. Library Bot",
     icon_emoji: ":books:",
     text: text
   };
   
   try {
     UrlFetchApp.fetch(SLACK_WEBHOOK_URL, {
       method: "post",
       contentType: "application/json",
       payload: JSON.stringify(payload)
     });
   } catch (e) {
     console.log("Slack Error: " + e.message);
   }
 }
 
 // ▼▼▼ リクエスト本機能 (Update) ▼▼▼
 
 function getRequestData() {
   try {
     // 列が増えたので全データを取得して返す
     return getDataCommon('リクエスト本');
   } catch (e) {
     throw new Error("リクエストデータの取得失敗: " + e.message);
   }
 }
 
 // リクエストの保存（新規・編集対応）
 function saveRequest(data) {
   const lock = LockService.getScriptLock();
   try {
     lock.tryLock(5000); // 保存時は少し長く待つ
 
     let currentLikes = 0;
     // 編集時(rowNumberあり)は既存のいいね数を維持
     if (data.rowNumber) {
       const ss = SpreadsheetApp.getActiveSpreadsheet();
       const sheet = ss.getSheetByName('リクエスト本');
       // 4列目(いいね数)を取得
       const val = sheet.getRange(Number(data.rowNumber), 4).getValue();
       currentLikes = (val && !isNaN(val)) ? val : 0;
     }
     
     // データ保存実行
     return saveDataCommon('リクエスト本', {
       rowNumber: data.rowNumber,
       values: [
         data.title,
         data.url,
         data.requester,
         currentLikes, // 既存のいいね数をセット
         '申請中',     // ステータスは申請中で固定
         data.reason,
         data.imageUrl,
         data.isbn
       ]
     });
   } catch (e) {
     return "ERROR: " + e.message;
   } finally {
     lock.releaseLock();
   }
 }
 
 // ★追加: リクエストの削除機能
 function deleteRequest(row) {
   return deleteDataCommon('リクエスト本', row);
 }
 
 function addLikeToRequest(rowNumber) {
   try {
     const ss = SpreadsheetApp.getActiveSpreadsheet();
     const sheet = ss.getSheetByName('リクエスト本');
     const cell = sheet.getRange(Number(rowNumber), 4);
     let val = cell.getValue();
     if (!val || isNaN(val)) val = 0;
     cell.setValue(val + 1);
     return "SUCCESS";
   } catch (e) {
     return "ERROR: " + e.message;
   }
 }
 
 // ▼▼▼ 追加: 購入完了処理（リクエスト→図書への移行） ▼▼▼
 function promoteRequestToBook(requestRowNumber, bookData) {
   try {
     // 1. 図書管理シートに保存 (saveBook相当の処理)
     const res = saveDataCommon('図書管理', {
       rowNumber: null, // 新規作成扱い
       values: [
         bookData.title,
         bookData.type,
         bookData.location,
         bookData.status,
         bookData.imageUrl,
         bookData.isbn,
         '', // レビュー初期値
         0,  // いいね初期値
         bookData.registrant
       ]
     });
 
     if (res.startsWith("ERROR")) return res;
 
     // 2. リクエストシートから該当行を削除
     const delRes = deleteDataCommon('リクエスト本', requestRowNumber);
     if (delRes.startsWith("ERROR")) return "BOOK_SAVED_BUT_DELETE_FAILED: " + delRes;
 
     return "SUCCESS";
   } catch (e) {
     return "ERROR: " + e.message;
   }
 }
 
 // ▼▼▼ 修正: 削除処理 (エラーハンドリング追加) ▼▼▼
 function deleteBook(row) {
   try {
     // 共通削除関数を呼び出す
     const result = deleteDataCommon('図書管理', row);
     if (result.startsWith("ERROR")) {
       throw new Error(result);
     }
     return "SUCCESS";
   } catch (e) {
     throw new Error("削除に失敗しました: " + e.message);
   }
 }
 
 
 
 
 // ---------------------------
 // D. クレーム＆ヒヤリハット
 // ---------------------------
 function getIncidentData() { return getDataCommon('ヒヤリハット'); }
 
 function saveIncident(data) {
   // ステータスが空なら初期値「未対応」を入れる
   const status = data.status || '未対応';
   
   return saveDataCommon('ヒヤリハット', {
     rowNumber: data.rowNumber,
     values: [
       data.date,
       data.type,
       data.title,
       data.fact,     // 事実
       data.cause,    // 原因
       data.measure,  // 対策
       status,        // ステータス (未対応/対応中/解決済)
       data.kaizen,   // 改善効果
       data.reporter
     ]
   });
 }
 
 function deleteIncident(row) { return deleteDataCommon('ヒヤリハット', row); }
 
 // ---------------------------
 // E. イベント履歴
 // ---------------------------
 function getEventData() { return getDataCommon('イベント履歴'); }
 
 function saveEvent(data) {
   // 画像がない場合のデフォルト処理などはHTML側あるいは運用でカバー
   return saveDataCommon('イベント履歴', {
     rowNumber: data.rowNumber,
     values: [
       data.date,       // 開催日
       data.name,       // イベント名
       data.location,   // 場所
       data.count,      // 参加人数
       data.albumUrl,   // Googleフォトなどのアルバムリンク
       data.thumbUrl,   // ★追加: フィード表示用の表紙画像URL
       data.docUrl,     // ★追加: Notionなどの資料URL
       data.members,     // ★追加: 参加メンバー（カンマ区切りテキスト）
     ]
   });
 }
 
 function deleteEvent(row) { return deleteDataCommon('イベント履歴', row); }
 
 
 